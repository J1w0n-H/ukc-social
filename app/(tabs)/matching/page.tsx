import { MealsListSection } from "../meals/page";
import { RidesListSection } from "../rides/page";
import MatchingTabs from "@/components/MatchingTabs";

export default async function MatchingPage() {
  const [meals, rides] = await Promise.all([MealsListSection(), RidesListSection()]);
  return <MatchingTabs meals={meals} rides={rides} />;
}
