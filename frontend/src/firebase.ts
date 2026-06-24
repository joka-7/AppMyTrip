// Firebase is used only for Google sign-in (to obtain a Drive-scoped OAuth
// access token) — there is no Firestore/Hosting usage here. All trip data
// lives in the signed-in user's own Google Drive, not in any project of ours.
import { initializeApp, type FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** False until VITE_FIREBASE_* env vars are set (see README "Google Drive integration"). */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;
