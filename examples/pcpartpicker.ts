import anchorBrowser from "anchorbrowser";

const anchorClient = new anchorBrowser();

const sessionId = process.env.ANCHOR_SESSION_ID || "";

// All inputs must have ANCHOR_ prefix
const INPUTS = {
  loginUrl:
    process.env.ANCHOR_LOGIN_URL || "https://pcpartpicker.com/accounts/login/",
  changePasswordUrl:
    process.env.ANCHOR_CHANGE_PASSWORD_URL ||
    "https://pcpartpicker.com/accounts/password/change/",
  // Accept common fallbacks while retaining ANCHOR_ prefix
  username:
    process.env.ANCHOR_USERNAME ||
    process.env.ANCHOR_LOGIN ||
    process.env.ANCHOR_EMAIL,
  oldPassword: process.env.ANCHOR_OLD_PASSWORD || process.env.ANCHOR_PASSWORD,
  newPassword: process.env.ANCHOR_NEW_PASSWORD,
};

async function getAnchorBrowser() {
  if (sessionId) {
    return await anchorClient.browser.connect(sessionId);
  }
  return await anchorClient.browser.create();
}

// Helper: robust navigation with tolerance to slower loads
async function safeGoto(page: any, url: string, waitMs = 25000) {
  console.log(`[nav] goto ${url}`);
  try {
    await page.goto(url, { waitUntil: "load", timeout: waitMs });
  } catch (err) {
    console.error(`[warn] page.goto error: ${String(err)}`);
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    } catch {}
  }
}

async function waitForVisible(page: any, selector: string, timeout = 20000) {
  console.log(`[wait] visible ${selector}`);
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}

function listMissingInputs(): string[] {
  const missing: string[] = [];

  if (!INPUTS.username)
    missing.push("ANCHOR_USERNAME (or ANCHOR_LOGIN / ANCHOR_EMAIL)");

  if (!INPUTS.oldPassword)
    missing.push("ANCHOR_PASSWORD (or ANCHOR_OLD_PASSWORD)");

  if (!INPUTS.newPassword) missing.push("ANCHOR_NEW_PASSWORD");

  return missing;
}

export default async function pcppChangePasswordTask() {
  const browser = await getAnchorBrowser();
  const page = browser.contexts()[0].pages()[0];

  // Improved input validation with explicit missing list
  const missing = listMissingInputs();
  if (missing.length) {
    const msg = `Missing required inputs: ${missing.join(", ")}`;
    console.error(msg);
    return { success: false, message: msg };
  }

  try {
    // Step 1: Login
    await safeGoto(page, INPUTS.loginUrl);

    // Form resiliency: check for known login fields
    const loginFormSel = 'form[action="/accounts/login/"]';
    const userSel = '#id_username, input[name="username"], input#id_login';
    const passSel = '#id_password, input[name="password"]';
    const submitSel =
      '#form_submit, form[action="/accounts/login/"] button[type="submit"], form[action="/accounts/login/"] input[type="submit"]';
    await waitForVisible(page, loginFormSel);
    await waitForVisible(page, userSel);
    await waitForVisible(page, passSel);

    console.log("[action] fill username");
    await page
      .locator(userSel)
      .first()
      .fill(INPUTS.username || "");

    console.log("[action] fill password");
    await page
      .locator(passSel)
      .first()
      .fill(INPUTS.oldPassword || "");

    console.log("[action] submit login");
    await Promise.all([
      page
        .waitForLoadState("load", { timeout: 25000 })
        .catch((err) =>
          console.error(`[warn] load wait after login: ${String(err)}`)
        ),
      page.locator(submitSel).first().click(),
    ]);

    // Verify login success (look for logout link or account menu)
    const loggedIn = await page
      .locator('a[href="/accounts/logout/"]')
      .first()
      .isVisible()
      .catch(() => false);

    const stillOnLogin = await page
      .locator(loginFormSel)
      .first()
      .isVisible()
      .catch(() => false);

    console.log(
      `[state] After login: url=${page.url()} loggedIn=${loggedIn} stillOnLogin=${stillOnLogin}`
    );

    if (!loggedIn && stillOnLogin) {
      const msg =
        "Login appears to have failed: login form still visible after submit.";
      console.error(msg);
      return { success: false, message: msg };
    }

    // Step 2: Navigate to Change Password page
    await safeGoto(page, INPUTS.changePasswordUrl);
    const oldPassSel = '#id_old_password, input[name="old_password"]';
    const newPass1Sel =
      '#id_new_password1, input[name="new_password1"], input[name="new_password"]';
    const newPass2Sel =
      '#id_new_password2, input[name="new_password2"], input[name="new_password_confirm"]';
    await waitForVisible(page, oldPassSel);
    await waitForVisible(page, newPass1Sel);
    await waitForVisible(page, newPass2Sel);

    console.log("[action] fill old password");
    await page
      .locator(oldPassSel)
      .first()
      .fill(INPUTS.oldPassword || "");
    console.log("[action] fill new password");

    await page
      .locator(newPass1Sel)
      .first()
      .fill(INPUTS.newPassword || "");
    console.log("[action] confirm new password");

    await page
      .locator(newPass2Sel)
      .first()
      .fill(INPUTS.newPassword || "");
    console.log("[action] submit change password");

    const changeBtnSel =
      'input.button[type="submit"][value="Change Password"], form[action*="/accounts/password/change/"] [type="submit"]';
    await Promise.all([
      page
        .waitForLoadState("load", { timeout: 25000 })
        .catch((err) =>
          console.error(`[warn] load wait after change submit: ${String(err)}`)
        ),
      page.locator(changeBtnSel).first().click(),
    ]);

    // Step 3: Verify success
    const url = page.url();
    const successUrl = url.includes("/accounts/password/change/done/");
    const successTextVisible = await page
      .locator("text=Your password has been changed.")
      .first()
      .isVisible()
      .catch(() => false);

    if (successUrl || successTextVisible) {
      const msg = "Password changed successfully.";
      console.info(msg);
      return { success: true, message: msg };
    }

    const msg =
      "Password change may have failed: success URL or confirmation text not detected.";
    console.error(msg);

    return { success: false, message: msg };
  } catch (error) {
    const msg = `Unhandled error in flow: ${String(error)}`;
    console.error(msg);
    return { success: false, message: msg };
  }
}
