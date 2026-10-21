import { describe, it, expect, vi } from "vitest";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "./appDesign";
import type { DriveRecord, DriveSync, DriveUser } from "./driveSync";
import { sha256Hex } from "./shareCrypto";
import type { SharedTripDoc, SharedTripWrite, SharedTripsBackend } from "./sharedTripsFirestore";
import { SharedTripUnavailableError, TripNotFoundError, createTripsStore } from "./tripsStore";

const USER: DriveUser = { uid: "u1", email: "a@b.com", displayName: "A" };

const trip = (title: string): TripData => ({
  title,
  dates: "1-3/7",
  days: [{ dayNum: 1, activities: [] }],
});

/** In-memory Drive with the same contract as driveSync's client. */
function fakeDrive() {
  const records = new Map<string, DriveRecord>();
  const drive = {
    records,
    deletedAll: false,
    isCloudConfigured: () => true,
    currentUser: () => USER,
    onAuthChange: vi.fn(() => () => {}),
    signIn: vi.fn(async () => USER),
    signOut: vi.fn(async () => {}),
    deleteAllSyncedData: vi.fn(async () => {
      records.clear();
      drive.deletedAll = true;
    }),
    loadAll: vi.fn(async () => ({ items: [...records.values()], deletedIds: [] })),
    upsert: vi.fn(async (_c: string, item: DriveRecord) => {
      records.set(item.id, structuredClone(item));
    }),
    remove: vi.fn(async (_c: string, id: string) => {
      records.delete(id);
    }),
  };
  return drive;
}

/** In-memory share store that enforces what firestore.rules enforces. */
function fakeShares() {
  const docs = new Map<string, SharedTripWrite & { hash: string }>();
  let failNextUpdate = false;
  let failNextCreate = false;
  const shares: SharedTripsBackend & {
    docs: typeof docs;
    failNextUpdate(): void;
    failNextCreate(): void;
  } = {
    docs,
    failNextUpdate: () => {
      failNextUpdate = true;
    },
    failNextCreate: () => {
      failNextCreate = true;
    },
    isConfigured: () => true,
    async create(id, data) {
      if (failNextCreate) {
        failNextCreate = false;
        throw new Error("network");
      }
      if (docs.has(id) || data.proof !== undefined || data.revoked) {
        throw new Error("permission-denied");
      }
      docs.set(id, { ...data, hash: data.ownerTokenHash });
    },
    async update(id, data) {
      if (failNextUpdate) {
        failNextUpdate = false;
        throw new Error("network");
      }
      const current = docs.get(id);
      if (!current || data.proof === undefined) throw new Error("permission-denied");
      if ((await sha256Hex(data.proof)) !== current.hash) throw new Error("permission-denied");
      if (data.ownerTokenHash === current.hash) throw new Error("permission-denied");
      docs.set(id, { ...data, hash: data.ownerTokenHash });
    },
    async get(id): Promise<SharedTripDoc | null> {
      const d = docs.get(id);
      if (!d || d.revoked) return null;
      if (d.expiresAt && d.expiresAt.getTime() < Date.now()) return null;
      return { ciphertext: d.ciphertext, iv: d.iv, expiresAt: d.expiresAt };
    },
  };
  return shares;
}

function build() {
  const drive = fakeDrive();
  const shares = fakeShares();
  const onSignOut = vi.fn();
  let clock = Date.now();
  let ids = 0;
  const store = createTripsStore({
    drive: drive as unknown as DriveSync,
    shares,
    now: () => new Date((clock += 1000)),
    newId: () => `trip-${++ids}`,
    onSignOut,
  });
  return { store, drive, shares, onSignOut };
}

function linkParts(link: string) {
  const url = new URL(link);
  return {
    id: url.searchParams.get("shared") ?? "",
    key: new URLSearchParams(url.hash.slice(1)).get("k") ?? "",
  };
}

describe("tripsStore", () => {
  describe("saveTrip / loadTrip / listTrips", () => {
    it("round-trips a trip through Drive and lists newest first", async () => {
      const { store } = build();
      const first = await store.saveTrip(trip("Rome"), { stage: "step2" });
      const second = await store.saveTrip(trip("Paris"));
      expect((await store.loadTrip(first)).trip.title).toBe("Rome");
      expect(await store.listTrips()).toEqual([
        expect.objectContaining({ id: second, name: "Paris", stage: null }),
        expect.objectContaining({ id: first, name: "Rome", stage: "step2" }),
      ]);
    });

    it("overwrites by tripId and keeps the trip's share", async () => {
      const { store } = build();
      const id = await store.saveTrip(trip("Rome"));
      const link = await store.shareTrip(id, trip("Rome"));
      await store.saveTrip(trip("Rome v2"), { tripId: id });
      expect(await store.shareLinkFor(id)).toBe(link);
      expect((await store.loadTrip(id)).trip.title).toBe("Rome v2");
    });

    it("skips malformed Drive records instead of trusting them", async () => {
      const { store, drive } = build();
      drive.records.set("bad", { id: "bad", trip: "not an object" });
      await store.saveTrip(trip("Rome"));
      expect((await store.listTrips()).map((t) => t.name)).toEqual(["Rome"]);
      await expect(store.loadTrip("bad")).rejects.toBeInstanceOf(TripNotFoundError);
    });
  });

  describe("shareTrip / loadSharedTrip", () => {
    it("stores only ciphertext, and the link's key opens it", async () => {
      const { store, shares } = build();
      const id = await store.saveTrip(trip("Secret Rome"));
      const link = await store.shareTrip(id, trip("Secret Rome"), DEFAULT_APP_DESIGN);
      const { id: shareId, key } = linkParts(link);
      expect(JSON.stringify([...shares.docs.values()])).not.toContain("Secret");
      expect(link).not.toContain("Secret");
      const opened = await store.loadSharedTrip(shareId, key);
      expect(opened.trip.title).toBe("Secret Rome");
    });

    it("re-sharing keeps the same link and publishes the new content and expiry", async () => {
      const { store } = build();
      const id = await store.saveTrip(trip("Rome"));
      const first = await store.shareTrip(id, trip("Rome"));
      const again = await store.shareTrip(id, trip("Rome, updated"), undefined, 7);
      expect(again).toBe(first);
      const { id: shareId, key } = linkParts(again);
      const opened = await store.loadSharedTrip(shareId, key);
      expect(opened.trip.title).toBe("Rome, updated");
      expect(opened.meta.expiresAt).not.toBeNull();
    });

    it("recovers when a re-share's Firestore write failed after the next token was recorded", async () => {
      const { store, shares } = build();
      const id = await store.saveTrip(trip("Rome"));
      await store.shareTrip(id, trip("Rome"));
      shares.failNextUpdate();
      await expect(store.shareTrip(id, trip("Rome 2"))).rejects.toThrow("network");
      const link = await store.shareTrip(id, trip("Rome 3"));
      const { id: shareId, key } = linkParts(link);
      expect((await store.loadSharedTrip(shareId, key)).trip.title).toBe("Rome 3");
    });

    it("recovers when the first publish never reached Firestore", async () => {
      const { store, shares } = build();
      const id = await store.saveTrip(trip("Rome"));
      shares.failNextCreate();
      await expect(store.shareTrip(id, trip("Rome"))).rejects.toThrow("network");
      const link = await store.shareTrip(id, trip("Rome"));
      const { id: shareId, key } = linkParts(link);
      expect((await store.loadSharedTrip(shareId, key)).trip.title).toBe("Rome");
    });

    it.each([
      ["a missing share", "nope", undefined],
      ["a wrong key", undefined, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ])("fails on %s", async (_name, overrideId, overrideKey) => {
      const { store } = build();
      const id = await store.saveTrip(trip("Rome"));
      const parts = linkParts(await store.shareTrip(id, trip("Rome")));
      await expect(
        store.loadSharedTrip(overrideId ?? parts.id, overrideKey ?? parts.key),
      ).rejects.toThrow();
    });

    it("refuses to share a trip that was never saved", async () => {
      const { store } = build();
      await expect(store.shareTrip("missing", trip("Rome"))).rejects.toBeInstanceOf(
        TripNotFoundError,
      );
    });
  });

  describe("deleteTrip / unpublishTrip", () => {
    it("deleting a trip unpublishes its link first", async () => {
      const { store, drive } = build();
      const id = await store.saveTrip(trip("Rome"));
      const { id: shareId, key } = linkParts(await store.shareTrip(id, trip("Rome")));
      await store.deleteTrip(id);
      expect(drive.records.has(id)).toBe(false);
      await expect(store.loadSharedTrip(shareId, key)).rejects.toBeInstanceOf(
        SharedTripUnavailableError,
      );
    });

    it("unpublishing keeps the trip but kills the link", async () => {
      const { store } = build();
      const id = await store.saveTrip(trip("Rome"));
      const { id: shareId, key } = linkParts(await store.shareTrip(id, trip("Rome")));
      await store.unpublishTrip(id);
      expect(await store.shareLinkFor(id)).toBeNull();
      await expect(store.loadSharedTrip(shareId, key)).rejects.toBeInstanceOf(
        SharedTripUnavailableError,
      );
    });
  });

  describe("signOutOfGoogle / deleteAllMyData", () => {
    it("signing out clears work left on this device", async () => {
      const { store, drive, onSignOut } = build();
      await store.signOutOfGoogle();
      expect(drive.signOut).toHaveBeenCalled();
      expect(onSignOut).toHaveBeenCalled();
    });

    it("deleting all data unpublishes every share before wiping Drive", async () => {
      const { store, drive, shares, onSignOut } = build();
      const a = await store.saveTrip(trip("Rome"));
      const b = await store.saveTrip(trip("Paris"));
      await store.shareTrip(a, trip("Rome"));
      await store.shareTrip(b, trip("Paris"));
      await store.deleteAllMyData();
      expect([...shares.docs.values()].every((d) => d.revoked && d.ciphertext === "")).toBe(true);
      expect(drive.deletedAll).toBe(true);
      expect(onSignOut).toHaveBeenCalled();
    });
  });
});
