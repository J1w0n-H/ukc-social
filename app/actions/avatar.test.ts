import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: vi.fn(() => ({
    storage: { from: mocks.from },
  })),
}));

import { uploadAvatar } from "./avatar";

function avatarForm(file?: File) {
  const data = new FormData();
  if (file) data.append("avatar", file);
  return data;
}

describe("uploadAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
    mocks.from.mockReturnValue({
      upload: mocks.upload,
      getPublicUrl: mocks.getPublicUrl,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.test/avatar.jpg" },
    });
  });

  it("rejects missing, non-JPEG, and oversized payloads before storage", async () => {
    expect(await uploadAvatar(avatarForm())).toEqual({
      ok: false,
      error: "No photo was received. Please try again.",
    });
    expect(
      await uploadAvatar(avatarForm(new File(["png"], "avatar.png", { type: "image/png" }))),
    ).toEqual({ ok: false, error: "The cropped photo was not a JPEG." });
    expect(
      await uploadAvatar(
        avatarForm(
          new File([new Uint8Array(2 * 1024 * 1024 + 1)], "avatar.jpg", {
            type: "image/jpeg",
          }),
        ),
      ),
    ).toEqual({ ok: false, error: "The cropped photo is too large." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires a current authenticated session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const result = await uploadAvatar(
      avatarForm(new File(["jpeg"], "avatar.jpg", { type: "image/jpeg" })),
    );

    expect(result).toEqual({
      ok: false,
      error: "Your session expired. Please sign in again.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("replaces only the authenticated user's fixed avatar path", async () => {
    vi.spyOn(Date, "now").mockReturnValue(12345);
    const file = new File(["jpeg"], "avatar.jpg", { type: "image/jpeg" });

    const result = await uploadAvatar(avatarForm(file));

    expect(mocks.from).toHaveBeenCalledWith("avatars");
    expect(mocks.upload).toHaveBeenCalledWith(
      "user-123/avatar.jpg",
      file,
      {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "3600",
      },
    );
    expect(result).toEqual({
      ok: true,
      url: "https://example.test/avatar.jpg?t=12345",
    });
    vi.restoreAllMocks();
  });

  it("returns the storage error so mobile failures are diagnosable", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Bucket not found" } });

    const result = await uploadAvatar(
      avatarForm(new File(["jpeg"], "avatar.jpg", { type: "image/jpeg" })),
    );

    expect(result).toEqual({
      ok: false,
      error: "Upload failed: Bucket not found",
    });
  });
});
