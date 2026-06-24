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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { firebaseApp } from "../firebase";
import type { TripData } from "../api";

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

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
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

/** Creates a new trip doc, or overwrites an existing one if tripId is given. */
export async function saveTrip(uid: string, trip: TripData, tripId?: string): Promise<string> {
  const ref = tripId ? doc(tripsCollection(uid), tripId) : doc(tripsCollection(uid));
  await setDoc(ref, { ...trip, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function loadTrip(uid: string, tripId: string): Promise<TripData> {
  const snap = await getDoc(doc(tripsCollection(uid), tripId));
  if (!snap.exists()) throw new Error("Trip not found.");
  const { title, dates, days } = snap.data() as TripData;
  return { title, dates, days };
}

export async function deleteTrip(uid: string, tripId: string): Promise<void> {
  await deleteDoc(doc(tripsCollection(uid), tripId));
}

/** Publishes a read-only copy to the public sharedTrips collection and returns its link. */
export async function shareTrip(uid: string, tripId: string, trip: TripData): Promise<string> {
  if (!db) throw new Error("Firestore is not configured.");
  await setDoc(doc(db, "sharedTrips", tripId), {
    ...trip,
    ownerId: uid,
    sharedAt: serverTimestamp(),
  });
  const url = new URL(window.location.href);
  url.searchParams.set("shared", tripId);
  return url.toString();
}

/** Loads a publicly-shared trip — no sign-in required. Used for ?shared=<id> links. */
export async function loadSharedTrip(tripId: string): Promise<TripData> {
  if (!db) throw new Error("Firestore is not configured.");
  const snap = await getDoc(doc(db, "sharedTrips", tripId));
  if (!snap.exists()) throw new Error("Shared trip not found.");
  const { title, dates, days } = snap.data() as TripData;
  return { title, dates, days };
}
