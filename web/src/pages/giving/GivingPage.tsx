import { useEffect, useMemo, useState } from "react";
import { givingYearToDate, monthlyRegularGiving, type GiftRecord, type SpecialContributionRecord } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { HubLink } from "../../ui/HubLink";
import { Skeleton } from "../../ui/Skeleton";
import { Page } from "../Page";
import { dateLabel, formatCents, monthLabel, todayLocal } from "./giftFormat";

const card = "rounded-2xl border border-line bg-card p-4 text-ink";

/**
 * Giving home (GIV-03): year totals for regular, special and combined giving, and regular giving grouped by the month
 * it is for, with a clear mark on a month that has no regular gift. `today` is a prop only so tests can fix the date.
 */
export function GivingPage({ today = todayLocal() }: { today?: string }) {
  const api = useApi();
  const [gifts, setGifts] = useState<GiftRecord[] | null>(null);
  const [special, setSpecial] = useState<SpecialContributionRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);

  useEffect(() => {
    let current = true;
    Promise.all([api.listGifts(), api.listSpecialContributions()])
      .then(([g, s]) => {
        if (!current) return;
        setGifts(g.gifts);
        setSpecial(s.contributions);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [api]);

  const years = useMemo(() => {
    const found = new Set<number>([thisYear]);
    for (const g of gifts ?? []) found.add(Number(g.forMonth.slice(0, 4)));
    for (const s of special ?? []) found.add(Number(s.dateGiven.slice(0, 4)));
    return [...found].sort((a, b) => b - a);
  }, [gifts, special, thisYear]);

  const totals = useMemo(() => (gifts && special ? givingYearToDate(gifts, special, { year }) : null), [gifts, special, year]);
  const months = useMemo(() => {
    if (!gifts) return null;
    const all = monthlyRegularGiving(gifts, { year, today });
    // The current year only lists months that have begun, newest first.
    return all.filter((m) => year < thisYear || m.month <= today.slice(0, 7)).reverse();
  }, [gifts, year, today, thisYear]);

  const loaded = gifts !== null && special !== null;
  const empty = loaded && gifts.length === 0 && special.length === 0;
  const totalLabel = year === thisYear ? "Year to date" : `Total for ${year}`;

  return (
    <Page title="Giving">
      <div className="space-y-4 text-ink">
        <div className="grid gap-3 sm:grid-cols-2">
          <HubLink to="/giving/log" icon="gift" title="Log a gift" description="Record a regular gift for a month" />
          <HubLink to="/giving/special" icon="giving" title="Special contributions" description="Gifts outside the monthly pattern" />
        </div>

        {failed && <p role="alert">That did not work. Try again.</p>}
        {!failed && !loaded && <Skeleton lines={3} />}
        {empty && <p className="text-muted">No giving recorded yet. Log a gift to see your totals and your month-by-month history here.</p>}

        {loaded && !empty && totals && months && (
          <>
            <label className="block font-bold" htmlFor="giving-year">
              Year
              <select id="giving-year" className="mt-1 block min-h-11 w-full max-w-xs rounded-xl border border-line bg-card px-3 py-2 font-normal text-ink" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <section aria-labelledby="giving-totals" className={card}>
              <h2 id="giving-totals" className="font-bold">
                {totalLabel}
              </h2>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                <dt>Regular giving</dt>
                <dd className="text-right font-bold">{formatCents(totals.regularCents)}</dd>
                <dt>Special contributions</dt>
                <dd className="text-right font-bold">{formatCents(totals.specialCents)}</dd>
                <dt className="border-t border-line pt-1">Combined</dt>
                <dd className="border-t border-line pt-1 text-right font-bold">{formatCents(totals.combinedCents)}</dd>
              </dl>
            </section>

            <section aria-labelledby="giving-months" className={card}>
              <h2 id="giving-months" className="font-bold">
                Regular giving by month
              </h2>
              <ul>
                {months.map((m) => (
                  <li key={m.month} className="border-b border-line py-3 last:border-b-0" aria-label={monthLabel(m.month)}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="font-bold">{monthLabel(m.month)}</span>
                      {m.noGift ? <span className="rounded-full border border-line bg-sunk px-2 py-0.5 text-sm font-bold">No gift</span> : <span className="font-bold">{formatCents(m.cents)}</span>}
                    </div>
                    {m.count > 0 && (
                      <ul className="mt-1 text-sm text-muted">
                        {gifts
                          .filter((g) => g.forMonth === m.month)
                          .sort((a, b) => (a.dateGiven === b.dateGiven ? a.id - b.id : a.dateGiven < b.dateGiven ? -1 : 1))
                          .map((g) => (
                            <li key={g.id} className="flex flex-wrap justify-between gap-x-3">
                              <span>
                                {dateLabel(g.dateGiven)}
                                {g.description ? `, ${g.description}` : ""}
                              </span>
                              <span>{formatCents(g.cents)}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Page>
  );
}
