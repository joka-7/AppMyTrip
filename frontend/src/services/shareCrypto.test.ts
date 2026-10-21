import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  ShareCryptoError,
  decryptJson,
  encryptJson,
  fromBase64Url,
  generateOwnerToken,
  generateShareKey,
  sha256Hex,
  toBase64Url,
} from "./shareCrypto";

describe("base64url", () => {
  it.each([[[]], [[0]], [[255, 254, 253]], [[0, 1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]]])(
    "round-trips %j without +, / or padding",
    (bytes) => {
      const encoded = toBase64Url(Uint8Array.from(bytes));
      expect(encoded).not.toMatch(/[+/=]/);
      expect([...fromBase64Url(encoded)]).toEqual(bytes);
    },
  );

  it("rejects text outside the base64url alphabet", () => {
    expect(() => fromBase64Url("a+b/")).toThrow(ShareCryptoError);
  });
});

describe("generateShareKey / generateOwnerToken", () => {
  it("produce distinct 256-bit values", () => {
    const keys = new Set(Array.from({ length: 20 }, generateShareKey));
    expect(keys.size).toBe(20);
    expect(fromBase64Url(generateShareKey())).toHaveLength(32);
    expect(fromBase64Url(generateOwnerToken())).toHaveLength(32);
  });
});

describe("sha256Hex", () => {
  // Firestore rules compare against hashing.sha256(token).toHexString().lower();
  // these digests contain bytes that base64 would encode as + and /, which is
  // the exact case the rules engine's URL-safe toBase64() never matched.
  it.each(["a", "t2", "hello", "Zx9_-abcDEF0123456789"])(
    "matches Node's digest for %j",
    async (text) => {
      expect(await sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
    },
  );
});

describe("encryptJson / decryptJson", () => {
  const trip = { title: "טיול לרומא", days: [{ dayNum: 1, activities: [] }] };

  it("round-trips the value and never puts plaintext in the ciphertext", async () => {
    const key = generateShareKey();
    const payload = await encryptJson(trip, key);
    expect(payload.ciphertext).not.toContain("Rome");
    expect(atob(payload.ciphertext.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("title");
    expect(await decryptJson(payload, key)).toEqual(trip);
  });

  it("uses a fresh IV for every encryption with the same key", async () => {
    const key = generateShareKey();
    const a = await encryptJson(trip, key);
    const b = await encryptJson(trip, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it.each([
    [
      "a wrong key",
      async (key: string) => ({ ...(await encryptJson(trip, key)), key: generateShareKey() }),
    ],
    [
      "tampered ciphertext",
      async (key: string) => {
        const payload = await encryptJson(trip, key);
        const bytes = fromBase64Url(payload.ciphertext);
        bytes[0] ^= 1;
        return { ...payload, ciphertext: toBase64Url(bytes), key };
      },
    ],
  ])("fails loudly on %s", async (_name, build) => {
    const { key, ...payload } = await build(generateShareKey());
    await expect(decryptJson(payload, key)).rejects.toBeInstanceOf(ShareCryptoError);
  });

  it("rejects a key of the wrong length", async () => {
    await expect(encryptJson(trip, toBase64Url(new Uint8Array(16)))).rejects.toBeInstanceOf(
      ShareCryptoError,
    );
  });
});
