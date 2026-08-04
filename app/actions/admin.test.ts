import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  create: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "admin-1", email: "admin@example.test" } },
      })),
    },
  })),
}));

vi.mock("@/lib/isAdmin", () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: vi.fn(),
}));

vi.mock("@/lib/conference", () => ({
  getConference: vi.fn(),
}));

vi.mock("@/lib/matchRunner", () => ({
  matchOneSlot: vi.fn(),
}));

import { checkOpenAIConnection } from "./admin";

describe("checkOpenAIConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_VISION_MODEL", "");
    mocks.isAdmin.mockResolvedValue(true);
    mocks.create.mockResolvedValue({
      id: "chatcmpl-test",
      choices: [{ message: { content: "OK" } }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies non-admin users without calling OpenAI", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    await expect(checkOpenAIConnection()).resolves.toEqual({
      ok: false,
      model: "",
      error: "forbidden",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports a missing key without making a request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(checkOpenAIConnection()).resolves.toEqual({
      ok: false,
      model: "gpt-4o-mini",
      error: "OPENAI_API_KEY is not configured in this deployment.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("sends a tiny image through the scanner model", async () => {
    await expect(checkOpenAIConnection()).resolves.toEqual({
      ok: true,
      model: "gpt-4o-mini",
      response: "OK",
      requestId: "chatcmpl-test",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        messages: [
          expect.objectContaining({
            content: [
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({
                type: "image_url",
                image_url: expect.objectContaining({
                  url: expect.stringMatching(/^data:image\/png;base64,/),
                  detail: "low",
                }),
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("returns provider errors without exposing the key", async () => {
    mocks.create.mockRejectedValue(new Error("Incorrect API key"));
    await expect(checkOpenAIConnection()).resolves.toEqual({
      ok: false,
      model: "gpt-4o-mini",
      error: "Incorrect API key",
    });
  });
});
