import { describe, expect, it } from "vitest";
import { fakeWeightRepo } from "../testing/fakeWeightRepository";
import { createWeightService } from "./weightService";

// Invented values, in pounds. The clock is injected: 2026-11-18 noon UTC is still 2026-11-18 in the owner's time zone.
const noon = (iso: string) => () => new Date(`${iso}T20:00:00Z`);

describe("weightService", () => {
  it("[AC-HLT-01.1] dates an entry when it is saved, with no date from the caller", async () => {
    const service = createWeightService(fakeWeightRepo(), { now: noon("2026-11-18") });
    expect(await service.log(172.4)).toEqual({ status: "saved", entry: { id: 1, date: "2026-11-18", pounds: 172.4 } });
    expect(await service.list()).toEqual([{ id: 1, date: "2026-11-18", pounds: 172.4 }]);
  });

  it("[AC-HLT-01.3] a second entry for the same day is not saved until the owner confirms the replacement", async () => {
    const repo = fakeWeightRepo();
    const service = createWeightService(repo, { now: noon("2026-11-18") });
    await service.log(172.4);
    expect(await service.log(171.0)).toEqual({ status: "needs_replace", existing: { id: 1, date: "2026-11-18", pounds: 172.4 } });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]!.pounds).toBe(172.4);
    expect(await service.log(171.0, true)).toEqual({ status: "saved", entry: { id: 1, date: "2026-11-18", pounds: 171.0 } });
    expect(repo.rows).toHaveLength(1);
  });

  it("[AC-HLT-01.3] a new day starts a new entry", async () => {
    const repo = fakeWeightRepo([{ date: "2026-11-17", pounds: 173 }]);
    const service = createWeightService(repo, { now: noon("2026-11-18") });
    expect((await service.log(172)).status).toBe("saved");
    expect(repo.rows).toHaveLength(2);
  });

  it("[AC-HLT-01.1] edit changes the value and keeps the date, and says so when it does not exist", async () => {
    const service = createWeightService(fakeWeightRepo([{ date: "2026-11-10", pounds: 175 }]), { now: noon("2026-11-18") });
    expect(await service.edit(1, 174.2)).toEqual({ id: 1, date: "2026-11-10", pounds: 174.2 });
    expect(await service.edit(99, 170)).toBeUndefined();
  });

  it("[AC-HLT-01.1] delete removes the entry for good, and says so when it does not exist", async () => {
    const service = createWeightService(fakeWeightRepo([{ date: "2026-11-10", pounds: 175 }]));
    expect(await service.remove(1)).toBe(true);
    expect(await service.remove(1)).toBe(false);
    expect(await service.list()).toEqual([]);
  });

  it("[AC-HLT-01.1] lists newest first", async () => {
    const service = createWeightService(fakeWeightRepo([{ date: "2026-11-01", pounds: 176 }, { date: "2026-11-09", pounds: 174 }, { date: "2026-11-05", pounds: 175 }]));
    expect((await service.list()).map((e) => e.date)).toEqual(["2026-11-09", "2026-11-05", "2026-11-01"]);
  });
});
