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
  /** Written before a Firestore update so a failure in between never locks the owner out. */
  nextOwnerToken: string | null;
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

function parseShare(value: unknown): ShareSecrets | null {
  if (!isObject(value)) return null;
  const { id, key, ownerToken, nextOwnerToken } = value;
  if (typeof id !== "string" || typeof key !== "string" || typeof ownerToken !== "string") {
    return null;
  }
  return {
    id,
    key,
    ownerToken,
    nextOwnerToken: typeof nextOwnerToken === "string" ? nextOwnerToken : null,
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

export function createTripsStore({
  drive,
  shares,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  onSignOut = clearDraft,
}: {
  drive: DriveSync;
  shares: SharedTripsBackend;
  now?: () => Date;
  newId?: () => string;
  /** Cross-account safety: work left on this device must not be shown to the next account. */
  onSignOut?: () => void;
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
        nextOwnerToken: null,
      };
      // Secrets reach Drive before the share exists, so a published link is never orphaned.
      await drive.upsert(TRIPS, toRecord({ ...stored, share }));
      await shares.create(share.id, {
        ...encrypted,
        ownerTokenHash: await sha256Hex(share.ownerToken),
        expiresAt,
        revoked: false,
      });
      return share;
    }
    const next = generateOwnerToken();
    // Record the next token first: if the Firestore write then fails, the
    // owner still holds whichever token the stored hash belongs to.
    await drive.upsert(
      TRIPS,
      toRecord({ ...stored, share: { ...existing, nextOwnerToken: next } }),
    );
    await updateWithEitherToken(existing, next, {
      ...encrypted,
      ownerTokenHash: await sha256Hex(next),
      expiresAt,
      revoked: false,
    });
    const share: ShareSecrets = { ...existing, ownerToken: next, nextOwnerToken: null };
    await drive.upsert(TRIPS, toRecord({ ...stored, share }));
    return share;
  }

  async function updateWithEitherToken(
    share: ShareSecrets,
    next: string,
    data: Omit<Parameters<SharedTripsBackend["update"]>[1], "proof">,
  ): Promise<void> {
    const candidates = [share.ownerToken, share.nextOwnerToken].filter(
      (token): token is string => Boolean(token) && token !== next,
    );
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

  async function unpublish(stored: StoredTrip): Promise<void> {
    if (!stored.share) return;
    const next = generateOwnerToken();
    await updateWithEitherToken(stored.share, next, {
      ciphertext: "",
      iv: "",
      ownerTokenHash: await sha256Hex(next),
      expiresAt: null,
      revoked: true,
    });
  }

  return {
    isConfigured: () => drive.isCloudConfigured(),
    getCurrentSession: (): CloudSession | null => drive.currentUser(),
    onAuthChange: (callback: (user: CloudSession | null) => void) => drive.onAuthChange(callback),
    signInWithGoogle: (): Promise<CloudSession> => drive.signIn(),

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
  listTrips,
  saveTrip,
  loadTrip,
  deleteTrip,
  shareTrip,
  shareLinkFor,
  unpublishTrip,
  deleteAllMyData,
  loadSharedTrip,
} = store;
