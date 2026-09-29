import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id with the OWASP-recommended minimums (19 MiB memory, 2 iterations, 1 lane).
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real verification so login response times don't reveal
 * whether an email address has an account.
 */
export async function verifyAgainstDummyHash(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}
