import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The admins lookup runs under the service role. Stub it so these tests
// describe the decision, not Supabase.
const maybeSingle = vi.fn();
const client = vi.fn(() => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
}));
vi.mock("./supabase/service", () => ({ serviceClient: () => client() }));

const { isAdmin, adminEmails } = await import("./isAdmin");

const NOBODY = { data: null };
const GRANTED = { data: { user_id: "u1" } };
const user = (email?: string | null) => ({ id: "u1", email });

describe("isAdmin", () => {
  const original = process.env.ADMIN_EMAIL;
  beforeEach(() => maybeSingle.mockResolvedValue(NOBODY));
  afterEach(() => {
    process.env.ADMIN_EMAIL = original;
    vi.clearAllMocks();
  });

  it("is false for a signed-out user", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    expect(await isAdmin(null)).toBe(false);
  });

  it("matches ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    expect(await isAdmin(user("admin@example.com"))).toBe(true);
  });

  it("ignores case and surrounding whitespace", async () => {
    process.env.ADMIN_EMAIL = "  Admin@Example.com  ";
    expect(await isAdmin(user("admin@example.com"))).toBe(true);
  });

  it("accepts a comma-separated list", async () => {
    process.env.ADMIN_EMAIL = "one@example.com, two@example.com";
    expect(await isAdmin(user("two@example.com"))).toBe(true);
    expect(adminEmails()).toEqual(["one@example.com", "two@example.com"]);
  });

  it("rejects a non-admin address", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    expect(await isAdmin(user("someone@example.com"))).toBe(false);
  });

  // The production failure this whole file exists for: the host had no matching
  // ADMIN_EMAIL, so /admin 404'd for everyone and nobody could seat anyone.
  it("still grants admin from the table when ADMIN_EMAIL is unset", async () => {
    delete process.env.ADMIN_EMAIL;
    maybeSingle.mockResolvedValue(GRANTED);
    expect(await isAdmin(user("someone@example.com"))).toBe(true);
  });

  it("denies when ADMIN_EMAIL is unset and there is no grant", async () => {
    delete process.env.ADMIN_EMAIL;
    expect(await isAdmin(user("someone@example.com"))).toBe(false);
  });

  // A deployment missing SUPABASE_SERVICE_ROLE_KEY makes serviceClient() throw.
  // That must deny admin, not 500 the page.
  it("denies rather than throwing when the lookup fails", async () => {
    delete process.env.ADMIN_EMAIL;
    client.mockImplementationOnce(() => {
      throw new Error("no service key");
    });
    await expect(isAdmin(user("someone@example.com"))).resolves.toBe(false);
  });

  it("does not treat an empty ADMIN_EMAIL as matching an empty email", async () => {
    process.env.ADMIN_EMAIL = "";
    expect(await isAdmin(user(""))).toBe(false);
    expect(await isAdmin(user(null))).toBe(false);
  });
});
