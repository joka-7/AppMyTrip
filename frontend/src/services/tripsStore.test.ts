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
  browserPopupRedirectResolver: {},
  signInWithPopup: vi.fn(async () => ({
    user: { uid: "u1", email: "a@b.com", displayName: "A" },
  })),
  signInWithRedirect: vi.fn(async () => {}),
  getRedirectResult: vi.fn(async () => null),
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
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("signInWithGoogle returns the signed-in session", async () => {
    const auth = await import("firebase/auth");
    vi.mocked(auth.signInWithPopup).mockResolvedValue({
      user: { uid: "u1", email: "a@b.com", displayName: "A" },
    } as never);
    const { signInWithGoogle } = await import("./tripsStore");
    const session = await signInWithGoogle();
    expect(session).toEqual({ uid: "u1", email: "a@b.com", displayName: "A" });
  });

  // Regression guard: mobile browsers (especially an installed/home-screen
  // Safari icon) routinely can't complete the popup handshake — this used to
  // leave those visitors stuck on an error a desktop popup would never hit.
  it("signInWithGoogle falls back to a redirect when the popup is blocked, and returns null", async () => {
    const auth = await import("firebase/auth");
    vi.mocked(auth.signInWithPopup).mockRejectedValue(
      Object.assign(new Error("popup blocked"), { code: "auth/popup-blocked" }),
    );
    const { signInWithGoogle } = await import("./tripsStore");
    const session = await signInWithGoogle();
    expect(session).toBeNull();
    expect(auth.signInWithRedirect).toHaveBeenCalledTimes(1);
  });

  it("signInWithGoogle rethrows a popup failure that isn't worth retrying as a redirect", async () => {
    const auth = await import("firebase/auth");
    vi.mocked(auth.signInWithPopup).mockRejectedValue(
      Object.assign(new Error("network down"), { code: "auth/network-request-failed" }),
    );
    const { signInWithGoogle } = await import("./tripsStore");
    await expect(signInWithGoogle()).rejects.toThrow("network down");
    expect(auth.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("completeRedirectSignIn is a no-op when no redirect sign-in is pending", async () => {
    const auth = await import("firebase/auth");
    const { completeRedirectSignIn } = await import("./tripsStore");
    const session = await completeRedirectSignIn();
    expect(session).toBeNull();
    expect(auth.getRedirectResult).not.toHaveBeenCalled();
  });

  it("completeRedirectSignIn collects a pending redirect's result", async () => {
    const auth = await import("firebase/auth");
    vi.mocked(auth.signInWithPopup).mockRejectedValue(
      Object.assign(new Error("popup blocked"), { code: "auth/popup-blocked" }),
    );
    vi.mocked(auth.getRedirectResult).mockResolvedValue({
      user: { uid: "u2", email: "c@d.com", displayName: "C" },
    } as never);
    const { signInWithGoogle, completeRedirectSignIn } = await import("./tripsStore");
    await signInWithGoogle(); // marks a redirect as pending
    const session = await completeRedirectSignIn();
    expect(session).toEqual({ uid: "u2", email: "c@d.com", displayName: "C" });
    // Pending flag is one-shot — a second call shouldn't re-hit the SDK.
    await completeRedirectSignIn();
    expect(auth.getRedirectResult).toHaveBeenCalledTimes(1);
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
