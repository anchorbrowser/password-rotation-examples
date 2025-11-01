import anchorBrowser from 'anchorbrowser';
/*
Task:
- Login to Fandom (community.fandom.com) with provided username/password
- Navigate to Special:ChangePassword (redirects to auth.fandom.com settings)
- Enter new password and submit
- Logout via Special:UserLogout
Analysis of human recording workflow and selectors (from provided execution logs):
- Login form (auth.fandom.com/signin):
  - Username: input#identifier.wds-input__field[data-test="signin-username-field"]
  - Password: input#password.wds-input__field[data-test="signin-password-field"]
  - Submit: button#method.wds-button[data-test="signin-password-submit"] (text: SIGN IN)
- Change Password (auth.fandom.com/auth/settings - reached via Special:ChangePassword redirect):
  - New password: input#password.wds-input__field[data-test="settings-password-field"]
  - Submit button was not captured in logs; to avoid brittle guessing, we submit via pressing Enter in the password field after filling it.
- Logout (community.fandom.com/wiki/Special:UserLogout):
  - Confirm button: input.wds-button[type="submit"][value="Confirm"]
Loop/Redundancy detected in human recording:
- After entering a new password field on settings, the flow navigated back to signin and repeated login. We'll handle this deterministically by detecting a re-auth (signin) screen and logging in again using the NEW password.
Optimizations:
- Direct navigation with waitUntil: 'load'.
- Deterministic waits using waitForSelector() only (no waitForTimeout, no waitForLoadState).
- Specific selectors from logs. Use .first() where multiple matches could exist.
- Robust branching for redirects between community.fandom.com and auth.fandom.com domains.
- Clear step-by-step logging, error handling, and early exits with helpful messages.
*/
const anchorClient = new anchorBrowser();
const sessionId = process.env.ANCHOR_SESSION_ID || '';
const INPUTS = {
  baseUrl: process.env.ANCHOR_FANDOM_BASE_URL || 'https://community.fandom.com',
  username: process.env.ANCHOR_FANDOM_USERNAME, // required
  password: process.env.ANCHOR_FANDOM_PASSWORD, // required (current password)
  newPassword: process.env.ANCHOR_FANDOM_NEW_PASSWORD, // required
};
async function getAnchorBrowser() {
  if (sessionId) return await anchorClient.browser.connect(sessionId);
  return await anchorClient.browser.create();
}
// Selectors (sourced from execution logs) - kept specific and deterministic
const SEL = {
  // Sign in (auth.fandom.com/signin)
  signinUsername: 'input#identifier.wds-input__field[data-test="signin-username-field"]',
  signinPassword: 'input#password.wds-input__field[data-test="signin-password-field"]',
  signinSubmit: 'button#method.wds-button[data-test="signin-password-submit"]',
  // Settings change password (auth.fandom.com/auth/settings)
  settingsNewPassword: 'input#password.wds-input__field[data-test="settings-password-field"]',
  // Logout confirmation (community.fandom.com/wiki/Special:UserLogout)
  logoutConfirm: 'input.wds-button[type="submit"][value="Confirm"]',
};
function buildUrls(baseUrl: string) {
  return {
    loginUrl: `${baseUrl.replace(/\/$/, '')}/wiki/Special:UserLogin`,
    changePasswordUrl: `${baseUrl.replace(/\/$/, '')}/wiki/Special:ChangePassword`,
    logoutUrl: `${baseUrl.replace(/\/$/, '')}/wiki/Special:UserLogout`,
  };
}
async function safeClick(page: any, selector: string, description: string) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible' });
  console.log(`Click: ${description} -> ${selector}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}), // distinguish between no-nav clicks and redirecting clicks
    locator.click({ delay: 50 }),
  ]);
}
async function signIn(page: any, username: string, password: string) {
  // Wait for login form controls (auth.fandom.com)
  await page.waitForSelector(SEL.signinUsername, { state: 'visible' });
  await page.locator(SEL.signinUsername).first().click();
  await page.locator(SEL.signinUsername).first().fill(username, { timeout: 15000 });
  await page.locator(SEL.signinPassword).first().click();
  await page.locator(SEL.signinPassword).first().fill(password);
  // Submit and wait for the redirect
  console.log('Submitting sign-in form');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator(SEL.signinSubmit).first().click(),
  ]);
  console.log(`Sign-in attempted. Current URL: ${page.url()}`);
}
export default async function FandomChangePasswordFlow() {
  const browser = await getAnchorBrowser();
  const page = browser.contexts()[0].pages()[0];
  const { baseUrl, username, password, newPassword } = INPUTS;
  const { loginUrl, changePasswordUrl, logoutUrl } = buildUrls(baseUrl || '');
  if (!username || !password || !newPassword) {
    const msg = 'Missing required inputs: ANCHOR_FANDOM_USERNAME, ANCHOR_FANDOM_PASSWORD, ANCHOR_FANDOM_NEW_PASSWORD';
    console.error(msg);
    return { success: false, message: msg };
  }
  try {
    // STEP 1: Navigate to the login page (Special:UserLogin) -> redirects to auth.fandom.com/signin
    console.log(`Navigating to login page: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'load' });
    // In case intermediate redirects occur, wait for the auth sign-in form
    console.log('Waiting for Fandom Auth sign-in form');
    await page.waitForSelector(SEL.signinUsername, { state: 'visible' });
    // STEP 2: Perform login with current password
    console.log('Filling credentials and logging in (current password)');
    await signIn(page, username, password);
    // Heuristic: after successful login, we expect to be on community.fandom.com or redirected back there shortly
    if (!page.url().includes('community.fandom.com')) {
      console.log('Post-login URL is not on community.fandom.com; proceeding anyway as redirects may follow.');
    }
    // STEP 3: Go to Special:ChangePassword (will redirect to auth settings change password UI)
    console.log(`Navigating to change password page: ${changePasswordUrl}`);
    await page.goto(changePasswordUrl, { waitUntil: 'load' });
    // Wait for settings new password input on auth.fandom.com/auth/settings
    console.log('Waiting for settings new password field on Auth Settings page');
    await page.waitForSelector(SEL.settingsNewPassword, { state: 'visible' });
    // STEP 4: Enter new password and submit (submit via Enter to avoid relying on unknown submit button selector)
    console.log('Entering new password');
    const newPwdField = page.locator(SEL.settingsNewPassword).first();
    await newPwdField.click();
    await newPwdField.fill(newPassword);
    console.log('Submitting new password (press Enter)');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }).catch(() => {}),
      newPwdField.press('Enter'),
    ]);
    // STEP 5: Re-authentication handling
    // From logs, after submitting a new password, a fresh signin flow may be required.
    // If we see the signin form again, login using the NEW password
    try {
      await page.waitForSelector(SEL.signinUsername, { state: 'visible', timeout: 6000 });
      console.log('Re-authentication detected after password change. Signing in with NEW password.');
      await signIn(page, username, newPassword);
    } catch {
      console.log('No re-authentication form detected after password change. Proceeding to logout.');
    }
    // STEP 6: Logout via Special:UserLogout
    console.log(`Navigating to logout page: ${logoutUrl}`);
    await page.goto(logoutUrl, { waitUntil: 'load' });
    // Click the Confirm button observed in logs
    console.log('Confirming logout');
    await safeClick(page, SEL.logoutConfirm, 'Logout Confirm');
    const finalUrl = page.url();
    const outputMessage = `Password changed and logout completed. Final URL: ${finalUrl}`;
    console.info(outputMessage);
    return { success: true, message: outputMessage };
  } catch (error: any) {
    console.error(`Workflow failed: ${error?.message || error}`);
    return { success: false, message: `Workflow failed: ${error?.message || error}` };
  }
}