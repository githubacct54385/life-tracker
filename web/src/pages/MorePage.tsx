import { HubLink } from "../ui/HubLink";
import { Page } from "./Page";

export function MorePage() {
  return (
    <Page title="More">
      <HubLink to="/groceries" icon="cart" title="Groceries" description="Your shopping list: add items and tick them off" />
      <HubLink to="/settings" icon="settings" title="Settings" description="Appearance, units and sign out" />
    </Page>
  );
}
