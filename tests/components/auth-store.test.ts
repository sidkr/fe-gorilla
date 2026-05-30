// @vitest-environment happy-dom
// Unit tests for the Pinia auth store (stores/auth.js) with Parse and the
// session-guard fully mocked. Covers STORE-01..11 from
// docs/testing/auth-marketing.md: hydrateFromParse, hydrateOrg, login, signup
// (→ become), logout, sessionExpired, and the getters.
//
// `stores/auth.js` imports `parse` and `~/utils/sessionGuard.client`. We mock
// both module specifiers so the store sees our spies. Pinia is activated per
// test via setActivePinia(createPinia()).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// ── mocks ───────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted above the file, so the spies they reference must
// be created via vi.hoisted (also hoisted) to be available at mock time.
// The store reaches Parse.User.current/logIn/become, Parse.Cloud.run, and the
// session-guard helpers; all are spies we shape per test.
const { ParseMock, markSessionInvalid, purgeSession } = vi.hoisted(() => ({
  ParseMock: {
    User: {
      current: vi.fn(),
      logIn: vi.fn(),
      become: vi.fn(),
    },
    Cloud: {
      run: vi.fn(),
    },
  },
  markSessionInvalid: vi.fn(),
  purgeSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("parse", () => ({ default: ParseMock }));
vi.mock("~/utils/sessionGuard.client", () => ({
  markSessionInvalid,
  purgeSession,
}));

import { useAuthStore } from "../../stores/auth";

// A tiny fake Parse.User: just enough that getters reading .get(field) work.
function fakeUser(fields: Record<string, unknown> = {}) {
  return { get: (k: string) => fields[k] };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  purgeSession.mockResolvedValue(undefined);
});

describe("hydrateFromParse", () => {
  it("STORE-01: with an existing session sets user and fires hydrateOrg", () => {
    const u = fakeUser({ username: "a@b.com" });
    ParseMock.User.current.mockReturnValue(u);
    ParseMock.Cloud.run.mockResolvedValue({ id: "org1", name: "Acme" });

    const auth = useAuthStore();
    auth.hydrateFromParse();

    // Pinia wraps state objects in a reactive proxy, so assert by behavior
    // (the user is set + readable) rather than referential identity.
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.username).toBe("a@b.com");
    // hydrateOrg is fire-and-forget — getMyOrg should have been invoked.
    expect(ParseMock.Cloud.run).toHaveBeenCalledWith("getMyOrg");
  });

  it("STORE-02: with no session leaves user null and never calls getMyOrg", () => {
    ParseMock.User.current.mockReturnValue(null);

    const auth = useAuthStore();
    auth.hydrateFromParse();

    expect(auth.user).toBeNull();
    expect(ParseMock.Cloud.run).not.toHaveBeenCalled();
  });
});

describe("hydrateOrg", () => {
  it("STORE-03: populates organization and the orgId/orgName getters", async () => {
    const auth = useAuthStore();
    auth.user = fakeUser();
    ParseMock.Cloud.run.mockResolvedValue({ id: "org9", name: "Globex", plan: "free" });

    const org = await auth.hydrateOrg();

    expect(org).toEqual({ id: "org9", name: "Globex", plan: "free" });
    expect(auth.organization).toEqual({ id: "org9", name: "Globex", plan: "free" });
    expect(auth.orgId).toBe("org9");
    expect(auth.orgName).toBe("Globex");
  });

  it("STORE-04: swallows a getMyOrg rejection — organization becomes null, no throw", async () => {
    const auth = useAuthStore();
    auth.user = fakeUser();
    auth.organization = { id: "stale", name: "Stale" };
    ParseMock.Cloud.run.mockRejectedValue({ code: 209 });

    await expect(auth.hydrateOrg()).resolves.toBeNull();
    expect(auth.organization).toBeNull();
  });

  it("STORE-05: no-op when not logged in — returns null, getMyOrg not called", async () => {
    const auth = useAuthStore();
    auth.user = null;

    const res = await auth.hydrateOrg();

    expect(res).toBeNull();
    expect(auth.organization).toBeNull();
    expect(ParseMock.Cloud.run).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("STORE-06: sets user + hydrates org and returns the user", async () => {
    const u = fakeUser({ username: "log@in.com" });
    ParseMock.User.logIn.mockResolvedValue(u);
    ParseMock.Cloud.run.mockResolvedValue({ id: "o1", name: "LogOrg" });

    const auth = useAuthStore();
    const res = await auth.login("log@in.com", "pw");

    expect(ParseMock.User.logIn).toHaveBeenCalledWith("log@in.com", "pw");
    // login returns the raw user; the store keeps a reactive copy.
    expect(res).toBe(u);
    expect(auth.username).toBe("log@in.com");
    expect(auth.organization).toEqual({ id: "o1", name: "LogOrg" });
  });

  it("STORE-07: propagates an auth error and leaves user null", async () => {
    ParseMock.User.logIn.mockRejectedValue({ code: 101 });

    const auth = useAuthStore();
    await expect(auth.login("x@y.com", "bad")).rejects.toMatchObject({ code: 101 });
    expect(auth.user).toBeNull();
    expect(ParseMock.Cloud.run).not.toHaveBeenCalled();
  });
});

describe("signup", () => {
  it("STORE-08: runs signUpWithOrg, becomes the session, sets user + org", async () => {
    const becameUser = fakeUser({ username: "new@user.com", name: "New" });
    ParseMock.Cloud.run.mockImplementation((fn: string) => {
      if (fn === "signUpWithOrg") return Promise.resolve({ sessionToken: "sess-123" });
      if (fn === "getMyOrg") return Promise.resolve({ id: "org-new", name: "NewCo" });
      return Promise.resolve(null);
    });
    ParseMock.User.become.mockResolvedValue(becameUser);
    ParseMock.User.current.mockReturnValue(becameUser);

    const auth = useAuthStore();
    const params = {
      username: "new@user.com",
      password: "pw12345678",
      email: "new@user.com",
      name: "New",
      company: "NewCo",
    };
    const res = await auth.signup(params);

    expect(ParseMock.Cloud.run).toHaveBeenCalledWith("signUpWithOrg", params);
    expect(ParseMock.User.become).toHaveBeenCalledWith("sess-123");
    // signup sets user from Parse.User.current() then returns it; the store
    // value is a reactive proxy, so assert by readable fields.
    expect(auth.username).toBe("new@user.com");
    expect(auth.name).toBe("New");
    expect(auth.organization).toEqual({ id: "org-new", name: "NewCo" });
    expect(res).toBeTruthy();
    expect(res.get("username")).toBe("new@user.com");
  });
});

describe("logout", () => {
  it("STORE-09: purges the session and clears user + organization", async () => {
    const auth = useAuthStore();
    auth.user = fakeUser();
    auth.organization = { id: "o", name: "O" };

    await auth.logout();

    expect(purgeSession).toHaveBeenCalledTimes(1);
    expect(auth.user).toBeNull();
    expect(auth.organization).toBeNull();
  });
});

describe("sessionExpired", () => {
  it("STORE-10: marks invalid, purges, and clears state", async () => {
    const auth = useAuthStore();
    auth.user = fakeUser();
    auth.organization = { id: "o", name: "O" };

    await auth.sessionExpired();

    expect(markSessionInvalid).toHaveBeenCalledTimes(1);
    expect(purgeSession).toHaveBeenCalledTimes(1);
    expect(auth.user).toBeNull();
    expect(auth.organization).toBeNull();
  });
});

describe("getters", () => {
  it("STORE-11: reflect Parse user fields and org pointer", () => {
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.username).toBeNull();
    expect(auth.name).toBeNull();
    expect(auth.orgId).toBeNull();
    expect(auth.orgName).toBeNull();

    auth.user = fakeUser({ username: "u@e.com", name: "Ursula" });
    auth.organization = { id: "org42", name: "Org Forty-Two" };

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.username).toBe("u@e.com");
    expect(auth.name).toBe("Ursula");
    expect(auth.orgId).toBe("org42");
    expect(auth.orgName).toBe("Org Forty-Two");
  });
});
