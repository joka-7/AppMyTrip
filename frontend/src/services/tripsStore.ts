// Saves/loads/shares trips in Firestore — no Google Drive, no per-account
// server we run ourselves. Each user's trips live under
// users/{uid}/trips/{tripId}, readable/writable only by that user (see
// firestore.rules). Sharing copies the trip into the top-level sharedTrips
// collection, which anyone can read (no sign-in required) but only the
// owner can write — that's what makes "anyone with the link" work.
//
// Firebase auth/firestore modules are loaded on first use (sign-in, shared
// trip load, etc.) so the SDK stays out of the critical first-paint path.
import type { Auth, User as FirebaseUser } from "firebase/auth";
import type { Firestore, Timestamp as TimestampType } from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "../firebase";
import type { TripData } from "../api";
import { type AppDesign, type Theme, DEFAULT_APP_DESIGN, normalizeAppDesign } from "./appDesign";
import { ensureStartWeekday, normalizeTripForLoad } from "./normalizeTrip";

export type { FirebaseUser };

let authPromise: Promise<Auth | null> | null = null;
let dbPromise: Promise<Firestore | null> | null = null;
let cachedAuth: Auth | null = null;

async function getAuthInstance(): Promise<Auth | null> {
  if (!isFirebaseConfigured) return null;
  if (!authPromise) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const { getAuth } = await import("firebase/auth");
      cachedAuth = getAuth(app);
      return cachedAuth;
    })();
  }
  return authPromise;
}

async function getDb(): Promise<Firestore> {
  if (!isFirebaseConfigured) throw new Error("Firestore is not configured.");
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const { getFirestore } = await import("firebase/firestore");
      return getFirestore(app);
    })();
  }
  const db = await dbPromise;
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

export interface CloudSession {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Which point in the builder a trip was saved at — shown next to its name in
 * "My trips" so multiple saves of the same work-in-progress are distinguishable.
 * "final" means it was saved from the finished/shared app view rather than
 * mid-build (e.g. via SharedAppPage's "save to my account", or a Step 4 deploy).
 */
export type TripStage = "step1" | "step2" | "step3" | "step4" | "final";

export interface CloudTripSummary {
  id: string;
  name: string;
  modifiedTime: string;
  stage: TripStage | null;
}

/** Permission/ownership info for a `?shared=` link, alongside its content. */
export interface SharedTripMeta {
  ownerId: string;
  ownerEmail: string | null;
  /** Lower-cased sign-in emails allowed to call saveSharedTrip/addSharedTripAdmin on this link. */
  adminEmails: string[];
  expiresAt: string | null;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  let unsub = () => {};
  let cancelled = false;
  void (async () => {
    const auth = await getAuthInstance();
    if (cancelled) return;
    if (!auth) {
      callback(null);
      return;
    }
    const { onAuthStateChanged } = await import("firebase/auth");
    if (cancelled) return;
    unsub = onAuthStateChanged(auth, callback);
  })();
  return () => {
    cancelled = true;
    unsub();
  };
}

/** Returns the signed-in user, if any, without triggering a sign-in popup.
 * Returns null until auth has been initialized (see onAuthChange). */
export function getCurrentSession(): CloudSession | null {
  const user = cachedAuth?.currentUser;
  if (!user) return null;
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export async function signInWithGoogle(): Promise<CloudSession> {
  const auth = await getAuthInstance();
  if (!auth) {
    throw new Error(
      "Google sign-in is not configured — set VITE_FIREBASE_* env vars (see README).",
    );
  }
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return {
    uid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName,
  };
}

export async function signOutOfGoogle(): Promise<void> {
  const auth = await getAuthInstance();
  if (!auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

async function tripsCollection(uid: string) {
  const db = await getDb();
  const { collection } = await import("firebase/firestore");
  return collection(db, "users", uid, "trips");
}

function timestampToIso(value: unknown): string {
  // Timestamp is only available after the firestore module loads — duck-type
  // the toDate() method so we don't need a sync import just for this check.
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as TimestampType).toDate === "function"
  ) {
    return (value as TimestampType).toDate().toISOString();
  }
  return new Date().toISOString();
}

const TRIP_STAGES: readonly TripStage[] = ["step1", "step2", "step3", "step4", "final"];

function stageFromStored(value: unknown): TripStage | null {
  return TRIP_STAGES.includes(value as TripStage) ? (value as TripStage) : null;
}

export async function listTrips(uid: string): Promise<CloudTripSummary[]> {
  const { getDocs, orderBy, query } = await import("firebase/firestore");
  const snap = await getDocs(query(await tripsCollection(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({
    id: d.id,
    name: (d.data().title as string) || "Untitled trip",
    modifiedTime: timestampToIso(d.data().updatedAt),
    stage: stageFromStored(d.data().stage),
  }));
}

type StoredTrip = TripData & { theme?: Theme; appDesign?: Partial<AppDesign> };

function appDesignFromStored(data: StoredTrip): AppDesign {
  return normalizeAppDesign(data.appDesign, data.theme);
}

/** Creates a new trip doc, or overwrites an existing one if tripId is given.
 * `stage` records which point in the builder this save represents (or "final"
 * for a save made from the finished/shared app view) — see `TripStage`. */
export async function saveTrip(
  uid: string,
  trip: TripData,
  options?: { appDesign?: AppDesign; tripId?: string; stage?: TripStage },
): Promise<string> {
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const col = await tripsCollection(uid);
  const ref = options?.tripId ? doc(col, options.tripId) : doc(col);
  const tripToSave = ensureStartWeekday(trip);
  const appDesign = options?.appDesign ?? DEFAULT_APP_DESIGN;
  await setDoc(ref, {
    ...tripToSave,
    appDesign,
    theme: appDesign.theme,
    updatedAt: serverTimestamp(),
    ...(options?.stage ? { stage: options.stage } : {}),
  });
  return ref.id;
}

export async function loadTrip(
  uid: string,
  tripId: string,
): Promise<{ trip: TripData; appDesign: AppDesign }> {
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(await tripsCollection(uid), tripId));
  if (!snap.exists()) throw new Error("Trip not found.");
  const data = snap.data() as StoredTrip;
  return { trip: normalizeTripForLoad(data), appDesign: appDesignFromStored(data) };
}

export async function deleteTrip(uid: string, tripId: string): Promise<void> {
  const { deleteDoc, doc } = await import("firebase/firestore");
  await deleteDoc(doc(await tripsCollection(uid), tripId));
}

/**
 * Publishes a read-only copy to the public sharedTrips collection and returns its link.
 * `expiresInDays` is optional — omit it (or pass undefined/0) for a link that lasts forever.
 * When given, an `expiresAt` field is stored so `loadSharedTrip` can reject access once it's
 * past, and so a Firestore TTL policy on that field (configured in the console, see README)
 * can clean up the document automatically.
 *
 * The owner is seeded as the link's first admin (see SharedTripMeta) so they can later call
 * saveSharedTrip/addSharedTripAdmin on it. Re-sharing an already-shared trip (e.g. to change
 * its duration) merges into the existing doc rather than replacing it, so admins added since
 * the first share aren't wiped out.
 */
export async function shareTrip(
  uid: string,
  tripId: string,
  trip: TripData,
  appDesign?: AppDesign,
  expiresInDays?: number,
): Promise<string> {
  const db = await getDb();
  const { deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp } =
    await import("firebase/firestore");
  const design = appDesign ?? DEFAULT_APP_DESIGN;
  const ref = doc(db, "sharedTrips", tripId);
  const existing = await getDoc(ref);
  const existingAdminEmails = existing.exists() ? existing.data().adminEmails : undefined;
  const hasAdmins = Array.isArray(existingAdminEmails) && existingAdminEmails.length > 0;
  const ownerEmail = cachedAuth?.currentUser?.email ?? null;
  await setDoc(
    ref,
    {
      ...trip,
      appDesign: design,
      theme: design.theme,
      ownerId: uid,
      sharedAt: serverTimestamp(),
      ...(hasAdmins
        ? {}
        : { ownerEmail, adminEmails: ownerEmail ? [ownerEmail.toLowerCase()] : [] }),
      expiresAt: expiresInDays
        ? Timestamp.fromMillis(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : deleteField(),
    },
    { merge: true },
  );
  const url = new URL(window.location.href);
  url.searchParams.set("shared", tripId);
  return url.toString();
}

/**
 * Loads a publicly-shared trip — no sign-in required. Used for ?shared=<id> links.
 * Rejects expired links client-side even if Firestore's own TTL deletion (which can lag
 * up to ~24h after expiresAt) hasn't run yet.
 */
export async function loadSharedTrip(
  tripId: string,
): Promise<{ trip: TripData; appDesign: AppDesign; meta: SharedTripMeta }> {
  const db = await getDb();
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "sharedTrips", tripId));
  if (!snap.exists()) throw new Error("Shared trip not found.");
  const data = snap.data() as StoredTrip & {
    expiresAt?: TimestampType;
    ownerId?: string;
    ownerEmail?: string | null;
    adminEmails?: string[];
  };
  const { expiresAt } = data;
  if (expiresAt && expiresAt.toMillis() < Date.now()) {
    throw new Error("This shared trip link has expired.");
  }
  return {
    trip: normalizeTripForLoad(data),
    appDesign: appDesignFromStored(data),
    meta: {
      ownerId: data.ownerId ?? "",
      ownerEmail: data.ownerEmail ?? null,
      adminEmails: Array.isArray(data.adminEmails) ? data.adminEmails : [],
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
    },
  };
}

/**
 * Updates an already-shared trip's content in place — lets a trip admin (the owner, or anyone
 * the owner added via addSharedTripAdmin) save edits made on the "?shared=" link back to that
 * same link, instead of forking a private copy. Firestore rules (see firestore.rules) enforce
 * that only a current admin, matched by verified sign-in email, can actually write.
 */
export async function saveSharedTrip(
  tripId: string,
  trip: TripData,
  appDesign?: AppDesign,
): Promise<void> {
  const db = await getDb();
  const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const design = appDesign ?? DEFAULT_APP_DESIGN;
  await setDoc(
    doc(db, "sharedTrips", tripId),
    {
      ...ensureStartWeekday(trip),
      appDesign: design,
      theme: design.theme,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Grants another signed-in Google account admin rights on a shared trip, so it can also call
 * saveSharedTrip/addSharedTripAdmin on this link. Only an existing admin can add one — the
 * email is matched against the caller's verified sign-in email at write time by firestore.rules,
 * not looked up, so the added account only gains access once they actually sign in with it.
 */
export async function addSharedTripAdmin(tripId: string, email: string): Promise<void> {
  const db = await getDb();
  const { arrayUnion, doc, updateDoc } = await import("firebase/firestore");
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Enter an email address.");
  await updateDoc(doc(db, "sharedTrips", tripId), {
    adminEmails: arrayUnion(normalized),
  });
}

/** Revokes a public share link by deleting its sharedTrips doc (no-op if it was never shared). */
export async function deleteSharedTrip(tripId: string): Promise<void> {
  const db = await getDb();
  const { deleteDoc, doc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "sharedTrips", tripId));
}
