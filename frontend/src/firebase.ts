// Firebase is used for Google sign-in and Firestore (trip storage/sharing) —
// see frontend/src/services/tripsStore.ts. Both stay within Firebase's free
// Spark plan with normal usage; no billing account required.
import { initializeApp, type FirebaseApp } from "firebase/app";
import { cleanEnvVar } from "./services/env";

const firebaseConfig = {
  apiKey: cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY as string | undefined),
  authDomain: cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined),
  projectId: cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined),
  appId: cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID as string | undefined),
};

/** False until VITE_FIREBASE_* env vars are set (see README "Trip storage"). */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;
