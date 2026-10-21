// The app's one Drive sync client, configured from the build's env.
import { Capacitor } from "@capacitor/core";
import { createDriveSync } from "./driveSync";
import { cleanEnvVar } from "./env";
import { createNativeGoogleAuth } from "./nativeGoogleAuth";

/** OAuth *Web* client ID. Public by design: it appears in every Google sign-in URL. */
export const GOOGLE_CLIENT_ID =
  cleanEnvVar(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

const fetchImpl = (url: string, init?: RequestInit) => fetch(url, init);

export const driveClient = createDriveSync({
  clientId: GOOGLE_CLIENT_ID,
  fetchImpl,
  // Google refuses OAuth inside the Android app's WebView, so the app asks Android itself.
  nativeAuth: Capacitor.isNativePlatform()
    ? createNativeGoogleAuth({ webClientId: GOOGLE_CLIENT_ID, fetchImpl })
    : null,
});
