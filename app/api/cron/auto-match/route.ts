import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { getConference } from "@/lib/conference";
import { shouldAutoMatch } from "@/lib/autoMatch";
import { runAllSlots } from "@/lib/matchRunner";

// Hit by Vercel Cron (see vercel.json) on a fixed hourly tick. The
// admin-configured `matching_interval_minutes` (and the "starts 7 days before
// the conference" window) are enforced by shouldAutoMatch() below, not by the
// cron schedule itself. The tick has to fire at least as often as the shortest
// configurable interval, which is why upsertConference floors that setting at
// 60 minutes.
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
