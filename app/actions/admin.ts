"use server";

import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/isAdmin";
import { serviceClient } from "@/lib/supabase/service";
import { getConference } from "@/lib/conference";
import { matchOneSlot, type Result } from "@/lib/matchRunner";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user);
}

export type OpenAIHealthResult =
  | { ok: true; model: string; response: string; requestId: string }
  | { ok: false; model: string; error: string };

// A 1×1 opaque PNG. Sending an actual image checks the same API capability the
// boarding-pass scanner needs, while keeping the diagnostic request tiny.
const HEALTH_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export async function checkOpenAIConnection(): Promise<OpenAIHealthResult> {
  if (!(await requireAdmin())) {
    return { ok: false, model: "", error: "forbidden" };
  }

  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, model, error: "OPENAI_API_KEY is not configured in this deployment." };
  }

  try {
    const client = new OpenAI({ timeout: 15_000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Reply with exactly OK if you can process this image." },
            { type: "image_url", image_url: { url: HEALTH_IMAGE, detail: "low" } },
          ],
        },
      ],
      max_tokens: 8,
    });
    const response = completion.choices[0]?.message?.content?.trim() || "(empty response)";
    return { ok: true, model, response, requestId: completion.id };
  } catch (error) {
    return {
      ok: false,
      model,
      error: error instanceof Error ? error.message : "OpenAI request failed.",
    };
  }
}

export async function runMatching(slotId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };

  const svc = serviceClient();
  const { data: slot, error: slotErr } = await svc
    .from("slots")
    .select("id, starts_at, join_deadline")
    .eq("id", slotId)
    .single();
  if (slotErr || !slot) return { ok: false, error: slotErr?.message ?? "slot not found" };

  const conference = await getConference(svc);
  return matchOneSlot(svc, slot, conference);
}
