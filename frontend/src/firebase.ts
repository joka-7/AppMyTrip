// Firebase is used only for Firestore's sharedTrips collection, which holds
// encrypted shared trips (see services/sharedTripsFirestore.ts). There is no
// Firebase sign-in: private trips live in each user's Google Drive.
//
// App initialization is deferred until the first Firestore call so the
// Firebase SDK stays out of the critical first-paint path (and out of the
// main chunk via vite manualChunks).
import type { FirebaseApp } from "firebase/app";
import { cleanEnvVar } from "./services/env";

const firebaseConfig = {
  apiKey: cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY as string | undefined),
  projectId: cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined),
  appId: cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID as string | undefined),
};

/** False until VITE_FIREBASE_* env vars are set (see README "Trip storage"). */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId,
);

let appPromise: Promise<FirebaseApp | null> | null = null;

/** Lazily initializes the Firebase app the first time auth/Firestore is needed. */
export function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  if (!appPromise) {
    appPromise = import("firebase/app").then(({ initializeApp }) => initializeApp(firebaseConfig));
  }
  return appPromise;
}
