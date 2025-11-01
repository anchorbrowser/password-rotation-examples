import anchorBrowser from 'anchorbrowser';
const anchorClient = new anchorBrowser();
const sessionId = process.env.ANCHOR_SESSION_ID || '';
// Inputs (use ANCHOR_ prefix)
const INPUTS = {
  // Required (no defaults)
  email: process.env.ANCHOR_EMAIL, // e.g., user@example.com
  currentPassword: process.env.ANCHOR_CURRENT_PASSWORD, // current Zillow password
  newPassword: process.env.ANCHOR_NEW_PASSWORD, // desired new password
  // Optional (safe defaults)
  startUrl: process.env.ANCHOR_START_URL || 'https://www.zillow.com/auth/user/login?entry_point=auth_ui_service_error_page&prompt=login',
  profileUrl: process.env.ANCHOR_PROFILE_URL || 'https://www.zillow.com/myzillow/profile/',
  logoutUrl: process.env.ANCHOR_LOGOUT_URL || 'https://www.zillow.com/Logout.htm',
};
async function getAnchorBrowser() {
  if (sessionId) {
    return await anchorClient.browser.connect(sessionId);
  }
  return await anchorClient.browser.create();
}
// Utility: mask secrets in logs
function maskSecret(value?: string) {
  if (!value) return '';
  const len = value.length;
  return '*'.repeat(Math.max(4, Math.min(len, 12)));
}
// Utility: robust navigation with load wait and graceful timeout handling
async function safeGoto(page: any, url: string, label: string, timeout = 30000) {
  console.log(`[NAV] ${label}: ${url}`);
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout });
    if (!resp) {
      console.log(`[NAV] ${label}: no response object returned (may still be fine).`);
      return true;
    }
    if (!resp.ok()) {
      console.error(`[NAV] ${label}: HTTP ${resp.status()} ${resp.statusText()}`);
    }
    return true;
  } catch (err: any) {
    const current = page.url();
    // Consider partial success if we at least reached the same host
    try {
      const targetHost = new URL(url).host;
      const currentHost = new URL(current).host;
      if (targetHost && currentHost && targetHost === currentHost) {
        console.log(`[NAV] ${label}: load timeout/warning but on expected host ${currentHost}. Continuing.`);
        return true;
      }
    } catch {}
    console.error(`[NAV] ${label}: failed to navigate -> ${err?.message || err}`);
    return false;
  }
}
// Utility: wait for a locator to be visible deterministically
async function expectVisible(locator: any, desc: string, timeout = 15000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (err: any) {
    console.error(`[WAIT] ${desc}: not visible within ${timeout}ms -> ${err?.message || err}`);
    return false;
  }
}
export default async function zillowChangePasswordFlow() {
  const browser = await getAnchorBrowser();
  const page = browser.contexts()[0].pages()[0];
  // Validate required inputs
  if (!INPUTS.email || !INPUTS.currentPassword || !INPUTS.newPassword) {
    const missing: string[] = [];
    if (!INPUTS.email) missing.push('ANCHOR_EMAIL');
    if (!INPUTS.currentPassword) missing.push('ANCHOR_CURRENT_PASSWORD');
    if (!INPUTS.newPassword) missing.push('ANCHOR_NEW_PASSWORD');
    const msg = `Missing required inputs: ${missing.join(', ')}`;
    console.error(msg);
    return { success: false, message: msg };
  }
  try {
    // Step 1 (Recorded: Navigated to "Sign in"): open the login page
    const ok1 = await safeGoto(page, INPUTS.startUrl, 'Open login page');
    if (!ok1) return { success: false, message: 'Failed to open login page' };
    // Step 2 (Recorded element: input[data-testid="identifier-input"], name="identifier")
    const emailInput = page.locator('input[data-testid="identifier-input"]').first();
    const emailReady = await expectVisible(emailInput, 'Email input [data-testid="identifier-input"]');
    if (!emailReady) return { success: false, message: 'Email input not available' };
    console.log(`[ACTION] Typing email (${maskSecret(INPUTS.email)}) and submitting`);
    await emailInput.fill(INPUTS.email);
    await emailInput.press('Enter'); // Continue without relying on a separate button selector
    // Step 3 (Recorded: navigated to password page, input#password visible)
    const pwdInput = page.locator('#password[data-testid="password-input"] input[type="password"]').first();
    const pwdReady = await expectVisible(pwdInput, 'Password input #password');
    if (!pwdReady) return { success: false, message: 'Password input not available' };
    console.log(`[ACTION] Typing current password (${maskSecret(INPUTS.currentPassword)}) and submitting`);
    await pwdInput.fill(INPUTS.currentPassword);
    await pwdInput.press('Enter');
    // Step 4: Go directly to profile to change password (Recorded later: navigation to /myzillow/profile)
    const ok2 = await safeGoto(page, INPUTS.profileUrl, 'Open My Profile');
    if (!ok2) return { success: false, message: 'Failed to open My Profile page' };
    // Step 5 (Recorded element: button[aria-label="Change password"]) open dialog
    const changePwdBtn = page.locator('button[aria-label="Change password"]').first();
    const changeBtnReady = await expectVisible(changePwdBtn, 'Change password button [aria-label="Change password"]');
    if (!changeBtnReady) return { success: false, message: 'Change password button not available' };
    console.log('[ACTION] Opening Change password dialog');
    await changePwdBtn.click();
    // Step 6 (Recorded inputs inside dialog)
    const currentPwdInput = page.locator('#current-password-input').first();
    const newPwdInput = page.locator('#new-password-input').first();
    const confirmPwdInput = page.locator('#confirm-password-input').first();
    const dlgInputsReady = (await expectVisible(currentPwdInput, 'Current password input #current-password-input'))
      && (await expectVisible(newPwdInput, 'New password input #new-password-input'))
      && (await expectVisible(confirmPwdInput, 'Confirm password input #confirm-password-input'));
    if (!dlgInputsReady) return { success: false, message: 'One or more password dialog inputs are not available' };
    console.log(`[ACTION] Filling current (${maskSecret(INPUTS.currentPassword)}), new (${maskSecret(INPUTS.newPassword)}), and confirm new password`);
    await currentPwdInput.fill(INPUTS.currentPassword);
    await newPwdInput.fill(INPUTS.newPassword);
    await confirmPwdInput.fill(INPUTS.newPassword);
    // Submit within the same dialog form (Recorded: button[type="submit"] text "Apply")
    const dialogForm = page.locator('form').filter({ has: currentPwdInput }).first();
    const applyBtn = dialogForm.locator('button[type="submit"]').first();
    const applyReady = await expectVisible(applyBtn, 'Apply button (type=submit) inside dialog');
    if (!applyReady) return { success: false, message: 'Apply button not available' };
    console.log('[ACTION] Submitting password change');
    await applyBtn.click();
    // Post-submit: either dialog closes or site navigates (Recorded: navigated to https://www.zillow.com/?autosignin=false)
    const passwordDialog = page.locator('section[role="dialog"]').filter({ has: currentPwdInput }).first();
    await Promise.race([
      page.waitForURL((url: any) => {
        try {
          const u = new URL(url);
          return u.host === 'www.zillow.com';
        } catch {
          return false;
        }
      }, { timeout: 15000 }).catch(() => null),
      passwordDialog.waitFor({ state: 'detached', timeout: 15000 }).catch(() => null),
    ]);
    // Step 7: Explicit logout per task
    const ok3 = await safeGoto(page, INPUTS.logoutUrl, 'Logout');
    if (!ok3) {
      console.error('Logout navigation experienced an issue, but continuing to finalize.');
    }
    const outputMessage = 'Password change flow executed and logout attempted successfully.';
    console.info(outputMessage);
    return { success: true, message: outputMessage };
  } catch (err: any) {
    const msg = `Workflow error: ${err?.message || err}`;
    console.error(msg);
    return { success: false, message: msg };
  }
}