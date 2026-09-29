import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateToken, sha256 } from "@/lib/crypto";

describe("encrypt / decrypt", () => {
  it("round-trips a secret", () => {
    const payload = encrypt("JBSWY3DPEHPK3PXP");
    expect(payload).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decrypt(payload)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, ciphertext, tag] = encrypt("secret").split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decrypt([version, iv, flipped.toString("base64url"), tag].join("."))).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("not-encrypted")).toThrow("Malformed");
  });
});

describe("tokens and hashing", () => {
  it("generates unique URL-safe tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
