import "server-only";
import { randomInt } from "node:crypto";
import { sha256 } from "@/lib/crypto";

export const RECOVERY_CODE_COUNT = 10;
// No 0/o, 1/l/i to avoid transcription mistakes. 31 symbols ^ 16 chars ≈ 79 bits per code.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 16;
const GROUP_SIZE = 4;

function generateRecoveryCode(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]);
  const groups = [];
  for (let i = 0; i < CODE_LENGTH; i += GROUP_SIZE) {
    groups.push(chars.slice(i, i + GROUP_SIZE).join(""));
  }
  return groups.join("-");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Lowercases and strips separators/whitespace so users can type codes loosely. */
export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isRecoveryCodeFormat(input: string): boolean {
  const normalized = normalizeRecoveryCode(input);
  return normalized.length === CODE_LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}

export function hashRecoveryCode(code: string): string {
  return sha256(normalizeRecoveryCode(code));
}
