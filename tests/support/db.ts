import { prisma } from "@/lib/db";

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "password_reset_tokens", "recovery_codes", "sessions", "users" CASCADE',
  );
}
