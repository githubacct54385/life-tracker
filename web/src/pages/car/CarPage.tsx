import { HubLink } from "../../ui/HubLink";
import { Page } from "../Page";

export function CarPage() {
  return (
    <Page title="Car">
      <div className="grid gap-3 sm:grid-cols-2">
        <HubLink to="/car/log" icon="gauge" title="Log odometer" description="Add this week's reading" />
        <HubLink to="/car/maintenance" icon="wrench" title="Maintenance" description="Services, shops and costs" />
        <HubLink to="/car/stats" icon="chart" title="Mileage stats" description="Weekly miles and trends" />
        <HubLink to="/car/import" icon="upload" title="Import history" description="Bring in your spreadsheet" />
      </div>
    </Page>
  );
}
