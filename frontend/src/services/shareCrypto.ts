// End-to-end encryption for shared trip links.
//
// A shared trip is encrypted in the browser with a random AES-256-GCM key.
// Only the ciphertext is uploaded; the key travels in the link's fragment
// (`#k=...`), which browsers never send to any server. Whoever stores the
// ciphertext (Firestore, the operator) cannot read the trip.

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TOKEN_BYTES = 32;

export class ShareCryptoError extends Error {
  readonly cause: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ShareCryptoError";
    this.cause = options?.cause;
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ShareCryptoError("Not base64url.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** A fresh 256-bit key, base64url-encoded for the link fragment. */
export function generateShareKey(): string {
  return toBase64Url(randomBytes(KEY_BYTES));
}

/** A random secret that proves ownership of a share (see sha256Hex). */
export function generateOwnerToken(): string {
  return toBase64Url(randomBytes(TOKEN_BYTES));
}

/**
 * Lower-case hex SHA-256, matching Firestore rules'
 * `hashing.sha256(s).toHexString().lower()`. Not base64: the rules engine's
 * `toBase64()` emits a URL-safe alphabet, so `+`/`/` digests never matched.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importKey(key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(key);
  if (raw.length !== KEY_BYTES) throw new ShareCryptoError("Share key has the wrong length.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

/** Encrypts any JSON-serialisable value. A new IV every call, so the same key is safe to reuse. */
export async function encryptJson(value: unknown, key: string): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(key), plaintext),
  );
  return { ciphertext: toBase64Url(ciphertext), iv: toBase64Url(iv) };
}

/** Decrypts and parses. Fails loudly on a wrong key or tampered data (GCM authenticates both). */
export async function decryptJson(payload: EncryptedPayload, key: string): Promise<unknown> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(payload.iv) },
      await importKey(key),
      fromBase64Url(payload.ciphertext),
    );
  } catch (err) {
    throw new ShareCryptoError("This link's key does not open the shared trip.", { cause: err });
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}
