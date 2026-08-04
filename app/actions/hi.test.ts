import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requestInsert: vi.fn(),
  profileSingle: vi.fn(),
  directoryRows: vi.fn(),
  notificationInsert: vi.fn(),
  getUserById: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn(async () => ({
    user: { id: "sender-1" },
    supabase: { from: mocks.from },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mocks.notificationInsert })),
    auth: { admin: { getUserById: mocks.getUserById } },
  })),
}));

vi.mock("@/lib/friendRequestEmail", () => ({
  sendFriendRequestEmail: mocks.sendEmail,
}));

import { sendRequest } from "./hi";

describe("sendRequest email notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => {
      if (table === "hi_requests") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: mocks.requestInsert })),
          })),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: mocks.profileSingle })),
          })),
        };
      }
      if (table === "directory_profiles") {
        return {
          select: vi.fn(() => ({ in: mocks.directoryRows })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.requestInsert.mockResolvedValue({
      data: { id: "request-1" },
      error: null,
    });
    mocks.profileSingle.mockResolvedValue({ data: { name: "Sunny" } });
    mocks.directoryRows.mockResolvedValue({ data: [] });
    mocks.notificationInsert.mockResolvedValue({ error: null });
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: "friend@example.test" } },
    });
    mocks.sendEmail.mockResolvedValue("sent");
  });

  it("emails the recipient after creating the in-app request", async () => {
    await expect(sendRequest("recipient-1")).resolves.toEqual({ ok: true });

    expect(mocks.notificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "recipient-1",
        type: "hi_received",
      }),
    );
    expect(mocks.getUserById).toHaveBeenCalledWith("recipient-1");
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      recipientEmail: "friend@example.test",
      senderName: "Sunny",
    });
  });

  it("does not send another email for a duplicate request", async () => {
    mocks.requestInsert.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    await expect(sendRequest("recipient-1")).resolves.toEqual({ ok: true });
    expect(mocks.notificationInsert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
