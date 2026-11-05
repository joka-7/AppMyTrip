// Shared setup for the rules tests: one emulator-backed Firestore client with
// no sign-in, which is how the app itself talks to Firestore.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { serverTimestamp, Timestamp } from "firebase/firestore";

export async function openTestDb() {
  const env = await initializeTestEnvironment({
    projectId: "demo-appmytrip",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  return { env, db: env.unauthenticatedContext().firestore() };
}

/** The lower-case hex SHA-256 the rules compare tokens against. */
export const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");

/** A valid share document owned by `ownerToken`. */
export const share = (ownerToken, extra = {}) => ({
  v: 1,
  ciphertext: "abc",
  iv: "0123456789abcdef",
  ownerTokenHash: sha256Hex(ownerToken),
  updatedAt: serverTimestamp(),
  revoked: false,
  ...extra,
});

export const inOneHour = () => Timestamp.fromMillis(Date.now() + 3600_000);
