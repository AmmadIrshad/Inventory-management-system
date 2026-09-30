import { prisma } from "@/lib/db";

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "rate_limits", "oauth_accounts", "email_verification_tokens",
      "password_reset_tokens", "recovery_codes", "sessions", "users" CASCADE`,
  );
}
