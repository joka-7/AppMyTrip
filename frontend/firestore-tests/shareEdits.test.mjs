// Rules for the optional edit link: an editor's write is accepted only in one
// batch with a fresh, write-only shareEdits receipt carrying the edit token
// (see ../firestore.rules).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { inOneHour, openTestDb, sha256Hex, share } from "./testEnv.mjs";

let env;
let db;
before(async () => ({ env, db } = await openTestDb()));
after(() => env.cleanup());

const id22 = (c) => c.repeat(22);

/** One editor save: the receipt plus the new ciphertext, with extra share fields if given. */
function edit(shareId, token, nonce, extra = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, "shareEdits", `${shareId}_${nonce}`), {
    shareId,
    token,
    expiresAt: inOneHour(),
  });
  batch.update(doc(db, "sharedTrips", shareId), {
    ciphertext: "c-edit",
    iv: "i-edit",
    writeNonce: nonce,
    updatedAt: serverTimestamp(),
    ...extra,
  });
  return batch.commit();
}

describe("a share with an edit link", () => {
  const S = id22("a");
  const ref = () => doc(db, "sharedTrips", S);

  before(() => assertSucceeds(setDoc(ref(), share("own1", { editTokenHash: sha256Hex("edit1") }))));

  it("lets an editor save, and viewers then see the edit", async () => {
    await assertSucceeds(edit(S, "edit1", id22("n")));
    const snap = await assertSucceeds(getDoc(ref()));
    assert.equal(snap.data().ciphertext, "c-edit");
  });

  for (const [label, attempt] of [
    ["a wrong edit token", () => edit(S, "nope", id22("m"))],
    [
      "replaying an old receipt's nonce",
      () =>
        updateDoc(ref(), {
          ciphertext: "evil",
          iv: "x",
          writeNonce: id22("n"),
          updatedAt: serverTimestamp(),
        }),
    ],
    [
      "changing content with no receipt",
      () =>
        updateDoc(ref(), {
          ciphertext: "evil",
          iv: "x",
          writeNonce: id22("q"),
          updatedAt: serverTimestamp(),
        }),
    ],
    [
      "an editor changing the expiry",
      () => edit(S, "edit1", id22("r"), { expiresAt: Timestamp.fromMillis(1) }),
    ],
    [
      "an editor removing the edit link",
      () => edit(S, "edit1", id22("s"), { editTokenHash: deleteField() }),
    ],
    ["reading a receipt", () => getDoc(doc(db, "shareEdits", `${S}_${id22("n")}`))],
    [
      "a receipt filed under another share's id",
      () =>
        setDoc(doc(db, "shareEdits", `${id22("z")}_${id22("t")}`), {
          shareId: S,
          token: "edit1",
          expiresAt: inOneHour(),
        }),
    ],
  ]) {
    it(`denies ${label}`, () => assertFails(attempt()));
  }

  it("lets the owner keep the edit link, then turn it off, which stops the old token", async () => {
    await assertSucceeds(
      setDoc(ref(), { ...share("own2", { editTokenHash: sha256Hex("edit1") }), proof: "own1" }),
    );
    await assertSucceeds(setDoc(ref(), { ...share("own3"), proof: "own2" }));
    await assertFails(edit(S, "edit1", id22("u")));
  });
});

describe("a share without an edit link", () => {
  it("denies every edit", async () => {
    const S = id22("b");
    await assertSucceeds(setDoc(doc(db, "sharedTrips", S), share("o")));
    await assertFails(edit(S, "anything", id22("v")));
  });
});

describe("a revoked share", () => {
  const S = id22("c");
  const ref = () => doc(db, "sharedTrips", S);
  const revoked = (extra = {}) => ({
    ...share("o2", { ciphertext: "", iv: "", revoked: true, ...extra }),
    proof: "o1",
  });

  before(() => assertSucceeds(setDoc(ref(), share("o1", { editTokenHash: sha256Hex("e3") }))));

  it("must drop its edit link", () =>
    assertFails(setDoc(ref(), revoked({ editTokenHash: sha256Hex("e3") }))));

  it("accepts no edits once revoked", async () => {
    await assertSucceeds(setDoc(ref(), revoked()));
    await assertFails(edit(S, "e3", id22("w")));
  });
});
