// Saves/loads/shares trips in Firestore — no Google Drive, no per-account
// server we run ourselves. Each user's trips live under
// users/{uid}/trips/{tripId}, readable/writable only by that user (see
// firestore.rules). Sharing copies the trip into the top-level sharedTrips
// collection, which anyone can read (no sign-in required) but only the
// owner can write — that's what makes "anyone with the link" work.
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { firebaseApp } from "../firebase";
import type { TripData } from "../api";
import type { Theme } from "../components/ThemeSelector";
import { type AppDesign, DEFAULT_APP_DESIGN, normalizeAppDesign } from "./appDesign";
import { ensureStartWeekday, normalizeTripForLoad } from "./normalizeTrip";

// Only initialized when Firebase is configured (see README "Trip storage").
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

export interface CloudSession {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface CloudTripSummary {
  id: string;
  name: string;
  modifiedTime: string;
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
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/** Returns the signed-in user, if any, without triggering a sign-in popup. */
export function getCurrentSession(): CloudSession | null {
  const user = auth?.currentUser;
  if (!user) return null;
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export async function signInWithGoogle(): Promise<CloudSession> {
  if (!auth) {
    throw new Error(
      "Google sign-in is not configured — set VITE_FIREBASE_* env vars (see README).",
    );
  }
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return {
    uid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName,
  };
}

export async function signOutOfGoogle(): Promise<void> {
  if (auth) await signOut(auth);
}

function tripsCollection(uid: string) {
  if (!db) throw new Error("Firestore is not configured.");
  return collection(db, "users", uid, "trips");
}

function timestampToIso(value: unknown): string {
  return value instanceof Timestamp ? value.toDate().toISOString() : new Date().toISOString();
}

export async function listTrips(uid: string): Promise<CloudTripSummary[]> {
  const snap = await getDocs(query(tripsCollection(uid), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({
    id: d.id,
    name: (d.data().title as string) || "Untitled trip",
    modifiedTime: timestampToIso(d.data().updatedAt),
  }));
}

type StoredTrip = TripData & { theme?: Theme; appDesign?: Partial<AppDesign> };

function appDesignFromStored(data: StoredTrip): AppDesign {
  return normalizeAppDesign(data.appDesign, data.theme);
}

/** Creates a new trip doc, or overwrites an existing one if tripId is given. */
export async function saveTrip(
  uid: string,
  trip: TripData,
  options?: { appDesign?: AppDesign; tripId?: string },
): Promise<string> {
  const ref = options?.tripId
    ? doc(tripsCollection(uid), options.tripId)
    : doc(tripsCollection(uid));
  const tripToSave = ensureStartWeekday(trip);
  const appDesign = options?.appDesign ?? DEFAULT_APP_DESIGN;
  await setDoc(ref, {
    ...tripToSave,
    appDesign,
    theme: appDesign.theme,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function loadTrip(
  uid: string,
  tripId: string,
): Promise<{ trip: TripData; appDesign: AppDesign }> {
  const snap = await getDoc(doc(tripsCollection(uid), tripId));
  if (!snap.exists()) throw new Error("Trip not found.");
  const data = snap.data() as StoredTrip;
  return { trip: normalizeTripForLoad(data), appDesign: appDesignFromStored(data) };
}

export async function deleteTrip(uid: string, tripId: string): Promise<void> {
  await deleteDoc(doc(tripsCollection(uid), tripId));
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
  if (!db) throw new Error("Firestore is not configured.");
  const design = appDesign ?? DEFAULT_APP_DESIGN;
  const ref = doc(db, "sharedTrips", tripId);
  const existing = await getDoc(ref);
  const existingAdminEmails = existing.exists() ? existing.data().adminEmails : undefined;
  const hasAdmins = Array.isArray(existingAdminEmails) && existingAdminEmails.length > 0;
  const ownerEmail = auth?.currentUser?.email ?? null;
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
  if (!db) throw new Error("Firestore is not configured.");
  const snap = await getDoc(doc(db, "sharedTrips", tripId));
  if (!snap.exists()) throw new Error("Shared trip not found.");
  const data = snap.data() as StoredTrip & {
    expiresAt?: Timestamp;
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
  if (!db) throw new Error("Firestore is not configured.");
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
  if (!db) throw new Error("Firestore is not configured.");
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Enter an email address.");
  await updateDoc(doc(db, "sharedTrips", tripId), {
    adminEmails: arrayUnion(normalized),
  });
}

/** Revokes a public share link by deleting its sharedTrips doc (no-op if it was never shared). */
export async function deleteSharedTrip(tripId: string): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  await deleteDoc(doc(db, "sharedTrips", tripId));
}
