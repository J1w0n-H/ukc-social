import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { getConference } from "@/lib/conference";
import { shouldAutoMatch } from "@/lib/autoMatch";
import { runAllSlots } from "@/lib/matchRunner";

// Hit by Vercel Cron (see vercel.json) on a daily tick, which is what the free
// plan allows: it rejects a deployment whose cron runs more often than once a
// day. The admin-configured `matching_interval_minutes` (and the "starts 7 days
// before the conference" window) are enforced by shouldAutoMatch() below, so
// that setting is a minimum gap between runs rather than a schedule. The tick is
// the ceiling on resolution, so any interval under 24 hours behaves the same.
//
// This is a backstop, not the main path. Seating during the conference is meant
// to come from the per-slot Run matching button, which is safe to press
// repeatedly now that matchOneSlot only seats people who are not seated yet.
// If this deployment moves to a paid plan, an hourly schedule here makes the
// interval setting mean what it says.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const svc = serviceClient();
  const conference = await getConference(svc);
  const now = new Date();

  if (!shouldAutoMatch(conference, now)) {
    return NextResponse.json({ ok: true, ran: false });
  }

  const { ok, results } = await runAllSlots(conference);

  const { error } = await svc
    .from("conferences")
    .update({ last_auto_match_at: now.toISOString() })
    .eq("id", conference!.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok, ran: true, ranAt: now.toISOString(), results });
}
