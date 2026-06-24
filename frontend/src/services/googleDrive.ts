// Saves/loads/shares trips in the signed-in user's own Google Drive — no
// backend storage, no cost to us. Uses the `drive.file` scope, which only
// grants access to files this app creates (or that the user opens with it),
// so sharing a trip is just Drive's normal "anyone with the link" permission
// on a file the app owns.
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseApp } from "../firebase";
import type { TripData } from "../api";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "AppMyTrip";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// Only initialized when Firebase is configured (see README "Google Drive
// integration") — keeps the app usable without Drive sign-in set up.
const auth = firebaseApp ? getAuth(firebaseApp) : null;

export interface DriveSession {
  accessToken: string;
  email: string | null;
  displayName: string | null;
}

export interface DriveTripSummary {
  id: string;
  name: string;
  modifiedTime: string;
}

let currentAccessToken: string | null = null;

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/** Opens the Google sign-in popup, requesting the Drive-file scope. */
export async function signInWithGoogle(): Promise<DriveSession> {
  if (!auth) {
    throw new Error(
      "Google sign-in is not configured — set VITE_FIREBASE_* env vars (see README).",
    );
  }
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error("Google sign-in did not return a Drive access token.");
  }
  currentAccessToken = credential.accessToken;
  return {
    accessToken: credential.accessToken,
    email: result.user.email,
    displayName: result.user.displayName,
  };
}

export async function signOutOfGoogle(): Promise<void> {
  currentAccessToken = null;
  if (auth) await signOut(auth);
}

export function getCachedAccessToken(): string | null {
  return currentAccessToken;
}

async function driveFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Drive request failed (${res.status}): ${detail}`);
  }
  return res;
}

/** Finds (or creates) the "AppMyTrip" folder this app saves trips into. */
export async function ensureAppFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME}' and trashed=false`,
  );
  const listRes = await driveFetch(
    `${DRIVE_API}/files?q=${query}&spaces=drive&fields=files(id,name)`,
    accessToken,
  );
  const listBody = (await listRes.json()) as { files: { id: string }[] };
  if (listBody.files.length > 0) {
    return listBody.files[0].id;
  }

  const createRes = await driveFetch(`${DRIVE_API}/files`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function listTrips(
  accessToken: string,
  folderId: string,
): Promise<DriveTripSummary[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(
    `${DRIVE_API}/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    accessToken,
  );
  const body = (await res.json()) as { files: DriveTripSummary[] };
  return body.files;
}

function fileNameFor(trip: TripData): string {
  const safeTitle = (trip.title || "Untitled trip").replace(/[/\\?%*:|"<>]/g, "-");
  return `${safeTitle}.json`;
}

/** Creates a new trip file, or overwrites an existing one if fileId is given. */
export async function saveTrip(
  accessToken: string,
  folderId: string,
  trip: TripData,
  fileId?: string,
): Promise<string> {
  const name = fileNameFor(trip);
  const content = JSON.stringify(trip, null, 2);

  if (fileId) {
    await driveFetch(`${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`, accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: content,
    });
    await driveFetch(`${DRIVE_API}/files/${fileId}`, accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return fileId;
  }

  const boundary = "appmytrip-boundary";
  const metadata = { name, parents: [folderId], mimeType: "application/json" };
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, accessToken, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

export async function loadTrip(accessToken: string, fileId: string): Promise<TripData> {
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`, accessToken);
  return (await res.json()) as TripData;
}

export async function deleteTrip(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${fileId}`, accessToken, { method: "DELETE" });
}

/** Makes the file readable by anyone with the link and returns that link. */
export async function shareTrip(accessToken: string, fileId: string): Promise<string> {
  await driveFetch(`${DRIVE_API}/files/${fileId}/permissions`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?fields=webViewLink`, accessToken);
  const body = (await res.json()) as { webViewLink: string };
  return body.webViewLink;
}
