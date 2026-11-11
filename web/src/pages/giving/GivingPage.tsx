import { Link } from "react-router";
import { Page } from "../Page";

export function GivingPage() {
  return (
    <Page title="Giving">
      <Link to="/giving/log" className="block rounded-xl border border-line bg-card p-4 text-ink">
        Log a gift
      </Link>
    </Page>
  );
}
