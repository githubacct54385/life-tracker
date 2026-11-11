import { Link } from "react-router";
import { Page } from "../Page";

export function CarPage() {
  return (
    <Page title="Car">
      <Link to="/car/log" className="block rounded-xl border border-line bg-card p-4 text-ink">
        Log odometer
      </Link>
      <Link to="/car/stats" className="mt-3 block rounded-xl border border-line bg-card p-4 text-ink">
        Mileage stats
      </Link>

      <Link to="/car/import" className="mt-3 block rounded-xl border border-line bg-card p-4 text-ink">
        Import history
      </Link>
    </Page>
  );
}
