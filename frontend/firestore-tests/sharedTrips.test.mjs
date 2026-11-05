// Rules for sharedTrips: get-only reads, schema checks on create, and the
// owner-token hash chain on update (see ../firestore.rules).
import { after, before, describe, it } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { openTestDb, share } from "./testEnv.mjs";

let env;
let db;
before(async () => ({ env, db } = await openTestDb()));
after(() => env.cleanup());

describe("reading shares", () => {
  it("allows getting one share by id", async () => {
    await assertSucceeds(setDoc(doc(db, "sharedTrips", "read1"), share("t1")));
    await assertSucceeds(getDoc(doc(db, "sharedTrips", "read1")));
  });

  for (const [label, q] of [
    ["listing the collection", () => collection(db, "sharedTrips")],
    [
      "a filtered list query",
      () =>
        query(collection(db, "sharedTrips"), where("v", "==", 1), where("revoked", "==", false)),
    ],
  ]) {
    it(`denies ${label}`, () => assertFails(getDocs(q())));
  }

  it("denies reading an expired share", async () => {
    const ref = doc(db, "sharedTrips", "expired1");
    await assertSucceeds(
      setDoc(ref, share("t", { expiresAt: Timestamp.fromMillis(Date.now() - 1000) })),
    );
    await assertFails(getDoc(ref));
  });

  it("keeps the old per-user trips closed", () =>
    assertFails(getDoc(doc(db, "users", "u", "trips", "x"))));
});

describe("creating shares", () => {
  for (const [i, [label, data]] of [
    ["an extra field", share("t", { title: "x" })],
    ["ciphertext over the size limit", share("t", { ciphertext: "a".repeat(900001) })],
    ["an already-revoked share", share("t", { revoked: true, ciphertext: "" })],
    ["a client-chosen timestamp", share("t", { updatedAt: Timestamp.fromMillis(1) })],
  ].entries()) {
    it(`denies ${label}`, () => assertFails(setDoc(doc(db, "sharedTrips", `bad${i}`), data)));
  }

  it("denies deleting a share", async () => {
    await assertSucceeds(setDoc(doc(db, "sharedTrips", "del1"), share("t")));
    await assertFails(deleteDoc(doc(db, "sharedTrips", "del1")));
  });
});

describe("owner updates", () => {
  const ref = () => doc(db, "sharedTrips", "owned1");

  before(() => assertSucceeds(setDoc(ref(), share("t1"))));

  it("denies overwriting without the owner token", () => assertFails(setDoc(ref(), share("evil"))));

  it("denies a wrong owner token", () =>
    assertFails(setDoc(ref(), { ...share("t2"), proof: "nope" })));

  it("denies keeping the same token hash", () =>
    assertFails(setDoc(ref(), { ...share("t1"), proof: "t1" })));

  it("allows the right token with a new hash", () =>
    assertSucceeds(setDoc(ref(), { ...share("t2"), ciphertext: "new", proof: "t1" })));

  it("denies replaying the old token", () =>
    assertFails(setDoc(ref(), { ...share("t3"), proof: "t1" })));

  it("denies revoking while keeping the ciphertext", () =>
    assertFails(setDoc(ref(), { ...share("t3"), revoked: true, proof: "t2" })));

  it("allows revoking, after which the share is unreadable", async () => {
    await assertSucceeds(
      setDoc(ref(), { ...share("t3"), ciphertext: "", iv: "", revoked: true, proof: "t2" }),
    );
    await assertFails(getDoc(ref()));
  });
});
