// Sample data for the staging database (OPS-08, ADR-0025). Synthetic and made in code, never read from a file (hard rule 3).
// The same day always gives the same data, so staging looks the same after every reset and tests can check exact numbers.
// Nothing here resembles a real person's data: names are plainly "Sample", amounts are round, and the people and places are made up.

export interface StagingSeed {
  odometer: { date: string; miles: number }[];
  weights: { date: string; pounds: string }[];
  workouts: { date: string; type: string; minutes: number | null; reps: number | null; note: string | null; source: "manual" | "apple_watch" }[];
  gifts: { givenOn: string; forMonth: string; amount: string; method: "check" | "card"; description: string }[];
  specials: { givenOn: string; occasion: string; amount: string; method: "check" | "card" }[];
  places: string[];
  maintenance: { date: string; odometerMiles: number | null; doneBy: "shop" | "home"; place: string | null; costCents: number | null; note: string | null; services: string[] }[];
}

const DAY_MS = 86_400_000;

/** `date` ("YYYY-MM-DD") moved by a number of days, in UTC. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** A small repeatable number generator (a linear congruential generator). Not for security, only so the data repeats. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function buildStagingSeed(today: string): StagingSeed {
  const next = sequence(20_261_120);

  // Weekly odometer readings for 40 weeks, oldest first, ending today.
  const odometer: StagingSeed["odometer"] = [];
  let miles = 48_300;
  for (let week = 39; week >= 0; week -= 1) {
    miles += 180 + Math.floor(next() * 220);
    odometer.push({ date: addDays(today, -7 * week), miles });
  }

  // A weight every third day for 120 days, drifting down with a little noise. One reading per date (the table is unique on it).
  const weights: StagingSeed["weights"] = [];
  for (let step = 40; step >= 0; step -= 1) {
    const drift = (40 - step) * 0.07;
    const pounds = 186 - drift + (next() - 0.5) * 2.4;
    weights.push({ date: addDays(today, -3 * step), pounds: pounds.toFixed(1) });
  }

  // Three sessions a week for 12 weeks. Pushups are counted, not timed (HLT-02).
  const kinds = ["Walk", "Run", "Cycling", "Strength", "Pushups"] as const;
  const workouts: StagingSeed["workouts"] = [];
  for (let week = 11; week >= 0; week -= 1) {
    for (const [slot, offset] of [2, 4, 6].entries()) {
      const date = addDays(today, -7 * week - offset);
      const type = kinds[(week + slot) % kinds.length]!;
      const counted = type === "Pushups";
      workouts.push({
        date,
        type,
        minutes: counted ? null : 20 + Math.floor(next() * 41),
        reps: counted ? 20 + Math.floor(next() * 31) : null,
        note: slot === 1 && week % 4 === 0 ? "Sample note" : null,
        source: type === "Walk" ? "apple_watch" : "manual",
      });
    }
  }

  // A regular gift for each of the last ten months, given early in that month (one a month late, to show the for-month rule).
  const gifts: StagingSeed["gifts"] = [];
  const thisMonth = `${today.slice(0, 7)}-01`;
  for (let back = 9; back >= 0; back -= 1) {
    const first = new Date(Date.parse(`${thisMonth}T00:00:00Z`));
    first.setUTCMonth(first.getUTCMonth() - back);
    const forMonth = first.toISOString().slice(0, 10);
    const following = new Date(first);
    following.setUTCMonth(first.getUTCMonth() + 1);
    const late = back === 5;
    const givenOn = addDays(late ? following.toISOString().slice(0, 10) : forMonth, 2);
    if (givenOn > today) continue;
    gifts.push({
      givenOn,
      forMonth,
      amount: "150.00",
      method: back % 2 === 0 ? "check" : "card",
      description: `${MONTHS[first.getUTCMonth()]} tithe`,
    });
  }

  const specials: StagingSeed["specials"] = [
    { givenOn: addDays(today, -150), occasion: "Sample appeal", amount: "75.00", method: "card" },
    { givenOn: addDays(today, -60), occasion: "Sample building fund", amount: "200.00", method: "check" },
  ];

  const places = ["Sample Garage", "Demo Tire Shop"];

  // Services tied to odometer readings, so the mileage on a service matches the odometer on its date.
  const service = (index: number, services: string[], doneBy: "shop" | "home", place: string | null, costCents: number, note: string | null) => ({
    date: odometer[index]!.date,
    odometerMiles: odometer[index]!.miles,
    doneBy,
    place,
    costCents,
    note,
    services,
  });
  const maintenance: StagingSeed["maintenance"] = [
    service(36, ["Oil change"], "shop", places[0]!, 8_999, null),
    service(29, ["Tires", "Alignment"], "shop", places[1]!, 61_450, "Sample note"),
    service(22, ["Wipers"], "home", null, 2_400, null),
    service(15, ["Oil change", "Rotate tires", "Multi-point inspection"], "shop", places[0]!, 11_999, null),
    service(8, ["Air filter"], "home", null, 1_800, null),
    service(2, ["Brakes"], "shop", places[0]!, 27_500, "Sample note"),
  ];

  return { odometer, weights, workouts, gifts, specials, places, maintenance };
}
