import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import OnboardingClient from "@/components/onboarding/OnboardingClient";

export default async function WelcomePage() {
  const { supabase } = await requireUser();
  const conference = await getConference(supabase);
  return (
    <Suspense>
      <OnboardingClient conference={conference} />
    </Suspense>
  );
}
