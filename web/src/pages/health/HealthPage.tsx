import { Link } from "react-router";
import { Page } from "../Page";

export function HealthPage() {
  return (
    <Page title="Health">
      <Link to="/health/workouts" className="block rounded-xl border border-line bg-card p-4 text-ink">
        Workouts
      </Link>
    </Page>
  );
}
