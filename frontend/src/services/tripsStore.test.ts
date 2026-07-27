import { describe, it, expect, vi, beforeEach } from "vitest";

// tripsStore pulls in Firebase at module load — mock the SDK and our thin
// firebase.ts wrapper so these stay unit tests (no network, no real app).
vi.mock("../firebase", () => ({
  isFirebaseConfigured: true,
  getFirebaseApp: vi.fn(async () => ({ name: "test-app" })),
}));

const authState: { currentUser: { uid: string; email: string; displayName: string } | null } = {
  currentUser: null,
};

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => authState),
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb(authState.currentUser);
    return () => {};
  }),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(async () => ({
    user: { uid: "u1", email: "a@b.com", displayName: "A" },
  })),
  signOut: vi.fn(async () => {
    authState.currentUser = null;
  }),
}));

const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => {
  const Timestamp = {
    fromMillis: (ms: number) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    }),
  };
  return {
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((_db, ...path: string[]) => ({ path: path.join("/") })),
    doc: vi.fn((_dbOrCol: unknown, ...path: string[]) => {
      // doc(collection, id) or doc(db, "sharedTrips", id)
      if (typeof _dbOrCol === "object" && _dbOrCol && "path" in (_dbOrCol as object)) {
        const col = _dbOrCol as { path: string };
        const id = path[0] ?? `auto-${docs.size}`;
        return { id, path: `${col.path}/${id}` };
      }
      const id = path[path.length - 1];
      return { id, path: path.join("/") };
    }),
    getDoc: vi.fn(async (ref: { path: string }) => {
      const data = docs.get(ref.path);
      return {
        exists: () => Boolean(data),
        data: () => data,
      };
    }),
    getDocs: vi.fn(async () => ({ docs: [] })),
    setDoc: vi.fn(async (ref: { path: string; id: string }, data: Record<string, unknown>) => {
      const prev = docs.get(ref.path) ?? {};
      docs.set(ref.path, { ...prev, ...data });
    }),
    deleteDoc: vi.fn(async (ref: { path: string }) => {
      docs.delete(ref.path);
    }),
    updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      const prev = docs.get(ref.path) ?? {};
      docs.set(ref.path, { ...prev, ...data });
    }),
    query: vi.fn((col) => col),
    orderBy: vi.fn(),
    serverTimestamp: vi.fn(() => "SERVER_TS"),
    deleteField: vi.fn(() => "DELETE_FIELD"),
    arrayUnion: vi.fn((v) => ({ _union: v })),
    Timestamp,
  };
});

describe("tripsStore", () => {
  beforeEach(() => {
    docs.clear();
    authState.currentUser = null;
    vi.resetModules();
  });

  it("signInWithGoogle returns the signed-in session", async () => {
    const { signInWithGoogle } = await import("./tripsStore");
    const session = await signInWithGoogle();
    expect(session).toEqual({ uid: "u1", email: "a@b.com", displayName: "A" });
  });

  it("saveTrip writes a doc and returns its id", async () => {
    const { saveTrip } = await import("./tripsStore");
    const id = await saveTrip(
      "u1",
      { title: "T", dates: "Mon", days: [] },
      { tripId: "trip-1", stage: "step3" },
    );
    expect(id).toBe("trip-1");
    expect(docs.get("users/u1/trips/trip-1")).toEqual(
      expect.objectContaining({ title: "T", stage: "step3" }),
    );
  });

  it("loadSharedTrip rejects an expired link", async () => {
    const { Timestamp } = await import("firebase/firestore");
    docs.set("sharedTrips/old", {
      title: "Old",
      dates: "",
      days: [],
      expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    const { loadSharedTrip } = await import("./tripsStore");
    await expect(loadSharedTrip("old")).rejects.toThrow(/expired/i);
  });

  it("loadSharedTrip returns trip content for a live link", async () => {
    docs.set("sharedTrips/live", {
      title: "Live",
      dates: "Mon",
      days: [{ dayNum: 1, activities: [] }],
      ownerId: "owner",
      ownerEmail: "o@x.com",
      adminEmails: ["o@x.com"],
    });
    const { loadSharedTrip } = await import("./tripsStore");
    const result = await loadSharedTrip("live");
    expect(result.trip.title).toBe("Live");
    expect(result.meta.ownerId).toBe("owner");
    expect(result.meta.adminEmails).toEqual(["o@x.com"]);
  });
});
