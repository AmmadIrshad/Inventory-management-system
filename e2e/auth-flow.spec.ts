// Clicks through every branch of the phase-one flow in a real browser, reading emails
// from Mailpit.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
const PASSWORD = "correct-horse-battery-staple-lantern";
const NEW_PASSWORD = "violet-harbor-quantum-pickle-44";

function totpCode(secret: string, stepsAhead = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 }).generate({
    timestamp: Date.now() + stepsAhead * 30_000,
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Waits until `count` messages to `email` match `subject`, then returns the newest. */
async function latestEmail(request: APIRequestContext, email: string, subject: string, count = 1) {
  let newestId: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${email}" subject:"${subject}"` },
        });
        const messages: { ID: string }[] = (await response.json()).messages ?? [];
        newestId = messages[0]?.ID; // Mailpit lists newest first
        return messages.length;
      },
      { timeout: 15_000, message: `${count} × "${subject}" should arrive in Mailpit` },
    )
    .toBeGreaterThanOrEqual(count);
  return (await request.get(`${MAILPIT_URL}/api/v1/message/${newestId}`)).json();
}

function linkIn(message: { Text: string }, path: string): string {
  const link = String(message.Text).match(new RegExp(`https?://\\S+${path}\\?token=\\S+`))?.[0];
  expect(link, `email should contain a ${path} link`).toBeTruthy();
  return link!;
}

test("sign-up, email verification, 2FA, recovery code and password reset", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  let secret = "";
  let recoveryCodes: string[] = [];
  // Catches hydration and invalid-HTML-nesting errors (reported in detail by `next dev`).
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`${page.url()}: ${error.message}`));

  await test.step("sign up: weak password rejected, strong one → check your inbox", async () => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Playwright Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await expect(page.getByText("Strength:")).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("#password-errors")).toBeVisible();

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Check your inbox/)).toBeVisible();
  });

  await test.step("unverified accounts can't sign in; the emailed link verifies", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page.getByText(/Please verify your email address first/)).toBeVisible();

    // The sign-in attempt re-sent the link (email #2), which replaced the first one.
    const message = await latestEmail(request, email, "Verify your email", 2);
    await page.goto(linkIn(message, "/verify-email"));
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await page.getByRole("button", { name: "Verify email address" }).click();
    await expect(page).toHaveURL(/\/login\?notice=email-verified$/);

    await signIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/$/);
  });

  await test.step("turn on 2FA and receive recovery codes", async () => {
    await page.getByRole("link", { name: "Turn on 2FA" }).click();
    await page.getByRole("button", { name: "Set up authenticator app" }).click();
    await expect(page).toHaveURL(/\/settings\/security\/two-factor$/);
    await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
    secret = (await page.locator("code").innerText()).replace(/\s+/g, "");

    await page.getByLabel("Verification code").fill(totpCode(secret));
    await page.getByRole("button", { name: "Turn on 2FA" }).click();
    await expect(page.getByText("Two-factor authentication is on.")).toBeVisible();
    recoveryCodes = await page.locator("ol li").allInnerTexts();
    expect(recoveryCodes).toHaveLength(10);

    await page.getByRole("link", { name: /saved my codes/ }).click();
    await expect(page.getByText("Two-factor authentication is on.")).toBeVisible();
    await signOut(page);
  });

  await test.step("2FA step takes only the authenticator code: wrong loops back, correct reaches home", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/login\/two-factor$/);
    await page.goto("/");
    await expect(page, "home is off-limits until the second factor").toHaveURL(/\/login\/two-factor$/);

    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("That code didn't work. 4 attempts left.")).toBeVisible();

    // The enrollment already used the current time-step, so use the next one.
    await page.getByLabel("Authentication code").fill(totpCode(secret, 1));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Welcome, Playwright Tester" })).toBeVisible();
    await signOut(page);
  });

  await test.step("lost authenticator: a recovery code turns 2FA off and signs in", async () => {
    await signIn(page, email, PASSWORD);
    await page.getByRole("link", { name: "Use a recovery code" }).click();
    await expect(page).toHaveURL(/\/login\/recovery$/);

    await page.getByLabel("Recovery code").fill(recoveryCodes[0]);
    await page.getByRole("button", { name: "Turn off 2FA and sign in" }).click();
    await expect(page).toHaveURL(/\/\?notice=two-factor-removed$/);
    await expect(page.getByText("Two-factor authentication is off.")).toBeVisible();
    await latestEmail(request, email, "Two-factor authentication was turned off");
    await signOut(page);
  });

  await test.step("creds wrong → forgot password → email → weak then strong new password", async () => {
    await signIn(page, email, "not-my-password");
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await page.getByRole("alert").getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/we've emailed a link/)).toBeVisible();

    const resetLink = linkIn(await latestEmail(request, email, "Reset your Inventory password"), "/reset-password");
    await page.goto(resetLink);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm new password").fill("password123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator("#password-errors")).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page).toHaveURL(/\/login\?notice=password-reset$/);
    await expect(page.getByText("Your password has been changed.")).toBeVisible();
    await latestEmail(request, email, "Your Inventory password was changed");

    await page.goto(resetLink);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  await test.step("user enters new credentials → home", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Welcome, Playwright Tester" })).toBeVisible();
  });

  await test.step("signing up again with the same email reveals nothing", async () => {
    await signOut(page);
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("another-long-unguessable-passphrase-7");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Check your inbox/)).toBeVisible();
    await latestEmail(request, email, "You already have an Inventory account");
  });

  expect(consoleErrors, "the browser console should stay clean").toEqual([]);
});
