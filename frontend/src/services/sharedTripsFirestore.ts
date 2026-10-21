// The one thing AppMyTrip still keeps in Firestore: encrypted shared trips.
// Documents hold ciphertext only (see shareCrypto.ts and firestore.rules), and
// there is no Firebase sign-in: ownership is proven with a hashed token.
//
// The Firebase SDK is loaded on first use so it stays out of first paint.
import type { Firestore } from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "../firebase";

/** What the owner writes. `proof` is the current owner token, required on every update. */
export interface SharedTripWrite {
  ciphertext: string;
  iv: string;
  ownerTokenHash: string;
  expiresAt: Date | null;
  revoked: boolean;
  proof?: string;
}

export interface SharedTripDoc {
  ciphertext: string;
  iv: string;
  expiresAt: Date | null;
}

/** Storage for encrypted shares; the Firestore implementation is below, tests pass a fake. */
export interface SharedTripsBackend {
  isConfigured(): boolean;
  create(shareId: string, data: SharedTripWrite): Promise<void>;
  update(shareId: string, data: SharedTripWrite): Promise<void>;
  /** Null when the share is missing, revoked or expired (the rules make those indistinguishable). */
  get(shareId: string): Promise<SharedTripDoc | null>;
}

let dbPromise: Promise<Firestore | null> | null = null;

async function getDb(): Promise<Firestore> {
  if (!isFirebaseConfigured) throw new Error("Trip sharing is not configured.");
  dbPromise ??= getFirebaseApp().then(async (app) => {
    if (!app) return null;
    const { getFirestore } = await import("firebase/firestore");
    return getFirestore(app);
  });
  const db = await dbPromise;
  if (!db) throw new Error("Trip sharing is not configured.");
  return db;
}

async function write(shareId: string, data: SharedTripWrite): Promise<void> {
  const db = await getDb();
  const { doc, serverTimestamp, setDoc, Timestamp } = await import("firebase/firestore");
  await setDoc(doc(db, "sharedTrips", shareId), {
    v: 1,
    ciphertext: data.ciphertext,
    iv: data.iv,
    ownerTokenHash: data.ownerTokenHash,
    revoked: data.revoked,
    updatedAt: serverTimestamp(),
    ...(data.expiresAt ? { expiresAt: Timestamp.fromDate(data.expiresAt) } : {}),
    ...(data.proof !== undefined ? { proof: data.proof } : {}),
  });
}

export const firestoreSharedTrips: SharedTripsBackend = {
  isConfigured: () => isFirebaseConfigured,
  create: write,
  update: write,
  async get(shareId) {
    const db = await getDb();
    const { doc, getDoc } = await import("firebase/firestore");
    let snap;
    try {
      snap = await getDoc(doc(db, "sharedTrips", shareId));
    } catch (err) {
      // The rules deny revoked and expired shares, which reaches us as permission-denied.
      if (err && typeof err === "object" && "code" in err && err.code === "permission-denied") {
        return null;
      }
      throw err;
    }
    if (!snap.exists()) return null;
    const data = snap.data() as {
      ciphertext?: unknown;
      iv?: unknown;
      expiresAt?: { toDate(): Date };
    };
    if (typeof data.ciphertext !== "string" || typeof data.iv !== "string") return null;
    return {
      ciphertext: data.ciphertext,
      iv: data.iv,
      expiresAt: data.expiresAt?.toDate() ?? null,
    };
  },
};
