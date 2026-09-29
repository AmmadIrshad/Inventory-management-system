import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const CIPHER = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

/** URL-safe random token with `bytes` of entropy. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encryptionKey(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "base64");
}

/** Authenticated encryption for secrets at rest. Output: `v1.<iv>.<ciphertext>.<tag>` (base64url). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, ciphertext, tag] = payload.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
