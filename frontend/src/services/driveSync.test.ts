import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DriveSyncDeps,
  type GoogleIdentity,
  type NativeAuth,
  STALE_DEVICE_FILE_MS,
  applyOperations,
  createDriveSync,
  findCompactableFiles,
  mergeDeviceDocuments,
  nextStamp,
  parseDeviceDocument,
} from "./driveSync";

// Ported from KanDOne's driveSync tests: every case below pins a bug that
// was found there (see the comment on each describe block).

const NOW = 1_700_000_000_000;
const USER = { sub: "google-sub-1", email: "user@example.com", name: "Dana Levi" };
const SESSION_KEY = "appmytrip_drive_session_v1";
const TRIPS = "trips";

interface FakeFile {
  name: string;
  body: string;
  modifiedTime?: string;
}

const deviceFile = (device: string, collections: Record<string, unknown> = {}): FakeFile => ({
  name: `appmytrip-${device}.json`,
  body: JSON.stringify({ version: 1, device, collections }),
});

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: (name: string) => headers[name] ?? null },
  }) as unknown as Response;

/** In-memory stand-in for the Drive v3 + userinfo endpoints this module calls. */
function fakeGoogle({
  files = {} as Record<string, FakeFile>,
  failWith = null as number | null,
  pageLimit = Infinity,
  failRead = {} as Record<string, number | "network">,
  revokedTokens = [] as string[],
  flaky = null as { status: number; times: number; method?: string; retryAfter?: string } | null,
} = {}) {
  const state = {
    files: { ...files } as Record<string, FakeFile>,
    nextId: 1,
    deleted: [] as string[],
    clock: 0,
    offline: false,
    revoked: null as string | null,
  };
  const touch = (file: FakeFile) => {
    file.modifiedTime = new Date(NOW + ++state.clock).toISOString();
    return file;
  };
  Object.values(state.files).forEach((file) => {
    if (!file.modifiedTime) touch(file);
  });
  let flakyLeft = flaky?.times ?? 0;

  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    if (state.offline) throw new TypeError("Failed to fetch");
    if (failWith) return reply({}, failWith);
    if (
      flaky &&
      flakyLeft > 0 &&
      !url.includes("userinfo") &&
      (!flaky.method || (init.method ?? "GET") === flaky.method)
    ) {
      flakyLeft -= 1;
      return reply({}, flaky.status, flaky.retryAfter ? { "Retry-After": flaky.retryAfter } : {});
    }
    if (revokedTokens.some((t) => auth === `Bearer ${t}`)) return reply({}, 401);
    if (url === "https://oauth2.googleapis.com/revoke") {
      state.revoked = new URLSearchParams(String(init.body)).get("token");
      return reply({});
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return reply(USER);
    if (url.includes("/upload/drive/v3/files?uploadType=multipart")) {
      const parts = String(init.body).split("\r\n");
      const id = `new-${state.nextId++}`;
      state.files[id] = touch({ name: JSON.parse(parts[3]).name, body: parts[7] });
      return reply({ id });
    }
    const patch = url.match(/\/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (patch) {
      if (!state.files[patch[1]]) return reply({}, 404);
      state.files[patch[1]].body = String(init.body);
      touch(state.files[patch[1]]);
      return reply({});
    }
    const del = init.method === "DELETE" && url.match(/\/drive\/v3\/files\/([^?]+)$/);
    if (del) {
      if (!state.files[del[1]]) return reply({}, 404);
      delete state.files[del[1]];
      state.deleted.push(del[1]);
      return reply({}, 204);
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      const params = new URL(url).searchParams;
      const exact = params.get("q")?.match(/^name = '(.+)'$/)?.[1];
      const list = Object.entries(state.files)
        .filter(([, f]) => (exact ? f.name === exact : f.name.startsWith("appmytrip-")))
        .map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime }));
      const start = Number(params.get("pageToken") || 0);
      const end = start + Math.min(pageLimit, Number(params.get("pageSize")));
      return reply(
        end < list.length
          ? { files: list.slice(start, end), nextPageToken: String(end) }
          : { files: list.slice(start) },
      );
    }
    const modified = url.match(/\/drive\/v3\/files\/([^?]+)\?fields=modifiedTime/);
    if (modified) {
      const f = state.files[modified[1]];
      return f ? reply({ modifiedTime: f.modifiedTime }) : reply({}, 404);
    }
    const media = url.match(/\/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (media) {
      const failure = failRead[media[1]];
      if (failure === "network") {
        return {
          ok: true,
          status: 200,
          text: async () => {
            throw new TypeError("network error");
          },
        } as unknown as Response;
      }
      if (failure) return reply({}, failure);
      const f = state.files[media[1]];
      return f ? reply(f.body) : reply({}, 404);
    }
    throw new Error(`unexpected request ${url}`);
  });

  const stored = (id: string) => JSON.parse(state.files[id].body);
  return { state, fetchImpl, stored };
}

function fakeGis({ error = null as string | null } = {}) {
  const revoke = vi.fn((_token: string, done: () => void) => done());
  const client = {
    callback: (() => {}) as (r: {
      access_token?: string;
      expires_in?: number;
      error?: string;
    }) => void,
    requestAccessToken: vi.fn(() => {
      if (error) client.callback({ error });
      else client.callback({ access_token: "token-1", expires_in: 3600 });
    }),
  };
  const gis = {
    accounts: { oauth2: { initTokenClient: vi.fn(() => client), revoke } },
  } as unknown as GoogleIdentity;
  return { gis, client, revoke };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
}

function validSession(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    accessToken: "token-1",
    expiresAt: NOW + 3_600_000,
    user: { uid: USER.sub, email: USER.email, displayName: USER.name },
    ...overrides,
  });
}

const signedIn = () => memoryStorage({ [SESSION_KEY]: validSession() });
const expiredSession = () =>
  memoryStorage({ [SESSION_KEY]: validSession({ accessToken: null, expiresAt: 0 }) });

/** Stand-in for the Android sign-in: hands out `app-token-1`, `app-token-2`, … */
function fakeNativeAuth({ silent = "grant", interactive = "grant" } = {}) {
  let issued = 0;
  const grant = (mode: string) => {
    if (mode === "fail") return Promise.reject(new Error("needs the user"));
    if (mode === "none") return Promise.resolve(null);
    issued += 1;
    return Promise.resolve({ access_token: `app-token-${issued}`, expires_in: 3600 });
  };
  return {
    requestToken: vi.fn(({ interactive: isInteractive }: { interactive: boolean }) =>
      grant(isInteractive ? interactive : silent),
    ),
    signOut: vi.fn(async () => {}),
  } satisfies NativeAuth;
}

function build({
  google = fakeGoogle(),
  gis = fakeGis(),
  storage = memoryStorage(),
  clientId = "client-id",
  withLock = (task: () => Promise<void>) => task(),
  persistDeviceId = true,
  deviceIds = ["this", "next"],
  tabStorage = memoryStorage(),
  nativeAuth = null as NativeAuth | null,
  isOnline = (): boolean => true,
} = {}) {
  const ids = [...deviceIds];
  const sleeps: number[] = [];
  const deps: DriveSyncDeps = {
    clientId,
    fetchImpl: google.fetchImpl,
    loadGis: async () => gis.gis,
    storage,
    tabStorage,
    now: () => Date.now(),
    newDeviceId: () => ids.shift() ?? "spare",
    withLock,
    persistDeviceId,
    flushDelayMs: 100,
    nativeAuth,
    isOnline,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  };
  return { sync: createDriveSync(deps), google, gis, storage, sleeps };
}

/** Let the debounce fire and the queued Drive round-trips finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(150);
}

async function landed(promise: Promise<void>) {
  await settle();
  await promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseDeviceDocument", () => {
  it("keeps valid entries and drops malformed ones", () => {
    const parsed = parseDeviceDocument({
      version: 1,
      device: "d1",
      collections: {
        trips: {
          a: { item: { id: "a" }, at: 5 },
          b: { item: "text", at: 5 },
          c: { item: null, at: 6 },
          d: { item: { id: "d" }, at: "x" },
        },
      },
    });
    expect(parsed.collections.trips).toEqual({
      a: { item: { id: "a" }, at: 5 },
      c: { item: null, at: 6 },
    });
  });

  // A corrupt file treated as empty would be overwritten and its data lost.
  it.each([
    ["null", null, "corrupt-file"],
    ["an array", [], "corrupt-file"],
    ["a file with no device id", { version: 1 }, "corrupt-file"],
    ["a newer format", { version: 2, device: "d1" }, "unsupported-version"],
  ])("refuses %s instead of treating it as empty", (_name, raw, code) => {
    expect(() => parseDeviceDocument(raw)).toThrow(expect.objectContaining({ code }));
  });
});

describe("applyOperations", () => {
  it("stamps upserts and keeps deletes as tombstones without touching the input", () => {
    const base = parseDeviceDocument({
      version: 1,
      device: "d1",
      collections: { trips: { a: { item: { id: "a" }, at: 1 } } },
    });
    const next = applyOperations(
      base,
      [
        { type: "upsert", collection: TRIPS, item: { id: "b" } },
        { type: "delete", collection: TRIPS, id: "a" },
      ],
      50,
    );
    expect(next.collections.trips).toEqual({
      a: { item: null, at: 50 },
      b: { item: { id: "b" }, at: 50 },
    });
    expect(base.collections.trips.a.item).toEqual({ id: "a" });
  });
});

describe("mergeDeviceDocuments", () => {
  const doc = (device: string, trips: Record<string, unknown>) =>
    parseDeviceDocument({ version: 1, device, collections: { trips } });

  it.each([
    [
      "newer edit wins",
      [
        doc("a", { 1: { item: { id: "1", v: "old" }, at: 1 } }),
        doc("b", { 1: { item: { id: "1", v: "new" }, at: 2 } }),
      ],
      [{ id: "1", v: "new" }],
    ],
    [
      "newer delete hides an older copy",
      [doc("a", { 1: { item: { id: "1" }, at: 1 } }), doc("b", { 1: { item: null, at: 2 } })],
      [],
    ],
    [
      "older delete loses to a newer edit",
      [doc("a", { 1: { item: { id: "1" }, at: 3 } }), doc("b", { 1: { item: null, at: 2 } })],
      [{ id: "1" }],
    ],
    [
      "a tie goes to the higher device id",
      [
        doc("b", { 1: { item: { id: "1", v: "b" }, at: 1 } }),
        doc("a", { 1: { item: { id: "1", v: "a" }, at: 1 } }),
      ],
      [{ id: "1", v: "b" }],
    ],
  ])("%s", (_name, docs, expected) => {
    expect(mergeDeviceDocuments(docs).collections.trips).toEqual(expected);
  });

  it("reports the ids whose newest entry is a delete", () => {
    const { deleted } = mergeDeviceDocuments([
      doc("a", { 1: { item: { id: "1" }, at: 1 }, 2: { item: { id: "2" }, at: 5 } }),
      doc("b", { 1: { item: null, at: 2 }, 2: { item: null, at: 4 } }),
    ]);
    expect(deleted.trips).toEqual(["1"]);
  });
});

describe("nextStamp", () => {
  // Clock skew: a device whose clock runs behind must still win with a later edit.
  it.each([
    ["the clock is ahead of everything seen", 100, 50, 100],
    ["another device wrote with a clock running ahead", 100, 500, 501],
    ["a write landed in the same millisecond", 100, 100, 101],
  ])("stamps after %s", (_name, now, latestSeen, expected) => {
    expect(nextStamp(now, latestSeen)).toBe(expected);
  });
});

describe("findCompactableFiles", () => {
  const entry = (id: string, device: string, at: number, idleDays: number, lossy = false) => ({
    id,
    name: `appmytrip-${device}.json`,
    modifiedTime: new Date(NOW - idleDays * 86_400_000).toISOString(),
    lossy,
    document: parseDeviceDocument({
      version: 1,
      device,
      collections: { trips: { 1: { item: { id: "1", at }, at } } },
    }),
  });

  it("lists only files that are idle, superseded, readable in full and not this device's own", () => {
    const fresh = entry("fresh", "z", 9, 0);
    const files = [
      entry("old", "a", 1, 100),
      entry("lossy", "b", 1, 100, true),
      entry("own", "c", 1, 100),
      fresh,
    ];
    const idle = findCompactableFiles(files, { now: NOW, isOwn: (e) => e.id === "own" });
    expect(idle.map((e) => e.id)).toEqual(["old"]);
    expect(STALE_DEVICE_FILE_MS).toBe(90 * 86_400_000);
  });

  it("keeps an idle file that holds the newest copy of a record", () => {
    const files = [entry("winner", "a", 9, 100), entry("loser", "b", 1, 0)];
    expect(findCompactableFiles(files, { now: NOW, isOwn: () => false })).toEqual([]);
  });
});

describe("createDriveSync", () => {
  describe("signIn", () => {
    it("stores the session and reports the user to listeners", async () => {
      const { sync, storage } = build();
      const seen: unknown[] = [];
      sync.onAuthChange((u) => seen.push(u));
      const user = await sync.signIn();
      expect(user).toEqual({ uid: USER.sub, email: USER.email, displayName: USER.name });
      expect(seen).toEqual([null, user]);
      expect(JSON.parse(storage.getItem(SESSION_KEY) ?? "null").user).toEqual(user);
    });

    it("opens the Google popup synchronously once the script has preloaded, so the click is not blocked", async () => {
      const { sync, gis } = build();
      sync.onAuthChange(() => {});
      await vi.advanceTimersByTimeAsync(0);
      const pending = sync.signIn();
      const openedInClick = gis.client.requestAccessToken.mock.calls.length;
      await pending;
      expect(openedInClick).toBe(1);
    });

    it.each([
      ["a denied consent", { gis: fakeGis({ error: "access_denied" }) }, "access_denied"],
      ["a build with no client id", { clientId: "" }, "not-configured"],
    ])("rejects on %s", async (_name, options, code) => {
      const { sync } = build(options);
      await expect(sync.signIn()).rejects.toMatchObject({ code });
    });
  });

  describe("onAuthChange", () => {
    it("reports a stored session while its token is valid, and its expiry when it lapses", async () => {
      const { sync } = build({ storage: signedIn() });
      const seen: (string | null)[] = [];
      sync.onAuthChange((u) => seen.push(u?.email ?? null));
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(seen).toEqual([USER.email, null]);
    });
  });

  describe("upsert", () => {
    // One shared Drive file loses edits: each device writes only its own file.
    it("coalesces a burst of writes into one upload of this device's own file", async () => {
      const google = fakeGoogle({
        files: { other: deviceFile("other", { trips: { x: { item: { id: "x" }, at: 1 } } }) },
      });
      const { sync } = build({ google, storage: signedIn() });
      const otherBefore = google.state.files.other.body;
      await landed(
        Promise.all([sync.upsert(TRIPS, { id: "1" }), sync.upsert(TRIPS, { id: "2" })]).then(
          () => {},
        ),
      );
      expect(google.state.files["new-1"].name).toBe("appmytrip-this.json");
      expect(Object.keys(google.stored("new-1").collections.trips)).toEqual(["1", "2"]);
      expect(google.state.files.other.body).toBe(otherBefore);
    });

    it("recreates its file when Drive no longer has it", async () => {
      const google = fakeGoogle();
      const { sync } = build({ google, storage: signedIn() });
      await landed(sync.upsert(TRIPS, { id: "1" }));
      delete google.state.files["new-1"];
      await landed(sync.upsert(TRIPS, { id: "2" }));
      expect(Object.keys(google.stored("new-2").collections.trips)).toEqual(["2"]);
    });

    it.each([
      ["signed out", null, null, { code: "signed-out" }],
      ["the token has expired", validSession({ expiresAt: NOW - 1 }), null, { code: "signed-out" }],
      ["Drive fails", validSession(), 500, { status: 500 }],
    ])("rejects when %s", async (_name, stored, failWith, expected) => {
      const storage = memoryStorage(stored ? { [SESSION_KEY]: stored } : {});
      const { sync } = build({ google: fakeGoogle({ failWith }), storage });
      const done = sync.upsert(TRIPS, { id: "1" });
      done.catch(() => {});
      await settle();
      await expect(done).rejects.toMatchObject(expected);
    });

    // A corrupt own file must not block writes forever.
    it("leaves an unreadable own file untouched and continues in a new one", async () => {
      const corrupt = { name: "appmytrip-this.json", body: '{"version":1' };
      const google = fakeGoogle({ files: { mine: { ...corrupt } } });
      const { sync } = build({ google, storage: signedIn() });
      await landed(sync.upsert(TRIPS, { id: "1" }));
      expect([google.state.files.mine.body, google.state.files["new-1"].name]).toEqual([
        corrupt.body,
        "appmytrip-next.json",
      ]);
    });

    it("stamps a write after the newest entry already in Drive, even if another device's clock runs ahead", async () => {
      const ahead = NOW + 3_600_000;
      const google = fakeGoogle({
        files: {
          other: deviceFile("other", {
            trips: { 1: { item: { id: "1", v: "theirs" }, at: ahead } },
          }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      await sync.loadAll(TRIPS);
      await landed(sync.upsert(TRIPS, { id: "1", v: "mine" }));
      expect((await sync.loadAll(TRIPS)).items).toEqual([{ id: "1", v: "mine" }]);
    });

    // Two tabs without Web Locks overwrite each other: each gets its own device id.
    it("shares one device file across tabs only when tabs can be locked against each other", async () => {
      const results: string[][] = [];
      for (const persistDeviceId of [true, false]) {
        const storage = signedIn();
        const google = fakeGoogle();
        const firstTab = memoryStorage();
        const opens: [ReturnType<typeof memoryStorage>, string[]][] = [
          [firstTab, ["tab-1"]],
          [memoryStorage(), ["tab-2"]],
          [firstTab, ["tab-1-reloaded"]],
        ];
        for (const [tabStorage, deviceIds] of opens) {
          const { sync } = build({ google, storage, persistDeviceId, deviceIds, tabStorage });
          await landed(sync.upsert(TRIPS, { id: "1" }));
        }
        results.push(Object.values(google.state.files).map((f) => f.name));
      }
      expect(results).toEqual([
        ["appmytrip-tab-1.json"],
        ["appmytrip-tab-1.json", "appmytrip-tab-2.json"],
      ]);
    });
  });

  describe("remove", () => {
    // Deleted records come back unless the tombstone reaches the merge.
    it("hides the record even though another device still holds an older copy", async () => {
      const google = fakeGoogle({
        files: {
          other: deviceFile("other", { trips: { 1: { item: { id: "1" }, at: NOW - 10 } } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      await landed(sync.remove(TRIPS, "1"));
      expect(await sync.loadAll(TRIPS)).toEqual({ items: [], deletedIds: ["1"] });
    });
  });

  describe("loadAll", () => {
    it.each([
      ["no files yet", {}, { items: [], deletedIds: [] }],
      [
        "two devices",
        {
          a: deviceFile("a", { trips: { 1: { item: { id: "1" }, at: 1 } } }),
          b: deviceFile("b", { trips: { 2: { item: { id: "2" }, at: 1 } } }),
        },
        { items: [{ id: "1" }, { id: "2" }], deletedIds: [] },
      ],
      [
        "another device's file is corrupt or from a newer version",
        {
          a: deviceFile("a", { trips: { 1: { item: { id: "1" }, at: 1 } } }),
          bad: { name: "appmytrip-bad.json", body: "not json" },
          newer: {
            name: "appmytrip-newer.json",
            body: JSON.stringify({ version: 2, device: "n" }),
          },
        },
        { items: [{ id: "1" }], deletedIds: [] },
      ],
    ])("returns %s", async (_name, files, expected) => {
      const { sync } = build({ google: fakeGoogle({ files }), storage: signedIn() });
      expect(await sync.loadAll(TRIPS)).toEqual(expected);
    });

    // A transient read error is not a corrupt file: merging without that
    // device would let this one re-upload stale copies over its edits.
    it.each([
      ["is rate limited", 429],
      ["fails on the server", 503],
      ["drops the connection mid-download", "network"],
    ] as const)("fails the whole read when one device's file %s", async (_name, failure) => {
      const files = {
        a: deviceFile("a", { trips: { 1: { item: { id: "1" }, at: 1 } } }),
        b: deviceFile("b", { trips: { 2: { item: null, at: 2 } } }),
      };
      const { sync } = build({
        google: fakeGoogle({ files, failRead: { b: failure } }),
        storage: signedIn(),
      });
      await expect(sync.loadAll(TRIPS)).rejects.toBeDefined();
    });

    it("reads every page of the file listing", async () => {
      const files = Object.fromEntries(
        [1, 2, 3].map((n) => [
          `f${n}`,
          deviceFile(`d${n}`, { trips: { [n]: { item: { id: String(n) }, at: 1 } } }),
        ]),
      );
      const { sync } = build({ google: fakeGoogle({ files, pageLimit: 2 }), storage: signedIn() });
      expect((await sync.loadAll(TRIPS)).items.map((t) => t.id)).toEqual(["1", "2", "3"]);
    });

    it("signs the user out when Google rejects the token", async () => {
      const { sync } = build({ google: fakeGoogle({ failWith: 401 }), storage: signedIn() });
      const seen: (string | null)[] = [];
      sync.onAuthChange((u) => seen.push(u?.email ?? null));
      await expect(sync.loadAll(TRIPS)).rejects.toMatchObject({ status: 401 });
      expect(seen).toEqual([USER.email, null]);
    });
  });

  describe("signOut", () => {
    it("drops queued writes and forgets the session", async () => {
      const { sync, storage } = build({ storage: signedIn() });
      const queued = sync.upsert(TRIPS, { id: "1" });
      await sync.signOut();
      await expect(queued).rejects.toMatchObject({ code: "signed-out" });
      expect(storage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  describe("deleteAllSyncedData", () => {
    it("deletes every device file, revokes the Google grant and signs out, leaving unrelated files alone", async () => {
      const google = fakeGoogle({
        files: {
          a: deviceFile("this"),
          b: deviceFile("other"),
          c: { name: "unrelated.json", body: "{}" },
        },
      });
      const { sync, storage, gis } = build({ google, storage: signedIn() });
      await sync.deleteAllSyncedData();
      expect(google.state.deleted.sort()).toEqual(["a", "b"]);
      expect(Object.keys(google.state.files)).toEqual(["c"]);
      expect(gis.revoke).toHaveBeenCalledWith("token-1", expect.any(Function));
      expect(storage.getItem(SESSION_KEY)).toBeNull();
    });

    it("deletes nothing when Google's script cannot load to revoke access afterwards", async () => {
      const google = fakeGoogle({ files: { a: deviceFile("this") } });
      const sync = createDriveSync({
        clientId: "client-id",
        fetchImpl: google.fetchImpl,
        loadGis: async () => {
          throw new Error("blocked");
        },
        storage: signedIn(),
        tabStorage: memoryStorage(),
        withLock: (task) => task(),
      });
      await expect(sync.deleteAllSyncedData()).rejects.toThrow("blocked");
      expect(google.state.deleted).toEqual([]);
    });

    it("fails without deleting when not connected to Drive", async () => {
      const { sync, google } = build({ google: fakeGoogle({ files: { a: deviceFile("this") } }) });
      await expect(sync.deleteAllSyncedData()).rejects.toMatchObject({ code: "signed-out" });
      expect(google.state.deleted).toEqual([]);
    });
  });

  describe("Drive rate limits and errors", () => {
    it.each([
      ["a 429", 429],
      ["a 503", 503],
    ])("retries %s with a growing wait, then succeeds", async (_name, status) => {
      const google = fakeGoogle({ files: { a: deviceFile("this") }, flaky: { status, times: 2 } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await expect(sync.loadAll(TRIPS)).resolves.toEqual({ items: [], deletedIds: [] });
      expect(sleeps).toHaveLength(2);
      expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
    });

    it("waits at least as long as Retry-After asks", async () => {
      const google = fakeGoogle({ flaky: { status: 429, times: 1, retryAfter: "7" } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await sync.loadAll(TRIPS);
      expect(sleeps).toEqual([7000]);
    });

    it("does not retry an error that will not change", async () => {
      const google = fakeGoogle({ flaky: { status: 403, times: 99 } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await expect(sync.loadAll(TRIPS)).rejects.toMatchObject({ status: 403 });
      expect(sleeps).toEqual([]);
    });

    it("does not repeat a file creation after a 5xx, which may already have created it", async () => {
      const google = fakeGoogle({ flaky: { status: 500, times: 1, method: "POST" } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      const saved = sync.upsert(TRIPS, { id: "1" });
      saved.catch(() => {});
      await vi.advanceTimersByTimeAsync(200);
      await expect(saved).rejects.toMatchObject({ status: 500 });
      expect(sleeps).toEqual([]);
      expect(Object.keys(google.state.files)).toEqual([]);
    });
  });

  describe("working offline", () => {
    it("reports an unreachable Drive as offline, not as a sign-in problem", async () => {
      const google = fakeGoogle();
      google.state.offline = true;
      const { sync } = build({ google, storage: signedIn() });
      await expect(sync.loadAll(TRIPS)).rejects.toMatchObject({ code: "offline" });
    });

    it("tells a browser with a lapsed token it is offline while it is, and signed out once it is not", async () => {
      let online = false;
      const { sync } = build({ storage: expiredSession(), isOnline: () => online });
      const code = (err: unknown) => (err as { code: string }).code;
      const whileOffline = await sync.loadAll(TRIPS).catch(code);
      online = true;
      const whileOnline = await sync.loadAll(TRIPS).catch(code);
      expect([whileOffline, whileOnline]).toEqual(["offline", "signed-out"]);
    });
  });
});

describe("createDriveSync in the Android app", () => {
  it("signs in through Android, never loading Google's browser script", async () => {
    const nativeAuth = fakeNativeAuth();
    const loadGis = vi.fn();
    const google = fakeGoogle();
    const sync = createDriveSync({
      clientId: "client-id",
      fetchImpl: google.fetchImpl,
      loadGis,
      storage: memoryStorage(),
      tabStorage: memoryStorage(),
      nativeAuth,
    });
    sync.onAuthChange(() => {});
    const user = await sync.signIn();
    expect([
      user.email,
      nativeAuth.requestToken.mock.calls[0][0],
      loadGis.mock.calls.length,
    ]).toEqual([USER.email, { interactive: true }, 0]);
  });

  it("rejects when Android returns no Drive token", async () => {
    const { sync } = build({ nativeAuth: fakeNativeAuth({ interactive: "none" }) });
    await expect(sync.signIn()).rejects.toMatchObject({ code: "access_denied" });
  });

  // Android hands back the same token until it really expires: renew 5 s before, not 60 s.
  it("keeps using a token with 30 s left instead of asking Android for the same one again", async () => {
    const nativeAuth = fakeNativeAuth();
    const storage = memoryStorage({ [SESSION_KEY]: validSession({ expiresAt: NOW + 30_000 }) });
    const { sync } = build({ storage, nativeAuth });
    await landed(sync.upsert(TRIPS, { id: "1" }));
    expect(nativeAuth.requestToken).not.toHaveBeenCalled();
  });

  it.each([
    ["the stored token has expired", expiredSession, [] as string[]],
    ["Google rejects the stored token", signedIn, ["token-1"]],
  ])("renews silently and lands the write when %s", async (_name, storage, revokedTokens) => {
    const google = fakeGoogle({ revokedTokens });
    const { sync } = build({ google, storage: storage(), nativeAuth: fakeNativeAuth() });
    await landed(sync.upsert(TRIPS, { id: "1" }));
    expect(Object.keys(google.stored("new-1").collections.trips)).toEqual(["1"]);
  });

  // A failed renewal must not be retried on every save.
  it("reports signed out when renewal fails, and does not retry it on every save until the backoff ends", async () => {
    const nativeAuth = fakeNativeAuth({ silent: "fail" });
    const { sync } = build({ storage: expiredSession(), nativeAuth });
    const seen: (string | null)[] = [];
    sync.onAuthChange((u) => seen.push(u?.email ?? null));
    for (const id of ["1", "2"]) {
      sync.upsert(TRIPS, { id }).catch(() => {});
      await settle();
    }
    const duringBackoff = nativeAuth.requestToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    sync.upsert(TRIPS, { id: "3" }).catch(() => {});
    await settle();
    expect([seen, duringBackoff, nativeAuth.requestToken.mock.calls.length]).toEqual([
      [USER.email, null],
      1,
      2,
    ]);
  });

  it("treats an expired stored session as restorable, since the app can renew it", () => {
    const { sync } = build({ storage: expiredSession(), nativeAuth: fakeNativeAuth() });
    expect(sync.hasRestorableSession()).toBe(true);
  });

  it("also signs the account out on the device", async () => {
    const nativeAuth = fakeNativeAuth();
    const { sync } = build({ storage: signedIn(), nativeAuth });
    await sync.signOut();
    expect(nativeAuth.signOut).toHaveBeenCalledTimes(1);
  });

  // Google's browser script is not loaded in the app, so revoke over HTTP.
  it("deletes the files, revokes over HTTP without Google's browser script and signs out on the device", async () => {
    const nativeAuth = fakeNativeAuth();
    const loadGis = vi.fn();
    const google = fakeGoogle({ files: { a: deviceFile("this") } });
    const sync = createDriveSync({
      clientId: "client-id",
      fetchImpl: google.fetchImpl,
      loadGis,
      storage: expiredSession(),
      tabStorage: memoryStorage(),
      nativeAuth,
    });
    await sync.deleteAllSyncedData();
    expect([
      google.state.deleted,
      google.state.revoked,
      nativeAuth.signOut.mock.calls.length,
      loadGis.mock.calls.length,
    ]).toEqual([["a"], "app-token-1", 1, 0]);
  });
});
