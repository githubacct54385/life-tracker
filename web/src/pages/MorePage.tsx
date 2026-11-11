import { Link } from "react-router";
import { Page } from "./Page";

export function MorePage() {
  return (
    <Page title="More">
      <Link to="/settings" className="block rounded-xl border border-line bg-card p-4 text-ink">
        Settings
      </Link>
    </Page>
  );
}
