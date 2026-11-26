import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { MaintenanceRecord, OdometerReadingRecord, ServiceInterval } from "@life-tracker/shared";
import { ServiceDueTile, type ServiceDueData } from "./ServiceDueTile";
import type { Load } from "./load";

afterEach(cleanup);

const TODAY = "2026-11-26";
const record = (id: number, service: string, odometerMiles: number): MaintenanceRecord => ({ id, date: "2026-11-01", services: [service], doneBy: "home", place: null, costCents: null, odometerMiles, note: null });
const interval = (id: number, service: string, miles: number): ServiceInterval => ({ id, service, miles, months: null });
const readings: Load<OdometerReadingRecord[]> = { state: "ok", value: [{ id: 2, date: "2026-11-20", miles: 41_000 }, { id: 1, date: "2026-11-13", miles: 40_800 }] };

function show(data: Load<ServiceDueData>, loadedReadings: Load<OdometerReadingRecord[]> = readings) {
  return render(
    <MemoryRouter>
      <ServiceDueTile today={TODAY} data={data} readings={loadedReadings} />
    </MemoryRouter>,
  );
}
const ok = (records: MaintenanceRecord[], intervals: ServiceInterval[]): Load<ServiceDueData> => ({ state: "ok", value: { records, intervals } });

describe("Home: Service due", () => {
  it("[AC-MIL-09.5] shows up to three of the most urgent services, in words, as a link to the Maintenance page", () => {
    const names = ["A", "B", "C", "D", "E"];
    show(ok(names.map((n, i) => record(i + 1, n, 40_000)), names.map((n, i) => interval(i + 1, n, [900, 800, 700, 600, 20_000][i]!))));
    const region = within(screen.getByRole("region", { name: "Service due" }));
    expect(region.getAllByRole("listitem").map((li) => li.textContent?.slice(0, 1))).toEqual(["D", "C", "B"]);
    expect(region.getAllByText("Overdue")).toHaveLength(3);
    expect(region.getByRole("link", { name: /Service due/ }).getAttribute("href")).toBe("/car/maintenance");
  });

  it("[AC-MIL-09.5] shows nothing, not an empty box, when nothing is due soon, when no interval is set, while loading and after a failure", () => {
    show(ok([record(1, "A", 40_000)], [interval(1, "A", 20_000)]));
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    show(ok([record(1, "A", 40_000)], []));
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    show({ state: "loading" });
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    show({ state: "error" });
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    show(ok([record(1, "A", 10)], [interval(1, "A", 20)]), { state: "error" });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("[AC-MIL-09.5] shows a service that is due soon, not only overdue ones", () => {
    show(ok([record(1, "Oil change", 40_000)], [interval(1, "Oil change", 1300)])); // due at 41,300; 300 miles to go
    expect(within(screen.getByRole("region", { name: "Service due" })).getByText("Due soon")).toBeTruthy();
  });
});
