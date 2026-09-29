// Clicks through every branch of the phase-one flowchart in a real browser.
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

async function resetLinkFromMailpit(request: APIRequestContext, email: string): Promise<string> {
  let messageId: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${email}"` } });
        messageId = (await response.json()).messages?.[0]?.ID;
        return messageId;
      },
      { timeout: 15_000, message: "password reset email should arrive in Mailpit" },
    )
    .toBeTruthy();

  const message = await (await request.get(`${MAILPIT_URL}/api/v1/message/${messageId}`)).json();
  const link = String(message.Text).match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  expect(link, "reset email should contain a link").toBeTruthy();
  return link!;
}

test("sign-up, 2FA, recovery code and password reset", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  let secret = "";
  let recoveryCodes: string[] = [];

  await test.step("sign up: weak password is rejected, strong one accepted", async () => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Playwright Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await expect(page.getByText("Strength:")).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("#password-errors")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/settings\/security\?welcome=1$/);
  });

  await test.step("enable 2FA with the authenticator and receive recovery codes", async () => {
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
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Two-factor authentication is on.")).toBeVisible();
    await signOut(page);
  });

  await test.step("creds correct → 2FA: wrong TOTP loops back, correct TOTP reaches home", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/login\/two-factor$/);
    await page.goto("/");
    await expect(page, "home is off-limits until the second factor").toHaveURL(/\/login\/two-factor$/);

    await page.getByLabel("Authentication or recovery code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("That code didn't work. 4 attempts left.")).toBeVisible();

    // The enrollment already used the current time-step, so use the next one.
    await page.getByLabel("Authentication or recovery code").fill(totpCode(secret, 1));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Welcome, Playwright Tester" })).toBeVisible();
    await signOut(page);
  });

  await test.step("recovery code → marked used → user removes 2FA → home", async () => {
    await signIn(page, email, PASSWORD);
    await page.getByLabel("Authentication or recovery code").fill(recoveryCodes[0]);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/login\/recovery-used$/);
    await expect(page.getByText(/You have 9 unused recovery codes left/)).toBeVisible();

    await page.getByRole("button", { name: "Yes, remove 2FA" }).click();
    await expect(page).toHaveURL(/\/\?notice=two-factor-removed$/);
    await expect(page.getByText("Two-factor authentication is off.")).toBeVisible();
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

    const resetLink = await resetLinkFromMailpit(request, email);
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

    await page.goto(resetLink);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  await test.step("user enters new credentials → home (2FA was removed)", async () => {
    await signIn(page, email, PASSWORD);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await signIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Welcome, Playwright Tester" })).toBeVisible();
  });
});
