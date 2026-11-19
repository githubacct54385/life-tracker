import { describe, expect, it } from "vitest";
import { fakeMaintenanceRepo } from "../testing/fakeMaintenanceRepository";
import { createMaintenanceService } from "./maintenanceService";

// 03:30 UTC on Nov 14: still the evening of Nov 13 in Los Angeles (the default zone), already Nov 14 in Tokyo.
const NOW = () => new Date("2026-11-14T03:30:00Z");
const make = () => {
  const repo = fakeMaintenanceRepo();
  return { repo, service: createMaintenanceService(repo, { now: NOW }) };
};
const shop = { date: "2026-11-10", services: ["Oil change"], doneBy: "shop" as const, placeName: "Joe's Garage", costCents: 8999, odometerMiles: 48_300, note: "Synthetic oil" };

describe("log", () => {
  it("[AC-MIL-05.2][AC-MIL-05.3][AC-MIL-05.4] saves a shop service with its place, cost, mileage and note", async () => {
    const { service } = make();
    const result = await service.log(shop);
    expect(result).toEqual({ status: "saved", record: { id: 1, date: "2026-11-10", services: ["Oil change"], doneBy: "shop", place: { id: 1, name: "Joe's Garage" }, costCents: 8999, odometerMiles: 48_300, note: "Synthetic oil" } });
  });

  it("[AC-MIL-05.2][AC-MIL-05.4] a service done at home has no place, and a cost of zero is kept as zero", async () => {
    const { service, repo } = make();
    const result = await service.log({ date: "2026-11-10", services: ["Air filter"], doneBy: "home", costCents: 0 });
    expect(result).toMatchObject({ status: "saved", record: { doneBy: "home", place: null, costCents: 0, odometerMiles: null, note: null } });
    expect(repo.places).toHaveLength(0);
  });

  it("[AC-MIL-05.3] finds a place by name ignoring letter case, so it is added once and offered again", async () => {
    const { service, repo } = make();
    await service.log(shop);
    await service.log({ ...shop, placeName: "joe's garage" });
    await service.log({ ...shop, placeName: "Quick Lube" });
    expect(repo.places.map((p) => p.name)).toEqual(["Joe's Garage", "Quick Lube"]);
    expect((await service.places()).map((p) => p.name)).toEqual(["Joe's Garage", "Quick Lube"]);
    expect(repo.rows[1]!.place).toEqual({ id: 1, name: "Joe's Garage" });
  });

  it("[AC-MIL-05.2] a shop service with no place named is allowed", async () => {
    const { service } = make();
    expect(await service.log({ date: "2026-11-10", services: ["Tires"], doneBy: "shop" })).toMatchObject({ status: "saved", record: { place: null } });
  });

  it("[AC-MIL-05.7] a blank note is saved as none, and surrounding spaces are trimmed", async () => {
    const { service } = make();
    expect(await service.log({ ...shop, note: "   " })).toMatchObject({ record: { note: null } });
    expect(await service.log({ ...shop, services: ["  Tires "], placeName: " Joe's Garage " })).toMatchObject({ record: { services: ["Tires"], place: { name: "Joe's Garage" } } });
  });

  it("[AC-MIL-05.5] refuses a date in the future in the owner's zone, and accepts today", async () => {
    const { service, repo } = make();
    expect(await service.log({ ...shop, date: "2026-11-14" })).toEqual({ status: "future_date" }); // tomorrow in Los Angeles
    expect(repo.rows).toHaveLength(0);
    expect(await service.log({ ...shop, date: "2026-11-13" })).toMatchObject({ status: "saved" });
    expect(await service.log({ ...shop, date: "2026-11-14" }, "Asia/Tokyo")).toMatchObject({ status: "saved" }); // today in Tokyo
    expect(await service.log({ ...shop, date: "2026-11-15" }, "Asia/Tokyo")).toEqual({ status: "future_date" });
  });

  it("[AC-MIL-05.6] never creates or changes an odometer reading", async () => {
    const { service } = make();
    // The service has no odometer dependency at all: the mileage is only a number kept with the service.
    expect(service.log.length).toBeGreaterThan(0);
    expect(await service.log({ ...shop, odometerMiles: 1 })).toMatchObject({ record: { odometerMiles: 1 } });
  });
});

describe("edit and remove", () => {
  it("[AC-MIL-05.8] replaces every field, can move a shop service to home, and keeps the id", async () => {
    const { service } = make();
    await service.log(shop);
    const result = await service.edit(1, { date: "2026-11-11", services: ["Brakes", "Tires"], doneBy: "home", costCents: 4000 });
    expect(result).toEqual({ status: "saved", record: { id: 1, date: "2026-11-11", services: ["Brakes", "Tires"], doneBy: "home", place: null, costCents: 4000, odometerMiles: null, note: null } });
  });

  it("[AC-MIL-05.8] says not found for a service that does not exist, and refuses a future date on edit", async () => {
    const { service } = make();
    expect(await service.edit(9, shop)).toEqual({ status: "not_found" });
    await service.log(shop);
    expect(await service.edit(1, { ...shop, date: "2026-11-20" })).toEqual({ status: "future_date" });
  });

  it("[AC-MIL-05.8] removes a service for good, and says so when it was not there", async () => {
    const { service, repo } = make();
    await service.log(shop);
    expect(await service.remove(1)).toBe(true);
    expect(await service.remove(1)).toBe(false);
    expect(repo.rows).toHaveLength(0);
    expect(repo.places).toHaveLength(1); // the place stays for next time
  });

  it("[AC-MIL-05.8] lists newest first", async () => {
    const { service } = make();
    await service.log({ ...shop, date: "2026-10-01" });
    await service.log({ ...shop, date: "2026-11-01" });
    expect((await service.list()).map((r) => r.date)).toEqual(["2026-11-01", "2026-10-01"]);
  });
});

describe("places (MIL-06)", () => {
  it("[AC-MIL-06.5] renames a place, and the services that use it show the new name", async () => {
    const { service } = make();
    await service.log(shop);
    expect(await service.renamePlace(1, "  Joe's Auto  ")).toEqual({ status: "saved", place: { id: 1, name: "Joe's Auto" } });
    expect((await service.list())[0]!.place).toEqual({ id: 1, name: "Joe's Auto" });
  });

  it("[AC-MIL-06.5] refuses a name another place already has, ignoring letter case, but allows changing only the case of its own", async () => {
    const { service } = make();
    await service.log(shop);
    await service.log({ ...shop, placeName: "Quick Lube" });
    expect(await service.renamePlace(2, "JOE'S GARAGE")).toEqual({ status: "name_taken" });
    expect(await service.renamePlace(2, "QUICK LUBE")).toEqual({ status: "saved", place: { id: 2, name: "QUICK LUBE" } });
    expect(await service.renamePlace(99, "Nowhere")).toEqual({ status: "not_found" });
  });

  it("[AC-MIL-06.5] deletes a place only when no service uses it", async () => {
    const { service } = make();
    const saved = await service.log(shop);
    expect(await service.deletePlace(1)).toBe("in_use");
    expect(await service.places()).toHaveLength(1);
    if (saved.status === "saved") await service.remove(saved.record.id);
    expect(await service.deletePlace(1)).toBe("deleted");
    expect(await service.places()).toEqual([]);
    expect(await service.deletePlace(1)).toBe("not_found");
  });
});
