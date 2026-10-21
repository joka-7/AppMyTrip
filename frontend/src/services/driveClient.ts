// The app's one Drive sync client, configured from the build's env.
import { createDriveSync } from "./driveSync";
import { cleanEnvVar } from "./env";

/** OAuth *Web* client ID. Public by design: it appears in every Google sign-in URL. */
export const GOOGLE_CLIENT_ID =
  cleanEnvVar(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

export const driveClient = createDriveSync({
  clientId: GOOGLE_CLIENT_ID,
  fetchImpl: (url, init) => fetch(url, init),
});
