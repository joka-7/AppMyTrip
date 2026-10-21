// Private trip storage in the user's own Google Drive.
//
// Data lives in the Drive *appDataFolder*: a hidden folder only this OAuth
// client can read. The browser talks to Google directly; no AppMyTrip server
// or database is in the path, so the operator has no copy of anyone's trips.
//
// Each device writes only its own file (`appmytrip-<deviceId>.json`) and reads
// everyone's, keeping the newest version of each record. Drive v3 has no
// conditional write, so one shared file would let two devices silently
// overwrite each other; with one writer per file there is nothing to overwrite.
//
// Ported from KanDOne's src/driveSync.js, keeping every fix it accumulated:
// per-device files, delete tombstones, the `nextStamp` clock guard, skipping
// only permanently unreadable files, abandoning a corrupt own file, paginated
// listing, Web Locks (or per-tab device ids), the native 5 s renewal margin
// with lazy renewal, uid-change-only notifications, renewal backoff, and
// HTTP revocation in the Android app.

const FILE_PREFIX = "appmytrip-";
const DOCUMENT_VERSION = 1;
const SCOPES = "https://www.googleapis.com/auth/drive.appdata openid email profile";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const LOCK_NAME = "appmytrip-drive-write";

// localStorage, not sessionStorage, so a new tab or a reload within the
// token's hour does not demand another click. The token only reaches this
// app's hidden Drive folder and expires on Google's side regardless.
const SESSION_KEY = "appmytrip_drive_session_v1";
const DEVICE_KEY = "appmytrip_drive_device_v1";

/** Treat a token as expired a little early so no request starts with one about to die. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
/** Android hands back the *same* token until it has really expired, so renewal must wait almost to the end. */
const NATIVE_TOKEN_EXPIRY_MARGIN_MS = 5_000;

/** A device file idle this long whose records all have newer copies elsewhere is deleted. */
export const STALE_DEVICE_FILE_MS = 90 * 24 * 60 * 60 * 1000;
const COMPACTION_MIN_INTERVAL_MS = 60 * 60 * 1000;
const MAX_DELETES_PER_PASS = 10;

const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DOWNLOAD_CONCURRENCY = 4;
/** After a failed silent renewal, wait this long before trying again on its own. */
const RENEWAL_BACKOFF_MS = 5 * 60_000;
/** Coalesce bursts of saves into one Drive upload. */
const DEFAULT_FLUSH_DELAY_MS = 300;

export interface DriveUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface DriveRecord {
  id: string;
  [field: string]: unknown;
}

interface Entry {
  at: number;
  item: DriveRecord | null;
}

export interface DeviceDocument {
  version: typeof DOCUMENT_VERSION;
  device: string;
  collections: Record<string, Record<string, Entry>>;
}

export interface MergedView {
  collections: Record<string, DriveRecord[]>;
  deleted: Record<string, string[]>;
}

export type Operation =
  | { type: "upsert"; collection: string; item: DriveRecord }
  | { type: "delete"; collection: string; id: string };

interface TokenResponse {
  access_token: string;
  expires_in: number | string;
}

/** The Android app's sign-in (see nativeGoogleAuth.ts); null in a browser. */
export interface NativeAuth {
  requestToken(options: { interactive: boolean }): Promise<TokenResponse | null>;
  signOut(): Promise<void>;
}

interface Session {
  accessToken: string | null;
  expiresAt: number;
  user: DriveUser;
  renewalFailedAt?: number | null;
}

interface GisTokenClient {
  callback: (response: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  }) => void;
  error_callback?: (err: { message?: string; type?: string }) => void;
  requestAccessToken(options: { prompt: string; login_hint: string }): void;
}

export interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: GisTokenClient["callback"];
      }): GisTokenClient;
      revoke(token: string, done: () => void): void;
    };
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Raised for any failed Drive or Google sign-in request. */
export class DriveSyncError extends Error {
  readonly status: number;
  readonly code: string;
  readonly cause: unknown;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "DriveSyncError";
    this.cause = options.cause;
    this.status = options.status ?? 0;
    this.code = options.code ?? "";
  }
}

function offlineError(cause?: unknown): DriveSyncError {
  return new DriveSyncError("Cannot reach Google Drive.", { code: "offline", cause });
}

/** Errors retrying will not fix, so the file is skipped rather than failing the read. */
const isPermanentlyUnreadable = (err: unknown): boolean =>
  err instanceof DriveSyncError &&
  (err.status === 404 || err.code === "corrupt-file" || err.code === "unsupported-version");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function emptyDocument(device: string): DeviceDocument {
  return { version: DOCUMENT_VERSION, device, collections: {} };
}

const isEntry = (entry: unknown): entry is Entry =>
  isPlainObject(entry) &&
  Number.isFinite(entry.at) &&
  (entry.item === null || (isPlainObject(entry.item) && typeof entry.item.id === "string"));

/**
 * Validate one device file. Throws rather than returning an empty document:
 * an unreadable file treated as empty would be overwritten and its data lost.
 */
export function parseDeviceDocument(raw: unknown): DeviceDocument {
  if (!isPlainObject(raw) || typeof raw.device !== "string") {
    throw new DriveSyncError("Drive sync file is not in the expected format.", {
      code: "corrupt-file",
    });
  }
  if (raw.version !== DOCUMENT_VERSION) {
    throw new DriveSyncError("Drive sync file was written by a newer AppMyTrip. Update the app.", {
      code: "unsupported-version",
    });
  }
  const collections = isPlainObject(raw.collections)
    ? Object.fromEntries(
        Object.entries(raw.collections).map(([name, items]) => [
          name,
          isPlainObject(items)
            ? Object.fromEntries(Object.entries(items).filter(([, entry]) => isEntry(entry)))
            : {},
        ]),
      )
    : {};
  return { version: DOCUMENT_VERSION, device: raw.device, collections } as DeviceDocument;
}

/**
 * Apply queued writes to this device's own document, stamping each with `at`.
 * Pure. Deletes are kept as tombstones (`item: null`) so they beat an older
 * copy of the record in another device's file.
 */
export function applyOperations(
  document: DeviceDocument,
  operations: readonly Operation[],
  at: number,
): DeviceDocument {
  const collections = Object.fromEntries(
    Object.entries(document.collections).map(([name, items]) => [name, { ...items }]),
  );
  for (const op of operations) {
    collections[op.collection] ??= {};
    const target = collections[op.collection];
    if (op.type === "upsert") target[op.item.id] = { item: op.item, at };
    else target[op.id] = { item: null, at };
  }
  return { ...document, collections };
}

type Stamped = Entry & { device: string };

/** Newest entry wins; a tie goes to the higher device id so every reader agrees. */
function newer(current: Stamped | undefined, candidate: Stamped): Stamped {
  if (!current) return candidate;
  if (candidate.at !== current.at) return candidate.at > current.at ? candidate : current;
  return candidate.device > current.device ? candidate : current;
}

function latestStamp(document: DeviceDocument): number {
  const stamps = Object.values(document.collections).flatMap((items) =>
    Object.values(items).map((entry) => entry.at),
  );
  return Math.max(0, ...stamps);
}

/**
 * Stamp for the next write: the wall clock, but never earlier than anything
 * already read. A device whose clock runs behind would otherwise lose every
 * edit to an older one written by a device whose clock runs ahead.
 */
export function nextStamp(now: number, latestSeen: number): number {
  return Math.max(now, latestSeen + 1);
}

/**
 * Merge every device's file into one view: live records per collection, plus
 * the ids whose newest entry is a delete.
 */
export function mergeDeviceDocuments(documents: readonly DeviceDocument[]): MergedView {
  const winners: Record<string, Record<string, Stamped>> = {};
  for (const doc of documents) {
    for (const [name, items] of Object.entries(doc.collections)) {
      winners[name] ??= {};
      for (const [id, entry] of Object.entries(items)) {
        winners[name][id] = newer(winners[name][id], { ...entry, device: doc.device });
      }
    }
  }
  const collections: Record<string, DriveRecord[]> = {};
  const deleted: Record<string, string[]> = {};
  for (const [name, items] of Object.entries(winners)) {
    collections[name] = [];
    deleted[name] = [];
    for (const [id, entry] of Object.entries(items)) {
      if (entry.item === null) deleted[name].push(id);
      else collections[name].push(entry.item);
    }
  }
  return { collections, deleted };
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameJson(value, b[i]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && sameJson(a[key], b[key]))
    );
  }
  return false;
}

const KNOWN_DOCUMENT_KEYS = new Set(["version", "device", "collections"]);

/**
 * True when parsing a device file threw something away. The file still reads,
 * but it is not safe to delete on the strength of what was understood.
 */
function parsingDroppedData(raw: Record<string, unknown>, document: DeviceDocument): boolean {
  const unknownEntryKeys = Object.values(document.collections).some((items) =>
    Object.values(items).some((entry) =>
      Object.keys(entry).some((k) => k !== "at" && k !== "item"),
    ),
  );
  return (
    Object.keys(raw).some((key) => !KNOWN_DOCUMENT_KEYS.has(key)) ||
    unknownEntryKeys ||
    !sameJson(raw.collections ?? {}, document.collections)
  );
}

interface FileEntry {
  id: string;
  name: string;
  modifiedTime?: string;
  lossy?: boolean;
  document: DeviceDocument;
}

interface Winner {
  at: number;
  device: string;
  fileId: string;
  content: string;
}

/** Newest stamp, then higher device id, then higher file id, so exact copies still have one winner. */
function beats(a: Winner, b: Winner | undefined): boolean {
  if (!b) return true;
  if (a.at !== b.at) return a.at > b.at;
  if (a.device !== b.device) return a.device > b.device;
  return a.fileId > b.fileId;
}

/**
 * Which device files can be deleted without anyone losing a record: idle for
 * `maxIdleMs` (judged against Drive's newest write, never later than the local
 * clock) and holding the winning entry for none of their records. Lossy files,
 * files tied on (stamp, device) with different content, and this device's own
 * file are never listed.
 */
export function findCompactableFiles(
  entries: readonly FileEntry[],
  options: { now: number; isOwn: (entry: FileEntry) => boolean; maxIdleMs?: number },
): FileEntry[] {
  const { now, isOwn, maxIdleMs = STALE_DEVICE_FILE_MS } = options;
  const modifiedAt = (entry: FileEntry) => Date.parse(entry.modifiedTime ?? "");
  const newestWrite = Math.max(-Infinity, ...entries.map(modifiedAt).filter(Number.isFinite));
  if (!Number.isFinite(newestWrite)) return [];
  const reference = Math.min(now, newestWrite);

  const winners = new Map<string, Winner>();
  const ambiguous = new Set<string>();
  for (const { id, document } of entries) {
    for (const [name, items] of Object.entries(document.collections)) {
      for (const [recordId, entry] of Object.entries(items)) {
        const key = JSON.stringify([name, recordId]);
        const candidate: Winner = {
          at: entry.at,
          device: document.device,
          fileId: id,
          content: JSON.stringify(entry.item),
        };
        const current = winners.get(key);
        if (
          current &&
          current.at === candidate.at &&
          current.device === candidate.device &&
          current.content !== candidate.content
        ) {
          ambiguous.add(current.fileId).add(id);
        }
        if (beats(candidate, current)) winners.set(key, candidate);
      }
    }
  }
  const needed = new Set([...ambiguous, ...[...winners.values()].map((w) => w.fileId)]);
  return entries.filter((entry) => {
    const modified = modifiedAt(entry);
    if (!Number.isFinite(modified) || reference - modified < maxIdleMs) return false;
    if (entry.lossy || needed.has(entry.id)) return false;
    return !isOwn(entry);
  });
}

function readJson<T>(storage: StorageLike | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the session just will not survive a reload.
  }
}

function loadGisScript(): Promise<GoogleIdentity> {
  const w = window as unknown as { google?: GoogleIdentity };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      if (w.google) resolve(w.google);
      else
        reject(new DriveSyncError("Could not load Google sign-in.", { code: "gis-load-failed" }));
    };
    script.onerror = () =>
      reject(new DriveSyncError("Could not load Google sign-in.", { code: "gis-load-failed" }));
    document.head.appendChild(script);
  });
}

const hasWebLocks = (): boolean =>
  typeof navigator !== "undefined" && Boolean(navigator.locks?.request);

/**
 * Serialise writes across this browser's tabs: they share one device id and
 * therefore one Drive file. Without Web Locks each tab gets its own device id.
 */
function withBrowserLock(task: () => Promise<void>): Promise<void> {
  return hasWebLocks() ? navigator.locks.request(LOCK_NAME, task).then(() => undefined) : task();
}

function browserStorage(
  kind: "localStorage" | "sessionStorage" = "localStorage",
): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null;
  }
}

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };

/** Run `task` over `items`, at most `limit` at a time, reporting outcomes in input order. */
async function settleWithConcurrency<I, T>(
  items: readonly I[],
  limit: number,
  task: (item: I) => Promise<T>,
): Promise<Settled<T>[]> {
  const results: Settled<T>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface QueuedWrite {
  op: Operation;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export interface DriveSyncDeps {
  /** OAuth Web client ID; empty disables Drive sync. */
  clientId: string;
  fetchImpl: FetchLike;
  loadGis?: () => Promise<GoogleIdentity>;
  storage?: StorageLike | null;
  /** Per-tab storage (sessionStorage), used for the device id when Web Locks are missing. */
  tabStorage?: StorageLike | null;
  now?: () => number;
  newDeviceId?: () => string;
  withLock?: (task: () => Promise<void>) => Promise<void>;
  /** Share one device id (one file) across tabs; only safe when `withLock` excludes other tabs. */
  persistDeviceId?: boolean;
  flushDelayMs?: number;
  nativeAuth?: NativeAuth | null;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** A failed request while offline is "offline", never a sign-out. */
  isOnline?: () => boolean;
}

export type DriveSync = ReturnType<typeof createDriveSync>;

/** Build a Drive sync client. Dependencies are injected so tests need no network, timers or storage. */
export function createDriveSync({
  clientId,
  fetchImpl,
  loadGis = loadGisScript,
  storage = browserStorage(),
  tabStorage = browserStorage("sessionStorage"),
  now = () => Date.now(),
  newDeviceId = () => crypto.randomUUID(),
  withLock = withBrowserLock,
  persistDeviceId = hasWebLocks(),
  flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  nativeAuth = null,
  sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  random = Math.random,
  isOnline = () => globalThis.navigator?.onLine !== false,
}: DriveSyncDeps) {
  let session = readJson<Session>(storage, SESSION_KEY);
  let gis: GoogleIdentity | null = null;
  let gisLoading: Promise<GoogleIdentity> | null = null;
  let tokenClient: GisTokenClient | null = null;
  let pendingTokenRequest: Promise<TokenResponse> | null = null;
  let pendingRenewal: Promise<string> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(user: DriveUser | null) => void>();

  let queue: QueuedWrite[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushChain: Promise<void> = Promise.resolve();
  let ownFileId: string | null = null;
  let latestSeenAt = 0;
  let lastCompactionAt: number | null = null;
  const lossyFileIds = new Set<string>();
  const documentCache = new Map<string, { modifiedTime: string; document: DeviceDocument }>();
  // Counts uploads, so a read started before one is never handed to a caller that asked after it.
  let writeEpoch = 0;
  let readInFlight: { epoch: number; promise: Promise<MergedView> } | null = null;

  const isConfigured = () => Boolean(clientId);
  const expiryMargin = nativeAuth ? NATIVE_TOKEN_EXPIRY_MARGIN_MS : TOKEN_EXPIRY_MARGIN_MS;

  const hasValidToken = () =>
    Boolean(session?.accessToken && session.expiresAt - expiryMargin > now());

  /** In the app a lapsed token is renewed silently, so the user stays connected until renewal fails. */
  const currentUser = (): DriveUser | null => {
    if (!nativeAuth) return hasValidToken() && session ? session.user : null;
    return session?.user && !session.renewalFailedAt ? session.user : null;
  };

  const canRenewSilently = () =>
    Boolean(
      nativeAuth &&
      session?.user &&
      (!session.renewalFailedAt || now() - session.renewalFailedAt >= RENEWAL_BACKOFF_MS),
    );

  let device: string | null = null;
  const deviceStorage = persistDeviceId ? storage : tabStorage;

  function deviceId(): string {
    if (device) return device;
    device = readJson<string>(deviceStorage, DEVICE_KEY) ?? newDeviceId();
    writeJson(deviceStorage, DEVICE_KEY, device);
    return device;
  }

  /** Leave an unreadable own file where it is (readers skip it) and continue in a new one. */
  function abandonOwnFile(): DeviceDocument {
    console.warn("AppMyTrip: own Drive sync file is unreadable; continuing in a new one.");
    device = null;
    writeJson(deviceStorage, DEVICE_KEY, null);
    ownFileId = null;
    documentCache.clear();
    return emptyDocument(deviceId());
  }

  const ownFileName = () => `${FILE_PREFIX}${deviceId()}.json`;

  let lastReportedUid: string | null = currentUser()?.uid ?? null;

  /** Report only a change of *who is connected*; a token swap for the same user is not one. */
  function notifyListeners() {
    const user = currentUser();
    if ((user?.uid ?? null) === lastReportedUid) return;
    lastReportedUid = user?.uid ?? null;
    for (const listener of listeners) listener(user);
  }

  /** Browser only: tell listeners the moment the token lapses. The app renews lazily instead. */
  function scheduleExpiryNotice() {
    clearTimeout(expiryTimer);
    if (nativeAuth || !hasValidToken() || !session) return;
    expiryTimer = setTimeout(notifyListeners, session.expiresAt - expiryMargin - now());
  }

  function setSession(next: Session | null) {
    session = next;
    writeJson(storage, SESSION_KEY, next);
    scheduleExpiryNotice();
    notifyListeners();
  }

  function ensureGis(): Promise<GoogleIdentity> {
    if (gis) return Promise.resolve(gis);
    gisLoading ??= loadGis()
      .then((loaded) => {
        gis = loaded;
        return loaded;
      })
      .catch((err: unknown) => {
        gisLoading = null;
        throw err;
      });
    return gisLoading;
  }

  function requireToken(response: TokenResponse | null): TokenResponse {
    if (!response?.access_token) {
      throw new DriveSyncError("Google did not grant access to Drive.", { code: "access_denied" });
    }
    return response;
  }

  /**
   * Ask Google for an access token. With GIS already loaded this opens the
   * popup synchronously inside the click; anything later and the browser
   * blocks it. That is why GIS is preloaded when a listener subscribes.
   */
  function requestToken(): Promise<TokenResponse> {
    if (pendingTokenRequest) return pendingTokenRequest;
    if (nativeAuth) {
      pendingTokenRequest = nativeAuth
        .requestToken({ interactive: true })
        .then(requireToken)
        .finally(() => {
          pendingTokenRequest = null;
        });
      return pendingTokenRequest;
    }
    const run = (loaded: GoogleIdentity) =>
      new Promise<TokenResponse>((resolve, reject) => {
        gis = loaded;
        tokenClient ??= loaded.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: () => {},
        });
        const client = tokenClient;
        client.callback = (response) => {
          if (response.error || !response.access_token) {
            reject(
              new DriveSyncError(response.error_description || response.error || "No token.", {
                code: response.error ?? "access_denied",
              }),
            );
            return;
          }
          resolve({ access_token: response.access_token, expires_in: response.expires_in ?? 0 });
        };
        client.error_callback = (err) => {
          reject(
            new DriveSyncError(err?.message || "Google sign-in was closed.", {
              code: err?.type || "popup_closed",
            }),
          );
        };
        client.requestAccessToken({ prompt: "", login_hint: session?.user?.email || "" });
      });
    pendingTokenRequest = (gis ? run(gis) : ensureGis().then(run)).finally(() => {
      pendingTokenRequest = null;
    });
    return pendingTokenRequest;
  }

  const expiredSession = (): Session | null =>
    session ? { ...session, accessToken: null, expiresAt: 0 } : null;

  /** App only: renew an expired token without UI; a failure backs off and reports signed out. */
  function renewSilently(): Promise<string> {
    if (!nativeAuth) return Promise.reject(new DriveSyncError("No native sign-in."));
    pendingRenewal ??= nativeAuth
      .requestToken({ interactive: false })
      .then(requireToken)
      .then((response) => {
        if (!session) throw new DriveSyncError("Signed out.", { code: "signed-out" });
        setSession({
          ...session,
          accessToken: response.access_token,
          expiresAt: now() + Number(response.expires_in) * 1000,
          renewalFailedAt: null,
        });
        return response.access_token;
      })
      .catch((err: unknown) => {
        if (!isOnline()) throw offlineError(err);
        const expired = expiredSession();
        if (expired) setSession({ ...expired, renewalFailedAt: now() });
        throw new DriveSyncError("Google Drive session expired.", {
          code: "signed-out",
          cause: err,
        });
      })
      .finally(() => {
        pendingRenewal = null;
      });
    return pendingRenewal;
  }

  async function fetchUser(accessToken: string): Promise<DriveUser> {
    const res = await fetchImpl(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch((err: unknown) => {
      throw offlineError(err);
    });
    if (!res.ok) {
      throw new DriveSyncError("Could not read the Google account.", { status: res.status });
    }
    const info = (await res.json()) as { sub: string; email?: string; name?: string };
    return { uid: info.sub, email: info.email || "", displayName: info.name || "" };
  }

  async function signIn(): Promise<DriveUser> {
    if (!isConfigured()) {
      throw new DriveSyncError("Google Drive sync is not configured.", { code: "not-configured" });
    }
    const response = await requestToken();
    const user = await fetchUser(response.access_token);
    if (session?.user?.uid !== user.uid) {
      ownFileId = null;
      documentCache.clear();
      latestSeenAt = 0;
    }
    setSession({
      accessToken: response.access_token,
      expiresAt: now() + Number(response.expires_in) * 1000,
      user,
    });
    return user;
  }

  /** Never opens a popup: a background save is not a click, so the browser would block it. */
  async function accessToken(): Promise<string> {
    if (hasValidToken() && session?.accessToken) return session.accessToken;
    if (canRenewSilently()) return renewSilently();
    if (!isOnline()) throw offlineError();
    if (session?.accessToken) setSession(expiredSession());
    throw new DriveSyncError("Google Drive session expired.", { code: "signed-out" });
  }

  /** A 5xx may have been applied, so only requests safe to repeat (not file creation) retry on it. */
  function worthRetrying(status: number, method: string | undefined): boolean {
    if (!RETRYABLE_STATUSES.has(status)) return false;
    return status === 429 || (method ?? "GET") !== "POST";
  }

  /** Exponential, jittered, and never shorter than the Retry-After the server sent. */
  function retryDelayMs(attempt: number, res: Response): number {
    const asked = Number(res.headers?.get?.("Retry-After"));
    const backoff = RETRY_BASE_MS * 2 ** attempt * (0.5 + random());
    return Math.min(RETRY_MAX_MS, Math.max(backoff, Number.isFinite(asked) ? asked * 1000 : 0));
  }

  async function driveFetch(
    url: string,
    init: RequestInit = {},
    retried = false,
    attempt = 0,
  ): Promise<Response> {
    const token = await accessToken();
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    }).catch((err: unknown) => {
      throw offlineError(err);
    });
    if (res.status === 401 && session) {
      // Revoked or expired early: drop the token. The app renews and retries once.
      setSession(expiredSession());
      if (canRenewSilently() && !retried) return driveFetch(url, init, true, attempt);
    }
    if (!res.ok && attempt < MAX_ATTEMPTS - 1 && worthRetrying(res.status, init.method)) {
      await sleep(retryDelayMs(attempt, res));
      return driveFetch(url, init, retried, attempt + 1);
    }
    if (!res.ok) {
      throw new DriveSyncError(`Google Drive request failed (${res.status}).`, {
        status: res.status,
      });
    }
    return res;
  }

  async function listFiles(query: string, pageToken = ""): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: query,
      fields: "nextPageToken,files(id,name,modifiedTime)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = (await (await driveFetch(`${DRIVE_API}/files?${params}`)).json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    const files = page.files ?? [];
    return page.nextPageToken ? [...files, ...(await listFiles(query, page.nextPageToken))] : files;
  }

  const listDeviceFiles = async () =>
    (await listFiles(`name contains '${FILE_PREFIX}'`)).filter(
      (file) => file.name.startsWith(FILE_PREFIX) && file.name.endsWith(".json"),
    );

  async function readFile(id: string): Promise<DeviceDocument> {
    const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    // A connection dropped mid-download is a network error, not a corrupt file.
    const text = await res.text().catch((err: unknown) => {
      throw offlineError(err);
    });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new DriveSyncError("Drive sync file is not valid JSON.", { code: "corrupt-file" });
    }
    const document = parseDeviceDocument(raw);
    if (parsingDroppedData(raw as Record<string, unknown>, document)) lossyFileIds.add(id);
    else lossyFileIds.delete(id);
    return document;
  }

  async function readFileUnlessUnchanged(file: DriveFile): Promise<DeviceDocument> {
    const cached = documentCache.get(file.id);
    if (file.modifiedTime && cached?.modifiedTime === file.modifiedTime) return cached.document;
    const document = await readFile(file.id);
    if (file.modifiedTime)
      documentCache.set(file.id, { modifiedTime: file.modifiedTime, document });
    return document;
  }

  /**
   * Every device's file, merged. A file that can never be read is skipped; any
   * other failure (network, rate limit, auth) fails the whole read, because a
   * merge missing another device's newer edits and deletes is wrong.
   */
  async function readMergedFresh(): Promise<MergedView> {
    const files = await listDeviceFiles();
    const listed = new Set(files.map((file) => file.id));
    for (const id of documentCache.keys()) if (!listed.has(id)) documentCache.delete(id);
    const results = await settleWithConcurrency(
      files,
      DOWNLOAD_CONCURRENCY,
      readFileUnlessUnchanged,
    );
    const fatal = results.find(
      (r): r is { status: "rejected"; reason: unknown } =>
        r.status === "rejected" && !isPermanentlyUnreadable(r.reason),
    );
    if (fatal) throw fatal.reason;
    const skipped = results.filter((r) => r.status === "rejected").length;
    if (skipped) console.warn(`AppMyTrip: skipped ${skipped} unreadable Drive sync file(s).`);
    const readable: FileEntry[] = files.flatMap((file, index) => {
      const result = results[index];
      return result.status === "fulfilled"
        ? [
            {
              id: file.id,
              name: file.name,
              modifiedTime: file.modifiedTime,
              lossy: lossyFileIds.has(file.id),
              document: result.value,
            },
          ]
        : [];
    });
    const documents = readable.map((entry) => entry.document);
    latestSeenAt = Math.max(latestSeenAt, ...documents.map(latestStamp));
    const merged = mergeDeviceDocuments(documents);
    await deleteIdleFiles(readable);
    return merged;
  }

  /** Housekeeping that never fails a read; at most once an hour; re-checks each file before deleting. */
  async function deleteIdleFiles(readable: FileEntry[]) {
    const started = now();
    if (
      lastCompactionAt !== null &&
      started >= lastCompactionAt &&
      started - lastCompactionAt < COMPACTION_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastCompactionAt = started;
    try {
      const idle = findCompactableFiles(readable, {
        now: started,
        isOwn: (entry) => entry.id === ownFileId || entry.name === ownFileName(),
      });
      const outcomes = await Promise.allSettled(
        idle.slice(0, MAX_DELETES_PER_PASS).map(async (entry) => {
          const url = `${DRIVE_API}/files/${encodeURIComponent(entry.id)}`;
          const current = (await (await driveFetch(`${url}?fields=modifiedTime`)).json()) as {
            modifiedTime?: string;
          };
          if (current.modifiedTime === entry.modifiedTime) {
            await driveFetch(url, { method: "DELETE" });
          }
        }),
      );
      const failed = outcomes.filter(
        (o) =>
          o.status === "rejected" &&
          !(o.reason instanceof DriveSyncError && o.reason.status === 404),
      ).length;
      if (failed) console.warn(`AppMyTrip: could not remove ${failed} idle Drive sync file(s).`);
    } catch (err) {
      console.warn("AppMyTrip: could not check for idle Drive sync files.", err);
    }
  }

  /** Concurrent callers share one read; a read from before an upload is never reused after it. */
  function readMerged(): Promise<MergedView> {
    if (readInFlight?.epoch !== writeEpoch) {
      const epoch = writeEpoch;
      const promise = readMergedFresh().finally(() => {
        if (readInFlight?.promise === promise) readInFlight = null;
      });
      readInFlight = { epoch, promise };
    }
    return readInFlight.promise;
  }

  async function readOwnDocument(): Promise<DeviceDocument> {
    if (!ownFileId) {
      const [file] = await listFiles(`name = '${ownFileName()}'`);
      ownFileId = file?.id ?? null;
    }
    if (!ownFileId) return emptyDocument(deviceId());
    try {
      const own = await readFile(ownFileId);
      latestSeenAt = Math.max(latestSeenAt, latestStamp(own));
      return own;
    } catch (err) {
      if (err instanceof DriveSyncError && err.code === "corrupt-file") return abandonOwnFile();
      // Deleted via Drive's "Manage apps → Delete hidden app data": start a new file.
      if (!(err instanceof DriveSyncError) || err.status !== 404) throw err;
      ownFileId = null;
      return emptyDocument(deviceId());
    }
  }

  async function writeOwnDocument(document: DeviceDocument) {
    const body = JSON.stringify(document);
    writeEpoch += 1;
    if (ownFileId) {
      documentCache.delete(ownFileId);
      await driveFetch(
        `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(ownFileId)}?uploadType=media`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
      );
      writeEpoch += 1;
      return;
    }
    const boundary = `appmytrip-${now()}`;
    const metadata = JSON.stringify({ name: ownFileName(), parents: ["appDataFolder"] });
    const multipart = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      body,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const res = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    ownFileId = ((await res.json()) as { id: string }).id;
    writeEpoch += 1;
  }

  async function flush() {
    flushTimer = null;
    const batch = queue;
    queue = [];
    if (batch.length === 0) return;
    try {
      await withLock(async () => {
        // Re-read under the lock: another tab of this browser shares the file.
        const own = await readOwnDocument();
        const at = nextStamp(now(), latestSeenAt);
        await writeOwnDocument(
          applyOperations(
            own,
            batch.map((entry) => entry.op),
            at,
          ),
        );
        latestSeenAt = at;
      });
      for (const entry of batch) entry.resolve();
    } catch (err) {
      for (const entry of batch) entry.reject(err);
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushChain = flushChain.then(flush);
    }, flushDelayMs);
  }

  /** Resolves only once the write has actually landed in Drive. */
  function enqueue(op: Operation): Promise<void> {
    if (!session) {
      return Promise.reject(
        new DriveSyncError("Not connected to Google Drive.", { code: "signed-out" }),
      );
    }
    return new Promise((resolve, reject) => {
      queue.push({ op, resolve, reject });
      scheduleFlush();
    });
  }

  /** Browser: revoke through Google's script, loaded before anything is deleted. */
  async function gisRevoker(): Promise<(token: string) => Promise<void>> {
    const loaded = await ensureGis();
    return (token) =>
      new Promise((resolve) => {
        loaded.accounts.oauth2.revoke(token, () => resolve());
      });
  }

  /** App: Google's script is not used there, so revoke with the plain OAuth endpoint. */
  async function revokeOverHttp(token: string): Promise<void> {
    const res = await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    if (!res.ok) console.warn(`AppMyTrip: revoking Drive access failed (${res.status})`);
  }

  function dropQueuedWrites() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    const dropped = queue;
    queue = [];
    for (const entry of dropped) {
      entry.reject(new DriveSyncError("Signed out before sync.", { code: "signed-out" }));
    }
  }

  function endSession() {
    dropQueuedWrites();
    ownFileId = null;
    latestSeenAt = 0;
    lastCompactionAt = null;
    lossyFileIds.clear();
    documentCache.clear();
    writeEpoch += 1;
    setSession(null);
  }

  async function nativeSignOut() {
    if (!nativeAuth) return;
    await nativeAuth
      .signOut()
      .catch((err: unknown) => console.warn("AppMyTrip: device sign-out failed", err));
  }

  return {
    isCloudConfigured: isConfigured,

    /** True when a usable token is stored, or (app only) when an expired one can be renewed silently. */
    hasRestorableSession: (): boolean => isConfigured() && (hasValidToken() || canRenewSilently()),

    currentUser: (): DriveUser | null => (isConfigured() ? currentUser() : null),

    /**
     * Reports the connected user on subscribing, then on every change of uid.
     * In a browser it also starts loading Google's script, so a sign-in click
     * can open the popup synchronously.
     */
    onAuthChange(callback: (user: DriveUser | null) => void): () => void {
      listeners.add(callback);
      scheduleExpiryNotice();
      const user = isConfigured() ? currentUser() : null;
      lastReportedUid = user?.uid ?? null;
      callback(user);
      if (isConfigured() && !nativeAuth) ensureGis().catch(() => {});
      return () => {
        listeners.delete(callback);
      };
    },

    signIn,

    async signOut(): Promise<void> {
      endSession();
      await nativeSignOut();
    },

    /**
     * Delete every AppMyTrip file from the user's Drive and revoke this app's
     * access, then sign out. Google must be reachable *before* anything is
     * deleted: losing the data but keeping the grant would be the worse half.
     */
    async deleteAllSyncedData(): Promise<void> {
      if (!session?.user) {
        throw new DriveSyncError("Not connected to Google Drive.", { code: "signed-out" });
      }
      const revoke = nativeAuth ? revokeOverHttp : await gisRevoker();
      const token = await accessToken();
      dropQueuedWrites();
      await flushChain;
      const files = await listDeviceFiles();
      await Promise.all(
        files.map((file) =>
          driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`, { method: "DELETE" }),
        ),
      );
      await revoke(token);
      endSession();
      await nativeSignOut();
    },

    /** Live records of one collection plus the ids whose newest version is a delete. */
    async loadAll(collection: string): Promise<{ items: DriveRecord[]; deletedIds: string[] }> {
      const merged = await readMerged();
      return {
        items: merged.collections[collection] ?? [],
        deletedIds: merged.deleted[collection] ?? [],
      };
    },

    upsert: (collection: string, item: DriveRecord): Promise<void> =>
      enqueue({ type: "upsert", collection, item }),

    remove: (collection: string, id: string): Promise<void> =>
      enqueue({ type: "delete", collection, id }),
  };
}
