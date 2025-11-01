import anchorBrowser from 'anchorbrowser';
const anchorClient = new anchorBrowser();
const sessionId = process.env.ANCHOR_SESSION_ID || '';
// Inputs (all ANCHOR_ prefixed) - defaults are empty so pipeline can fail fast if not provided
const INPUTS = {
  baseUrl: process.env.ANCHOR_WEATHER_BASE_URL || 'https://weather.com',
  username: process.env.ANCHOR_WEATHER_EMAIL || process.env.ANCHOR_USERNAME,
  password: process.env.ANCHOR_WEATHER_PASSWORD || process.env.ANCHOR_PASSWORD,
  newPassword: process.env.ANCHOR_WEATHER_NEW_PASSWORD || process.env.ANCHOR_NEW_PASSWORD,
  currentPassword: process.env.ANCHOR_WEATHER_CURRENT_PASSWORD || process.env.ANCHOR_CURRENT_PASSWORD || '' // falls back to login password below
};
async function getAnchorBrowser() {
  if (sessionId) {
    return await anchorClient.browser.connect(sessionId);
  }
  return await anchorClient.browser.create();
}
// Utility: navigate with waitUntil 'load' and warn on timeout if URL is still correct
async function gotoWithLoad(page: any, url: string, timeout = 45000) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
  } catch (err: any) {
    const atUrl = page.url();
    if (atUrl.includes(new URL(url).hostname)) {
      console.warn(`[nav] Load timeout, but currently at ${atUrl}. Continuing.`);
    } else {
      throw err;
    }
  }
}
// Utility: wait for selector visible with error context
async function waitVisible(page: any, selector: string, timeout = 20000) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout });
    return true;
  } catch (e) {
    console.error(`[waitVisible] Timed out waiting for selector: ${selector}`);
    throw e;
  }
}
// Utility: try a click with retries
async function clickWithRetry(page: any, selector: string, attempts = 2) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.locator(selector).first().click({ timeout: 15000 });
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`[clickWithRetry] Attempt ${i + 1} failed for ${selector}. Retrying...`);
      await page.waitForTimeout(750);
    }
  }
  console.error(`[clickWithRetry] All attempts failed for ${selector}`);
  throw lastErr;
}
// Utility: fill input safely
async function fillInput(page: any, selector: string, value: string) {
  await waitVisible(page, selector);
  await page.locator(selector).first().fill('');
  await page.locator(selector).first().fill(value, { timeout: 15000 });
}
// Detect avatar presence (indicates logged-in state)
async function isLoggedIn(page: any) {
  // Selector derived from recording: span.ProfileAvatar--initial--dkm7v ProfileAvatar--defaultInitial--Jfmui
  const avatar = page.locator('span.ProfileAvatar--initial--dkm7v').first();
  try {
    return await avatar.isVisible({ timeout: 3000 });
  } catch {
    return false;
  }
}
export default async function WeatherComChangePassword() {
  const browser = await getAnchorBrowser();
  const page = browser.contexts()[0].pages()[0];
  // Normalize inputs
  const baseUrl = INPUTS.baseUrl.replace(/\/$/, '');
  const email = INPUTS.username;
  const loginPassword = INPUTS.password;
  const currentPassword = INPUTS.currentPassword || loginPassword;
  const newPassword = INPUTS.newPassword;
  if (!email || !loginPassword || !newPassword) {
    const msg = 'Missing required inputs: ANCHOR_WEATHER_EMAIL/ANCHOR_USERNAME, ANCHOR_WEATHER_PASSWORD/ANCHOR_PASSWORD, ANCHOR_WEATHER_NEW_PASSWORD/ANCHOR_NEW_PASSWORD';
    console.error(msg);
    return { success: false, message: msg };
  }
  try {
    // Step A (Recording: initial navigation to weather.com)
    console.log('[Step A] Navigate to base URL');
    await gotoWithLoad(page, `${baseUrl}/?Goto=Redirected`);
    // Step B: If not logged in, go to login and authenticate
    if (!(await isLoggedIn(page))) {
      console.log('[Step B] Not logged in. Navigating to login page.');
      await gotoWithLoad(page, `${baseUrl}/login`);
      // Recording selectors: #loginEmail and #loginPassword
      await fillInput(page, '#loginEmail', email);
      await fillInput(page, '#loginPassword', loginPassword);
      // Recording selector for Sign in button: button.Button--primary--I3yI4.MemberLoginForm--submitButton--Bz-ob[type="submit"] (data-testid="ctaButton")
      console.log('[Step B] Submit login form');
      await clickWithRetry(page, 'button.Button--primary--I3yI4.MemberLoginForm--submitButton--Bz-ob[type="submit"]');
      // Recording showed navigation back to home
      try {
        await page.waitForLoadState('load', { timeout: 30000 });
      } catch (e) {
        const atUrl = page.url();
        if (atUrl.includes('weather.com')) {
          console.warn(`[login] Load wait timed out but at ${atUrl}. Proceeding.`);
        } else {
          throw e;
        }
      }
      // Verify login by waiting for avatar
      console.log('[Step B] Verify login by checking profile avatar');
      await waitVisible(page, 'span.ProfileAvatar--initial--dkm7v', 30000);
    } else {
      console.log('[Step B] Already logged in (avatar detected).');
    }
    // Step C (Recording: Click avatar leading to Member Settings)
    console.log('[Step C] Navigate to Member Settings');
    let navigatedToSettings = false;
    try {
      await clickWithRetry(page, 'span.ProfileAvatar--initial--dkm7v');
      await page.waitForLoadState('load', { timeout: 15000 });
      if (page.url().includes('/member/settings')) {
        navigatedToSettings = true;
      }
    } catch {
      // ignore, will fallback
    }
    if (!navigatedToSettings) {
      console.log('[Step C] Fallback direct navigation to settings');
      await gotoWithLoad(page, `${baseUrl}/member/settings`);
    }
    // Step D (Recording: Click "Change password")
    // Selector from recording: button.Button--default--osTe5.Button--plainText--4mFoO.MemberProfileForm--changePasswordButton--EzOT4
    console.log('[Step D] Open Change Password dialog');
    await waitVisible(page, 'button.MemberProfileForm--changePasswordButton--EzOT4');
    await clickWithRetry(page, 'button.MemberProfileForm--changePasswordButton--EzOT4');
    // Step E (Recording: Fill current, new, and confirm password fields)
    // Current: #changePasswordCurrentPassword
    // New: #changePasswordNewPassword
    // Confirm: #changePasswordConfirmPassword
    console.log('[Step E] Fill Change Password form');
    await fillInput(page, '#changePasswordCurrentPassword', currentPassword);
    await fillInput(page, '#changePasswordNewPassword', newPassword);
    await fillInput(page, '#changePasswordConfirmPassword', newPassword);
    // Step F (Recording: Click Save)
    // Save button selector: button.Button--primary--I3yI4.MemberChangePasswordForm--submitButton--9cU6R[type="submit"]
    console.log('[Step F] Submit Change Password form');
    await clickWithRetry(page, 'button.Button--primary--I3yI4.MemberChangePasswordForm--submitButton--9cU6R[type="submit"]');
    // Step G: Verify success - wait for modal inputs to disappear (dialog closes)
    console.log('[Step G] Verify password change by waiting for dialog to close');
    let success = false;
    try {
      await page.locator('#changePasswordCurrentPassword').waitFor({ state: 'detached', timeout: 20000 });
      success = true;
    } catch (e) {
      // If not detached, check hidden state as alternative
      try {
        await page.locator('#changePasswordCurrentPassword').waitFor({ state: 'hidden', timeout: 8000 });
        success = true;
      } catch {
        success = false;
      }
    }
    if (!success) {
      // Attempt to detect inline error message if present (generic heuristic)
      const errorText = await page.locator('[class*="Error"], [data-error], .FormError').first().innerText().catch(() => 'Unknown error');
      const msg = `Password change may have failed. Dialog still present. Error hint: ${errorText}`;
      console.error(msg);
      return { success: false, message: msg };
    }
    const outputMessage = 'Password changed successfully on weather.com';
    console.info(outputMessage);
    return { success: true, message: outputMessage };
  } catch (error: any) {
    const msg = `Flow failed: ${error?.message || error}`;
    console.error(msg);
    return { success: false, message: msg };
  }
}
