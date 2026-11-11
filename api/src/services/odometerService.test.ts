import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fakeRepo } from "../testing/fakeOdometerRepository";
import { calendarDateIn, createOdometerService } from "./odometerService";

const at = (iso: string) => () => new Date(iso);
// 2026-11-13 is a Friday. Noon UTC is 04:00 in Los Angeles on the same day.
const FRIDAY_NOON = "2026-11-13T12:00:00Z";

describe("calendarDateIn", () => {
  it("[AC-MIL-01.1] uses the owner's calendar day, not UTC's", () => {
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-11-14T03:30:00Z"))).toBe("2026-11-13");
    expect(calendarDateIn("America/Los_Angeles", new Date("2026-11-14T09:00:00Z"))).toBe("2026-11-14");
  });
});

describe("log", () => {
  it("[AC-MIL-01.1][AC-MIL-01.4] dates a new reading when it is saved (the caller never supplies a date)", async () => {
    const repo = fakeRepo();
    const service = createOdometerService(repo, { now: at(FRIDAY_NOON) });
    const result = await service.log(48_402, false);
    expect(result).toMatchObject({ status: "saved", reading: { date: "2026-11-13", miles: 48_402 } });
    expect(repo.rows).toHaveLength(1);
  });

  it("[AC-MIL-01.4] a missed week is fine: a late reading is just dated now and saved without a warning", async () => {
    const repo = fakeRepo([{ date: "2026-10-23", miles: 48_000 }]);
    const result = await createOdometerService(repo, { now: at(FRIDAY_NOON) }).log(48_400, false);
    expect(result.status).toBe("saved");
  });

  it("[AC-MIL-01.2] a reading lower than the previous one needs confirmation and is not saved until confirmed", async () => {
    const repo = fakeRepo([{ date: "2026-11-06", miles: 48_550 }]);
    const service = createOdometerService(repo, { now: at(FRIDAY_NOON) });
    const first = await service.log(48_402, false);
    expect(first).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "lower_than_previous" }] });
    expect(repo.rows).toHaveLength(1);
    expect((await service.log(48_402, true)).status).toBe("saved");
    expect(repo.rows).toHaveLength(2);
  });

  it("[AC-MIL-01.3] a jump over 300 miles a day needs confirmation; exactly the limit does not", async () => {
    const repo = fakeRepo([{ date: "2026-11-12", miles: 10_000 }]);
    const service = createOdometerService(repo, { now: at(FRIDAY_NOON) });
    expect(await service.log(10_301, false)).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "implausible_jump", miles: 301, days: 1 }] });
    expect((await service.log(10_300, false)).status).toBe("saved");
  });

  it("[AC-MIL-01.2][AC-MIL-01.3] the first reading ever has nothing to compare with", async () => {
    expect((await createOdometerService(fakeRepo(), { now: at(FRIDAY_NOON) }).log(9_999_999, false)).status).toBe("saved");
  });
});

describe("edit", () => {
  it("[AC-MIL-01.4] changes the value and keeps the original date", async () => {
    const repo = fakeRepo([{ date: "2026-10-30", miles: 48_000 }]);
    const service = createOdometerService(repo, { now: at(FRIDAY_NOON) }); // today is later than the reading
    const result = await service.edit(1, 48_100, false);
    expect(result).toMatchObject({ status: "saved", reading: { id: 1, date: "2026-10-30", miles: 48_100 } });
  });

  it("[AC-MIL-01.2][AC-MIL-01.4] an edit is checked against its neighbours, not against itself", async () => {
    const repo = fakeRepo([
      { date: "2026-10-23", miles: 48_000 },
      { date: "2026-10-30", miles: 48_100 },
      { date: "2026-11-06", miles: 48_200 },
    ]);
    const service = createOdometerService(repo, { now: at(FRIDAY_NOON) });
    expect(await service.edit(2, 47_900, false)).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "lower_than_previous" }] });
    expect(await service.edit(2, 48_300, false)).toMatchObject({ status: "needs_confirmation", warnings: [{ kind: "higher_than_next" }] });
    expect((await service.edit(2, 48_150, false)).status).toBe("saved");
    expect((await service.edit(2, 47_900, true)).status).toBe("saved");
  });

  it("[AC-MIL-01.4] editing a reading that does not exist reports not_found", async () => {
    expect(await createOdometerService(fakeRepo()).edit(7, 1, false)).toEqual({ status: "not_found" });
  });
});

describe("remove", () => {
  it("[AC-MIL-01.4] deleting removes the reading for good, and a second delete finds nothing", async () => {
    const repo = fakeRepo([{ date: "2026-10-30", miles: 48_000 }]);
    const service = createOdometerService(repo);
    expect(await service.remove(1)).toBe(true);
    expect(await service.list()).toEqual([]);
    expect(await service.remove(1)).toBe(false);
  });
});

describe("list", () => {
  it("[AC-MIL-01.4] lists the newest first and honours the limit", async () => {
    const repo = fakeRepo([
      { date: "2026-10-23", miles: 1 },
      { date: "2026-11-06", miles: 3 },
      { date: "2026-10-30", miles: 2 },
    ]);
    expect((await createOdometerService(repo).list(2)).map((r) => r.miles)).toEqual([3, 2]);
  });
});

describe("properties", () => {
  it("[AC-MIL-01.2][AC-MIL-01.3] a confirmed save is always accepted, an unconfirmed one only when the checks are quiet", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }), async (previous, miles) => {
        const repo = fakeRepo([{ date: "2026-11-12", miles: previous }]);
        const service = createOdometerService(repo, { now: at(FRIDAY_NOON) });
        const quiet = miles >= previous && miles - previous <= 300;
        expect((await service.log(miles, false)).status).toBe(quiet ? "saved" : "needs_confirmation");
        expect((await service.log(miles, true)).status).toBe("saved");
      }),
    );
  });

  it("[AC-MIL-01.4] editing never changes any date", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 9_999_999 }), { minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 9_999_999 }), async (values, miles) => {
        const repo = fakeRepo(values.map((v, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, miles: v })));
        const before = repo.rows.map((r) => r.date);
        await createOdometerService(repo).edit(1, miles, true);
        expect(repo.rows.map((r) => r.date)).toEqual(before);
      }),
    );
  });
});

describe("importReadings", () => {
  const rows = [
    { date: "2026-01-02", miles: 1000 },
    { date: "2026-01-09", miles: 1120 },
  ];

  it("[AC-MIL-04.1] saves the rows with the dates the file gave them", async () => {
    const repo = fakeRepo();
    const result = await createOdometerService(repo).importReadings(rows);
    expect(result).toEqual({ imported: 2, duplicates: 0 });
    expect(repo.rows.map((r) => [r.date, r.miles])).toEqual([["2026-01-02", 1000], ["2026-01-09", 1120]]);
  });

  it("[AC-MIL-04.4] importing the same rows again creates no duplicates", async () => {
    const repo = fakeRepo();
    const service = createOdometerService(repo);
    await service.importReadings(rows);
    expect(await service.importReadings(rows)).toEqual({ imported: 0, duplicates: 2 });
    expect(repo.rows).toHaveLength(2);
  });

  it("[AC-MIL-04.4] a row repeated inside one file, or already logged by hand, is added once", async () => {
    const repo = fakeRepo([{ date: "2026-01-09", miles: 1120 }]);
    const result = await createOdometerService(repo).importReadings([...rows, rows[0]!]);
    expect(result).toEqual({ imported: 1, duplicates: 2 });
    expect(repo.rows).toHaveLength(2);
  });
});
