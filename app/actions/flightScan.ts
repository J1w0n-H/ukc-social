"use server";

import OpenAI from "openai";
import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";

// Reads a boarding pass or ticket screenshot and PREFILLS the flight form. It
// never saves: a misread arrival time would put someone in the wrong car at an
// airport, so a person confirms every value before it is submitted.
//
// This existed once against Anthropic vision and was removed in 7febda8 because
// the fields it filled (flight number, airline, city) were display-only and
// matching never used them. The one field that does drive matching is the time,
// and typing a date and time into a phone is the step that gates the whole rides
// feature, so it earns its place now by filling that.

const DEFAULT_SCAN_MODEL = "gpt-4o-mini";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type Draft = { direction: "arrival" | "departure" | null; localDateTime: string | null };

export type ScanResult =
  | { ok: true; draft: Draft }
  | { ok: false; reason: "no_key" | "invalid_image" | "unreadable" | "error"; message?: string };

// strict mode requires every key in `required` and additionalProperties false,
// so "not legible" is expressed as an explicit null rather than an absent key.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["direction", "localDateTime"],
  properties: {
    direction: {
      type: ["string", "null"],
      enum: ["arrival", "departure", null],
      description: "arrival if this leg lands at the event airport, departure if it leaves from it",
    },
    localDateTime: {
      type: ["string", "null"],
      description: "the event-airport-side time as YYYY-MM-DDTHH:mm, 24 hour, local to that airport",
    },
  },
} as const;

export async function parseFlightScreenshot(
  formData: FormData,
  fallbackYear: number,
): Promise<ScanResult> {
  const { supabase } = await requireUser();
  if (!process.env.OPENAI_API_KEY) return { ok: false, reason: "no_key" };

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, reason: "invalid_image", message: "No image was received." };
  }
  if (image.type !== "image/jpeg") {
    return { ok: false, reason: "invalid_image", message: "The scan must be a JPEG image." };
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "invalid_image", message: "The scan is too large." };
  }

  const conference = await getConference(supabase);
  const airport = conference?.airport_code || "";
  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const model = process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_SCAN_MODEL;

  const prompt = [
    "You are reading a flight ticket or boarding pass screenshot.",
    airport
      ? `The event airport is ${airport}. One leg of this trip touches ${airport}.`
      : "One leg of this trip touches the event airport.",
    "Return the direction and the time on the event-airport side of that leg.",
    "arrival means the flight LANDS at the event airport. departure means it LEAVES from it.",
    "localDateTime is that airport's own local wall clock, not the traveller's home time zone.",
    `If the year is not printed anywhere, assume ${fallbackYear}.`,
    "Set a field to null if it is not legible. Set both to null if no leg touches the event airport.",
  ].join(" ");

  try {
    const client = new OpenAI({ timeout: 20_000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "flight_draft", strict: true, schema: SCHEMA },
      },
    });

    const body = res.choices[0]?.message?.content;
    if (!body) return { ok: false, reason: "unreadable" };
    const draft = JSON.parse(body) as Draft;

    // A time we cannot put in the input is the same as no time at all, and the
    // datetime-local input silently ignores anything off-format.
    if (draft.localDateTime && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.localDateTime)) {
      draft.localDateTime = null;
    }
    if (!draft.localDateTime) return { ok: false, reason: "unreadable" };

    return { ok: true, draft };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Could not read that." };
  }
}
