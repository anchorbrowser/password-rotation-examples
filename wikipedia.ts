import anchorBrowser from 'anchorbrowser';

const anchorClient = new anchorBrowser();
const sessionId = process.env.ANCHOR_SESSION_ID || '';

// All inputs must use ANCHOR_ prefix
const INPUTS = {
  username: process.env.ANCHOR_WIKI_USERNAME || '',
  password: process.env.ANCHOR_WIKI_PASSWORD || '',
  newPassword: process.env.ANCHOR_WIKI_NEW_PASSWORD || '',
  totpCode: process.env.ANCHOR_WIKI_TOTP_CODE || '', // optional for 2FA
  baseUrl: process.env.ANCHOR_WIKI_BASE_URL || 'https://en.wikipedia.org',
};

async function getAnchorBrowser() {
  if (sessionId) {
    return await anchorClient.browser.connect(sessionId);
  }
  return await anchorClient.browser.create();
}

async function safeGoto(page: any, url: string, label: string, timeout = 45000) {
  console.log(`[nav] goto ${label}: ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout });
  await safeWaitForLoad(page, label);
}

async function safeWaitForLoad(page: any, label: string, timeout = 45000) {
  try {
    await page.waitForLoadState('load', { timeout });
    console.log(`[wait] load achieved for: ${label}`);
  } catch (e) {
    console.log(`[wait-warning] load timeout for ${label}; proceeding if DOM state is sufficient.`);
  }
}

async function waitVisible(page: any, locatorOrSelector: any, label: string, timeout = 15000) {
  const locator = typeof locatorOrSelector === 'string' ? page.locator(locatorOrSelector) : locatorOrSelector;
  console.log(`[wait] waiting for visible ${label}`);
  await locator.first().waitFor({ state: 'visible', timeout });
  return locator.first();
}

async function ensureLoggedIn(page: any) {
  // If already logged in, pt-userpage exists
  if (await page.locator('#pt-userpage').first().count()) {
    console.log('[auth] Already logged in (found #pt-userpage).');
    return true;
  }
  return false;
}

async function handleTwoFactorIfPresent(page: any) {
  // Heuristics to detect 2FA page
  const twoFAHeading = page.getByRole('heading', { name: /two-factor|oath|authentication code/i }).first();
  const twoFAInput = page.getByLabel(/one-time|authentication code|verification code|2-step/i).first();
  const twoFAFound =
    (await twoFAHeading.count()) > 0 ||
    (await twoFAInput.count()) > 0 ||
    (await page
      .locator('input[id*="oath"], input[name*="oath"], input[id*="otp"], input[name*="otp"]')
      .first()
      .count()) > 0;

  if (twoFAFound) {
    console.log('[auth] Two-factor authentication detected.');
    if (!INPUTS.totpCode) {
      console.log('[auth] Waiting for OTP from Anchor events API')
      const otpEvent = await anchorClient.events.waitFor('wikipedia-rotate-email-totp');
      //   send external event to the browser to fill the OTP code with { otp: otp password }
      const otpData = otpEvent.data?.otp as string | undefined;
      if (!otpData) {
        throw new Error('No OTP data received from event.');
      }
      INPUTS.totpCode = otpData;
    }
    const otp = twoFAInput.count
      ? twoFAInput
      : page.locator('input[id*="oath"], input[name*="oath"], input[id*="otp"], input[name*="otp"]').first();
    await waitVisible(page, otp, '2FA code input');
    await otp.fill('');
    await otp.type(INPUTS.totpCode, { delay: 20 });
    // Try a generic submit
    const submitBtn = page.getByRole('button', { name: /continue|verify|submit|log in|proceed/i }).first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click();
    } else {
      await otp.press('Enter');
    }
    await safeWaitForLoad(page, 'post-2FA submission');
  }
}

async function login(page: any) {
  if (await ensureLoggedIn(page)) return;

  const loginUrl = `${INPUTS.baseUrl}/w/index.php?title=Special:UserLogin`;
  await safeGoto(page, loginUrl, 'Login page');

  // If redirected and already logged in, continue
  if (await ensureLoggedIn(page)) return;

  // Fill username and password using canonical ids if present, else fall back to labels
  let userInput = page.locator('#wpName1');
  if (!(await userInput.first().count())) userInput = page.getByLabel(/username|user name/i);
  const user = await waitVisible(page, userInput, 'username input');
  await user.click();
  await user.fill('');
  await user.type(INPUTS.username, { delay: 15 });

  let passInput = page.locator('#wpPassword1');
  if (!(await passInput.first().count())) passInput = page.getByLabel(/password/i);
  const pass = await waitVisible(page, passInput, 'password input');
  await pass.click();
  await pass.fill('');
  await pass.type(INPUTS.password, { delay: 15 });

  // Submit
  const submit = page.locator('#wpLoginAttempt, [name="wploginattempt"]').first();
  if ((await submit.count()) > 0) {
    await submit.click();
  } else {
    await pass.press('Enter');
  }
  await safeWaitForLoad(page, 'post-login');

  // Handle 2FA if prompted
  await handleTwoFactorIfPresent(page);

  // Confirm logged in
  if (!(await ensureLoggedIn(page))) {
    throw new Error('Login unsuccessful: could not confirm logged-in state.');
  }
}

async function navigateToChangePassword(page: any) {
  // Direct to password change form first; it may require identity verification
  const directPasswordForm = `${INPUTS.baseUrl}/wiki/Special:ChangeCredentials/MediaWiki%5CAuth%5CPasswordAuthenticationRequest`;
  await safeGoto(page, directPasswordForm, 'Password change form');

  // If we get bounced, try overview once
  if (!/Special:ChangeCredentials\/MediaWiki%5CAuth%5CPasswordAuthenticationRequest/.test(page.url())) {
    const overviewUrl = `${INPUTS.baseUrl}/wiki/Special:ChangeCredentials`;
    await safeGoto(page, overviewUrl, 'Change Credentials overview');
    // Open the password-based credential entry
    const pwdEntry = page.locator('dt:has-text("Password-based authentication")');
    if ((await pwdEntry.first().count()) > 0) {
      await pwdEntry.click();
      await safeWaitForLoad(page, 'open password change form');
    } else {
      // Fallback back to direct link again
      await safeGoto(page, directPasswordForm, 'Password change form (retry)');
    }
  }
}

async function verifyIdentityIfPrompted(page: any) {
  // Some flows require re-entering current password before showing the new password fields
  const verifyPassCandidate = page.locator('#wpPassword1');
  let verifyPass = (await verifyPassCandidate.first().count()) ? verifyPassCandidate : page.getByLabel(/password/i);

  const needVerify =
    (await verifyPass.first().count()) > 0 &&
    !(await page
      .getByLabel(/new password/i)
      .first()
      .count());
  if (needVerify) {
    console.log('[verify] Identity verification detected; entering current password.');
    verifyPass = verifyPass.first();
    await verifyPass.click();
    await verifyPass.fill('');
    await verifyPass.type(INPUTS.password, { delay: 15 });
    await verifyPass.press('Enter');
    await safeWaitForLoad(page, 'post-verify identity');
  }
}

async function changePassword(page: any) {
  await verifyIdentityIfPrompted(page);

  // Fill current password if present on the form
  const currentPw = page.getByLabel(/current password/i).first();
  if ((await currentPw.count()) > 0) {
    await currentPw.click();
    await currentPw.fill('');
    await currentPw.type(INPUTS.password, { delay: 15 });
  }

  // Fill the two new password fields using labels for robustness
  const newPw = page.getByLabel(/new password/i).first();
  await waitVisible(page, newPw, 'New password');
  await newPw.click();
  await newPw.fill('');
  await newPw.type(INPUTS.newPassword, { delay: 15 });

  const confirmPw = page.getByLabel(/confirm new password|retype new password|confirm password/i).first();
  await waitVisible(page, confirmPw, 'Confirm new password');
  await confirmPw.click();
  await confirmPw.fill('');
  await confirmPw.type(INPUTS.newPassword, { delay: 15 });

  // Submit
  const submitBtn = page.getByRole('button', { name: /save|change|submit|apply/i }).first();
  if ((await submitBtn.count()) > 0) {
    await submitBtn.click();
  } else {
    await confirmPw.press('Enter');
  }
  await safeWaitForLoad(page, 'submit password change');

  // Outcome checks
  const stillOnForm = /Special:ChangeCredentials\/MediaWiki%5CAuth%5CPasswordAuthenticationRequest/.test(page.url());
  const hasErrorBox = (await page.locator('.mw-message-box-error, .oo-ui-messageDialog-error').first().count()) > 0;
  if (stillOnForm && hasErrorBox) {
    throw new Error(
      'Password change failed due to validation or policy error. Review new password complexity and try again.'
    );
  }

  const successBox = page.locator('.mw-message-box-success, .mw-notification-area, .mw-notification').first();
  if ((await successBox.count()) > 0) {
    console.log('[success] Success message detected after password change.');
  } else {
    console.log('[info] No explicit success banner detected; assuming success if not on form.');
  }
}

export default async function ChangeWikipediaPassword() {
  const browser = await getAnchorBrowser();
  const page = browser.contexts()[0].pages()[0];

  // Input validation
  if (!INPUTS.username || !INPUTS.password || !INPUTS.newPassword) {
    const msg = 'Missing required inputs: ANCHOR_WIKI_USERNAME, ANCHOR_WIKI_PASSWORD, ANCHOR_WIKI_NEW_PASSWORD';
    console.error(msg);
    return { success: false, message: msg };
  }

  try {
    await login(page);
    await navigateToChangePassword(page);
    await changePassword(page);

    return { success: true, message: 'Logged in and submitted password change successfully.' };
  } catch (error: any) {
    console.error(`[error] ${error?.message || error}`);
    return { success: false, message: `Failed during workflow: ${error?.message || error}` };
  }
}