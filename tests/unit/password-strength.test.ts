import { describe, expect, it } from "vitest";
import { checkPasswordStrength, PASSWORD_MIN_LENGTH } from "@/lib/password-strength";

describe("checkPasswordStrength", () => {
  it.each(["password123", "qwertyuiop", "Summer2026!", "aaaaaaaaaaaa"])("rejects %s", (password) => {
    const result = checkPasswordStrength(password);
    expect(result.isStrong).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it("requires the minimum length even for random-looking input", () => {
    const result = checkPasswordStrength("x7#Qp!2");
    expect(result.isStrong).toBe(false);
    expect(result.problems).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  });

  it("accepts a long passphrase", () => {
    expect(checkPasswordStrength("correct-horse-battery-staple-lantern").isStrong).toBe(true);
  });

  it("penalises passwords built from the user's own details", () => {
    const password = "priyasharma2026";
    expect(checkPasswordStrength(password, ["Priya Sharma", "priya.sharma@example.com"]).isStrong).toBe(false);
  });
});
