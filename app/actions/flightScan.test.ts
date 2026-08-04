import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getConference: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn(async () => ({
    user: { id: "user-1" },
    supabase: {},
  })),
}));

vi.mock("@/lib/conference", () => ({
  getConference: mocks.getConference,
}));

import { parseFlightScreenshot } from "./flightScan";

function imageForm(type = "image/jpeg") {
  const data = new FormData();
  data.append("image", new File(["jpeg bytes"], "pass.jpg", { type }));
  return data;
}

describe("parseFlightScreenshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_VISION_MODEL", "");
    mocks.getConference.mockResolvedValue({ airport_code: "MCO" });
    mocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              direction: "arrival",
              localDateTime: "2026-08-05T11:42",
            }),
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports missing configuration without calling OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(parseFlightScreenshot(imageForm(), 2026)).resolves.toEqual({
      ok: false,
      reason: "no_key",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid image payloads before calling OpenAI", async () => {
    await expect(parseFlightScreenshot(new FormData(), 2026)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_image",
    });
    await expect(parseFlightScreenshot(imageForm("image/png"), 2026)).resolves.toEqual({
      ok: false,
      reason: "invalid_image",
      message: "The scan must be a JPEG image.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("sends a high-detail image and returns the structured flight time", async () => {
    const result = await parseFlightScreenshot(imageForm(), 2026);

    expect(result).toEqual({
      ok: true,
      draft: {
        direction: "arrival",
        localDateTime: "2026-08-05T11:42",
      },
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        messages: [
          expect.objectContaining({
            content: [
              expect.objectContaining({ type: "text", text: expect.stringContaining("MCO") }),
              expect.objectContaining({
                type: "image_url",
                image_url: expect.objectContaining({
                  url: expect.stringMatching(/^data:image\/jpeg;base64,/),
                  detail: "high",
                }),
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("uses an explicitly configured vision model", async () => {
    vi.stubEnv("OPENAI_VISION_MODEL", "vision-model");
    await parseFlightScreenshot(imageForm(), 2026);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "vision-model" }),
    );
  });

  it("rejects malformed model output and reports API failures", async () => {
    mocks.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              direction: "arrival",
              localDateTime: "August 5 at 11:42",
            }),
          },
        },
      ],
    });
    await expect(parseFlightScreenshot(imageForm(), 2026)).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });

    mocks.create.mockRejectedValueOnce(new Error("Incorrect API key"));
    await expect(parseFlightScreenshot(imageForm(), 2026)).resolves.toEqual({
      ok: false,
      reason: "error",
      message: "Incorrect API key",
    });
  });
});
