// Saves, loads and shares trips without the operator being able to read them.
//
// - Private trips live in the signed-in user's own Google Drive appDataFolder
//   (driveSync.ts). There is no AppMyTrip database of trips.
// - A shared trip is encrypted in the browser (shareCrypto.ts); only the
//   ciphertext is stored (sharedTripsFirestore.ts) and the key travels in the
//   link's #fragment. Share links are read-only.
// - The share's id, key and owner token are kept in the trip's own Drive
//   record, so only the owner can re-publish or unpublish it, from any device.
import type { TripData } from "../api";
import { type AppDesign, DEFAULT_APP_DESIGN, normalizeAppDesign } from "./appDesign";
import { clearDraft } from "./draftStore";
import type { DriveRecord, DriveSync, DriveUser } from "./driveSync";
import { ensureStartWeekday, normalizeTripForLoad } from "./normalizeTrip";
import {
  decryptJson,
  encryptJson,
  generateOwnerToken,
  generateShareKey,
  sha256Hex,
  toBase64Url,
} from "./shareCrypto";
import { driveClient } from "./driveClient";
import { firestoreSharedTrips, type SharedTripsBackend } from "./sharedTripsFirestore";
import { buildShareUrl } from "./shareLink";

const TRIPS = "trips";
const SHARE_ID_BYTES = 16;
/** Which account the work left on this device belongs to (see claimDeviceData). */
const DEVICE_OWNER_KEY = "appmytrip_device_owner_v1";
/** base64url of SHARE_ID_BYTES / 32-byte keys and tokens. */
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Tokens whose write to Firestore may have landed; capped so a long failure streak can't grow a record forever. */
const MAX_PENDING_TOKENS = 10;

export type CloudSession = DriveUser;

/**
 * Which point in the builder a trip was saved at — shown next to its name in
 * "My trips" so multiple saves of the same work-in-progress are distinguishable.
 * "final" means it was saved from the finished/shared app view.
 */
export type TripStage = "step1" | "step2" | "step3" | "step4" | "final";

export interface CloudTripSummary {
  id: string;
  name: string;
  modifiedTime: string;
  stage: TripStage | null;
}

export interface SharedTripMeta {
  expiresAt: string | null;
}

/** Secrets of a published share, stored only in the owner's Drive. */
interface ShareSecrets {
  id: string;
  key: string;
  ownerToken: string;
  /**
   * New tokens recorded before each Firestore update and dropped only once it
   * succeeded and the new token was promoted. Any of them may be the one the
   * stored hash belongs to, so none is ever discarded unconfirmed.
   */
  pendingTokens: string[];
  /** Token of the share's edit link, or null when it has none. Lives only here and in edit links. */
  editToken: string | null;
}

interface StoredTrip {
  id: string;
  title: string;
  stage: TripStage | null;
  updatedAt: string;
  trip: TripData;
  appDesign: AppDesign;
  share: ShareSecrets | null;
}

const TRIP_STAGES: readonly TripStage[] = ["step1", "step2", "step3", "step4", "final"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isSecret = (value: unknown): value is string =>
  typeof value === "string" && SECRET_PATTERN.test(value);

function parseShare(value: unknown): ShareSecrets | null {
  if (!isObject(value)) return null;
  const { id, key, ownerToken, pendingTokens, editToken } = value;
  if (
    typeof id !== "string" ||
    !SHARE_ID_PATTERN.test(id) ||
    !isSecret(key) ||
    !isSecret(ownerToken)
  ) {
    return null;
  }
  return {
    id,
    key,
    ownerToken,
    pendingTokens: Array.isArray(pendingTokens) ? pendingTokens.filter(isSecret) : [],
    editToken: isSecret(editToken) ? editToken : null,
  };
}

/** Drive content is external input: anything malformed is dropped, never trusted. */
function parseStoredTrip(record: DriveRecord): StoredTrip | null {
  if (!isObject(record.trip) || !Array.isArray(record.trip.days)) return null;
  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title : "",
    stage: TRIP_STAGES.includes(record.stage as TripStage) ? (record.stage as TripStage) : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    trip: normalizeTripForLoad(record.trip as unknown as TripData),
    appDesign: normalizeAppDesign(record.appDesign as Partial<AppDesign> | undefined),
    share: parseShare(record.share),
  };
}

function toRecord(stored: StoredTrip): DriveRecord {
  return { ...stored };
}

export class TripNotFoundError extends Error {
  constructor() {
    super("Trip not found.");
    this.name = "TripNotFoundError";
  }
}

export class SharedTripUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedTripUnavailableError";
  }
}

/** The payload a share link decrypts to. */
interface SharedPayload {
  trip: TripData;
  appDesign: AppDesign;
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createTripsStore({
  drive,
  shares,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  onSignOut = clearDraft,
  storage = browserStorage(),
}: {
  drive: DriveSync;
  shares: SharedTripsBackend;
  now?: () => Date;
  newId?: () => string;
  /** Cross-account safety: work left on this device must not be shown to the next account. */
  onSignOut?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}) {
  async function loadStoredTrips(): Promise<StoredTrip[]> {
    const { items } = await drive.loadAll(TRIPS);
    return items.flatMap((record) => {
      const parsed = parseStoredTrip(record);
      return parsed ? [parsed] : [];
    });
  }

  async function loadStoredTrip(tripId: string): Promise<StoredTrip> {
    const found = (await loadStoredTrips()).find((t) => t.id === tripId);
    if (!found) throw new TripNotFoundError();
    return found;
  }

  async function publish(stored: StoredTrip, expiresInDays?: number): Promise<ShareSecrets> {
    const existing = stored.share;
    const key = existing?.key ?? generateShareKey();
    const payload: SharedPayload = { trip: stored.trip, appDesign: stored.appDesign };
    const encrypted = await encryptJson(payload, key);
    const expiresAt = expiresInDays ? new Date(now().getTime() + expiresInDays * 86_400_000) : null;
    if (!existing) {
      const share: ShareSecrets = {
        id: toBase64Url(crypto.getRandomValues(new Uint8Array(SHARE_ID_BYTES))),
        key,
        ownerToken: generateOwnerToken(),
        pendingTokens: [],
        editToken: null,
      };
      // Secrets reach Drive before the share exists, so a published link is never orphaned.
      await drive.upsert(TRIPS, toRecord({ ...stored, share }));
      await shares.create(share.id, {
        ...encrypted,
        ownerTokenHash: await sha256Hex(share.ownerToken),
        editTokenHash: null,
        expiresAt,
        revoked: false,
      });
      return share;
    }
    return ownerUpdate(stored, existing, {
      ...encrypted,
      expiresAt,
      editToken: existing.editToken,
    });
  }

  /**
   * Every owner write to an existing share: rotates the owner token and sets
   * the content, expiry and edit link. The next token is recorded in Drive
   * first, next to every earlier unconfirmed one, so if the Firestore write or
   * the Drive write after it fails, the owner still holds whichever token the
   * stored hash belongs to.
   */
  async function ownerUpdate(
    stored: StoredTrip,
    share: ShareSecrets,
    data: { ciphertext: string; iv: string; expiresAt: Date | null; editToken: string | null },
  ): Promise<ShareSecrets> {
    const next = generateOwnerToken();
    const pendingTokens = [...share.pendingTokens, next].slice(-MAX_PENDING_TOKENS);
    await drive.upsert(TRIPS, toRecord({ ...stored, share: { ...share, pendingTokens } }));
    await updateWithAnyToken(share, next, {
      ciphertext: data.ciphertext,
      iv: data.iv,
      ownerTokenHash: await sha256Hex(next),
      editTokenHash: data.editToken ? await sha256Hex(data.editToken) : null,
      expiresAt: data.expiresAt,
      revoked: false,
    });
    const updated: ShareSecrets = {
      ...share,
      ownerToken: next,
      pendingTokens: [],
      editToken: data.editToken,
    };
    await drive.upsert(TRIPS, toRecord({ ...stored, share: updated }));
    return updated;
  }

  /** Sets or removes the edit link, keeping the share's current content and expiry. */
  async function setEditToken(tripId: string, editToken: string | null): Promise<ShareSecrets> {
    const stored = await loadStoredTrip(tripId);
    if (!stored.share) throw new Error("Share the trip before creating an edit link.");
    // Keep what is live now, which may include edits made through the link.
    const current = await shares.get(stored.share.id);
    if (!current) {
      throw new SharedTripUnavailableError("This shared trip link has expired or was removed.");
    }
    return ownerUpdate(stored, stored.share, {
      ciphertext: current.ciphertext,
      iv: current.iv,
      expiresAt: current.expiresAt,
      editToken,
    });
  }

  async function updateWithAnyToken(
    share: ShareSecrets,
    next: string,
    data: Omit<Parameters<SharedTripsBackend["update"]>[1], "proof">,
  ): Promise<void> {
    const candidates = [share.ownerToken, ...share.pendingTokens].filter((t) => t !== next);
    let lastError: unknown = null;
    for (const proof of candidates) {
      try {
        await shares.update(share.id, { ...data, proof });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    // A share whose first publish never reached Firestore has no document yet;
    // creating it is allowed only while it does not exist, so this cannot
    // take over someone else's share.
    try {
      await shares.create(share.id, data);
    } catch {
      throw lastError ?? new Error("No owner token for this share.");
    }
  }

  /**
   * Revokes the share and gives it an expiry so the TTL policy deletes it. A
   * share that is already unreadable (removed by TTL, expired, or revoked)
   * counts as unpublished: otherwise an expired link would block deleting its
   * trip, and with it "Delete all my data".
   */
  async function unpublish(stored: StoredTrip): Promise<void> {
    if (!stored.share) return;
    const next = generateOwnerToken();
    try {
      await updateWithAnyToken(stored.share, next, {
        ciphertext: "",
        iv: "",
        ownerTokenHash: await sha256Hex(next),
        editTokenHash: null,
        expiresAt: now(),
        revoked: true,
      });
    } catch (err) {
      if ((await shares.get(stored.share.id)) !== null) throw err;
    }
  }

  return {
    isConfigured: () => drive.isCloudConfigured(),
    getCurrentSession: (): CloudSession | null => drive.currentUser(),
    onAuthChange: (callback: (user: CloudSession | null) => void) => drive.onAuthChange(callback),
    signInWithGoogle: (): Promise<CloudSession> => drive.signIn(),

    /**
     * Call when an account connects. Returns true when the work left on this
     * device (the builder draft) belonged to a different account: it has been
     * cleared, and the caller must reset its in-memory trip too, so account A's
     * trip is never saved into account B's Drive on a shared device.
     */
    claimDeviceData(uid: string): boolean {
      const previous = storage?.getItem(DEVICE_OWNER_KEY) ?? null;
      try {
        storage?.setItem(DEVICE_OWNER_KEY, uid);
      } catch {
        // Storage blocked: nothing persists on this device to leak anyway.
      }
      if (previous === null || previous === uid) return false;
      onSignOut();
      return true;
    },

    async signOutOfGoogle(): Promise<void> {
      await drive.signOut();
      onSignOut();
    },

    async listTrips(): Promise<CloudTripSummary[]> {
      return (await loadStoredTrips())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((t) => ({
          id: t.id,
          name: t.title || "Untitled trip",
          modifiedTime: t.updatedAt,
          stage: t.stage,
        }));
    },

    /** Creates a trip, or overwrites the one with `tripId`, keeping its share secrets. */
    async saveTrip(
      trip: TripData,
      options?: { appDesign?: AppDesign; tripId?: string; stage?: TripStage },
    ): Promise<string> {
      const id = options?.tripId ?? newId();
      const existing = options?.tripId
        ? (await loadStoredTrips()).find((t) => t.id === id)
        : undefined;
      const tripToSave = ensureStartWeekday(trip);
      await drive.upsert(
        TRIPS,
        toRecord({
          id,
          title: tripToSave.title,
          stage: options?.stage ?? existing?.stage ?? null,
          updatedAt: now().toISOString(),
          trip: tripToSave,
          appDesign: options?.appDesign ?? DEFAULT_APP_DESIGN,
          share: existing?.share ?? null,
        }),
      );
      return id;
    },

    async loadTrip(tripId: string): Promise<{ trip: TripData; appDesign: AppDesign }> {
      const stored = await loadStoredTrip(tripId);
      return { trip: stored.trip, appDesign: stored.appDesign };
    },

    /** Unpublishes the trip's share link first, so deleting never leaves a live link behind. */
    async deleteTrip(tripId: string): Promise<void> {
      const stored = (await loadStoredTrips()).find((t) => t.id === tripId);
      if (stored) await unpublish(stored);
      await drive.remove(TRIPS, tripId);
    },

    /**
     * Encrypts the saved trip, publishes the ciphertext and returns its link.
     * Re-sharing keeps the same link (same id and key) with fresh content and
     * expiry. `expiresInDays` omitted or 0 means no expiry.
     */
    async shareTrip(
      tripId: string,
      trip: TripData,
      appDesign?: AppDesign,
      expiresInDays?: number,
    ): Promise<string> {
      if (!shares.isConfigured()) throw new Error("Trip sharing is not configured.");
      const stored = await loadStoredTrip(tripId);
      const current: StoredTrip = {
        ...stored,
        trip: ensureStartWeekday(trip),
        appDesign: appDesign ?? stored.appDesign,
      };
      const share = await publish(current, expiresInDays);
      return buildShareUrl(share.id, share.key);
    },

    /** The trip's current share link, or null if it was never published. */
    async shareLinkFor(tripId: string): Promise<string | null> {
      const stored = await loadStoredTrip(tripId);
      return stored.share ? buildShareUrl(stored.share.id, stored.share.key) : null;
    },

    /** The trip's edit link, or null if it has none. */
    async editLinkFor(tripId: string): Promise<string | null> {
      const { share } = await loadStoredTrip(tripId);
      return share?.editToken ? buildShareUrl(share.id, share.key, share.editToken) : null;
    },

    /**
     * Creates the trip's edit link (or returns the existing one). Anyone who
     * holds it can change the shared trip; the view link stays read-only.
     */
    async createEditLink(tripId: string): Promise<string> {
      const { share: existing } = await loadStoredTrip(tripId);
      if (existing?.editToken) return buildShareUrl(existing.id, existing.key, existing.editToken);
      const share = await setEditToken(tripId, generateOwnerToken());
      return buildShareUrl(share.id, share.key, share.editToken ?? undefined);
    },

    /** Turns the edit link off: every copy of it stops being able to save. */
    async disableEditLink(tripId: string): Promise<void> {
      const { share } = await loadStoredTrip(tripId);
      if (!share?.editToken) return;
      await setEditToken(tripId, null);
    },

    /** Saves a trip through an edit link. No sign-in: the link's key and edit token are the access. */
    async saveSharedEdit(
      shareId: string,
      key: string,
      editToken: string,
      trip: TripData,
      appDesign: AppDesign,
    ): Promise<void> {
      if (!SHARE_ID_PATTERN.test(shareId) || !isSecret(key) || !isSecret(editToken)) {
        throw new SharedTripUnavailableError("This edit link is not valid.");
      }
      const payload: SharedPayload = { trip: ensureStartWeekday(trip), appDesign };
      const encrypted = await encryptJson(payload, key);
      const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(SHARE_ID_BYTES)));
      await shares.saveEdit(shareId, { ...encrypted, editToken, nonce });
    },

    async unpublishTrip(tripId: string): Promise<void> {
      const stored = await loadStoredTrip(tripId);
      await unpublish(stored);
      await drive.upsert(TRIPS, toRecord({ ...stored, share: null }));
    },

    /** Unpublishes every share, then deletes all Drive data and revokes access. */
    async deleteAllMyData(): Promise<void> {
      for (const stored of await loadStoredTrips()) await unpublish(stored);
      await drive.deleteAllSyncedData();
      onSignOut();
    },

    /** Opens a share link. No sign-in: the key from the link's #fragment decrypts it. */
    async loadSharedTrip(
      shareId: string,
      key: string,
    ): Promise<{ trip: TripData; appDesign: AppDesign; meta: SharedTripMeta }> {
      if (!SHARE_ID_PATTERN.test(shareId)) {
        throw new SharedTripUnavailableError("This shared trip link is not valid.");
      }
      const doc = await shares.get(shareId);
      if (!doc) {
        throw new SharedTripUnavailableError("This shared trip link has expired or was removed.");
      }
      const payload = await decryptJson(doc, key);
      if (!isObject(payload) || !isObject(payload.trip) || !Array.isArray(payload.trip.days)) {
        throw new SharedTripUnavailableError("This shared trip could not be read.");
      }
      return {
        trip: normalizeTripForLoad(payload.trip as unknown as TripData),
        appDesign: normalizeAppDesign(payload.appDesign as Partial<AppDesign> | undefined),
        meta: { expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null },
      };
    },
  };
}

const store = createTripsStore({ drive: driveClient, shares: firestoreSharedTrips });

export const {
  isConfigured,
  getCurrentSession,
  onAuthChange,
  signInWithGoogle,
  signOutOfGoogle,
  claimDeviceData,
  listTrips,
  saveTrip,
  loadTrip,
  deleteTrip,
  shareTrip,
  shareLinkFor,
  editLinkFor,
  createEditLink,
  disableEditLink,
  saveSharedEdit,
  unpublishTrip,
  deleteAllMyData,
  loadSharedTrip,
} = store;
