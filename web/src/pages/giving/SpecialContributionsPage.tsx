import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  MAX_OCCASION_LENGTH,
  PAYMENT_METHODS,
  specialContributionTotal,
  type PaymentMethod,
  type SaveSpecialContributionRequest,
  type SpecialContributionRecord,
} from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Page } from "../Page";
import { centsToInput, dateLabel, formatCents, METHOD_LABEL, parseDollars, todayLocal } from "./giftFormat";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const primaryButton = "min-h-11 rounded-xl bg-g700 px-4 py-3 font-bold text-white disabled:opacity-40";
const ghostButton = "min-h-11 rounded-xl border border-line px-4 py-3 text-ink";

interface FormValues {
  dateGiven: string;
  occasion: string;
  amount: string;
  method: PaymentMethod;
}

const blankForm = (): FormValues => ({ dateGiven: todayLocal(), occasion: "", amount: "", method: "check" });

/** The request for a form, or undefined while a field is not usable yet. */
function toRequest(values: FormValues): SaveSpecialContributionRequest | undefined {
  const cents = parseDollars(values.amount);
  const occasion = values.occasion.trim();
  if (cents === undefined || occasion === "" || !/^\d{4}-\d{2}-\d{2}$/.test(values.dateGiven)) return undefined;
  return { dateGiven: values.dateGiven, occasion, cents, method: values.method };
}

/** Name or occasion instead of a "for" month (AC-GIV-02.1). Used for both a new contribution and an edit. */
function Fields({ values, onChange, idPrefix }: { values: FormValues; onChange: (values: FormValues) => void; idPrefix: string }) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...values, [key]: value });
  return (
    <div className="space-y-3">
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-occasion`}>
        Name or occasion
        <input id={`${idPrefix}-occasion`} className={`${inputClass} mt-1 font-normal`} maxLength={MAX_OCCASION_LENGTH} autoComplete="off" value={values.occasion} onChange={(e) => set("occasion", e.target.value)} />
      </label>
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-date`}>
        Date given
        <input id={`${idPrefix}-date`} type="date" className={`${inputClass} mt-1 font-normal`} value={values.dateGiven} onChange={(e) => set("dateGiven", e.target.value)} />
      </label>
      <div>
        <label className="block font-bold text-ink" htmlFor={`${idPrefix}-amount`}>
          Amount
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span aria-hidden="true">$</span>
          <input id={`${idPrefix}-amount`} className={inputClass} inputMode="decimal" autoComplete="off" value={values.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
      </div>
      <fieldset>
        <legend className="font-bold text-ink">Payment method</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-ink">
          {PAYMENT_METHODS.map((method) => (
            <label key={method} className="flex items-center gap-2">
              <input type="radio" name={`${idPrefix}-method`} checked={values.method === method} onChange={() => set("method", method)} />
              {METHOD_LABEL[method]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Row({ contribution, onChanged }: { contribution: SpecialContributionRecord; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [values, setValues] = useState<FormValues>({
    dateGiven: contribution.dateGiven,
    occasion: contribution.occasion,
    amount: centsToInput(contribution.cents),
    method: contribution.method,
  });
  const [error, setError] = useState(false);
  const request = toRequest(values);
  const label = `${contribution.occasion}, ${formatCents(contribution.cents)}`;

  const close = () => {
    setMode("view");
    setError(false);
  };

  async function run(action: () => Promise<unknown>) {
    setError(false);
    try {
      await action();
      close();
      await onChanged();
    } catch {
      setError(true);
    }
  }

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <b>{contribution.occasion}</b>
        <span className="text-muted">{dateLabel(contribution.dateGiven)}</span>
        <b>{formatCents(contribution.cents)}</b>
        <span className="text-muted">{METHOD_LABEL[contribution.method]}</span>
        {mode === "view" && (
          <span className="flex gap-3">
            <button type="button" className="min-h-11 px-1 text-g700 underline" aria-label={`Edit special contribution: ${label}`} onClick={() => setMode("edit")}>
              Edit
            </button>
            <button type="button" className="min-h-11 px-1 text-g700 underline" aria-label={`Delete special contribution: ${label}`} onClick={() => setMode("delete")}>
              Delete
            </button>
          </span>
        )}
      </div>

      {mode === "edit" && (
        <form
          className="mt-3 space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (request) void run(() => api.editSpecialContribution(contribution.id, request));
          }}
        >
          <Fields values={values} onChange={setValues} idPrefix={`edit-special-${contribution.id}`} />
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={!request}>
              Save change
            </button>
            <button type="button" className={ghostButton} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
          <p>Delete this special contribution? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryButton} onClick={() => void run(() => api.deleteSpecialContribution(contribution.id))}>
              Yes, delete
            </button>
            <button type="button" className={ghostButton} onClick={close}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm">That did not work. Try again.</p>}
    </li>
  );
}

/** Giving > Special contributions (GIV-02). Listed and totaled apart from regular giving (AC-GIV-02.2). */
export function SpecialContributionsPage() {
  const api = useApi();
  const [values, setValues] = useState<FormValues>(blankForm);
  const [list, setList] = useState<SpecialContributionRecord[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList((await api.listSpecialContributions()).contributions);
    } catch {
      setError(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = toRequest(values);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!request) return;
    setError(false);
    setMessage(null);
    try {
      const saved = await api.logSpecialContribution(request);
      // Keep the date and method for the next one; clear the name and the amount.
      setValues({ ...values, occasion: "", amount: "" });
      setMessage(`Saved ${formatCents(saved.cents)} for ${saved.occasion}.`);
      document.getElementById("new-special-occasion")?.focus();
    } catch {
      return setError(true);
    }
    await refresh();
  }

  return (
    <Page title="Special contributions">
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
          <Fields values={values} onChange={(next) => { setValues(next); setMessage(null); }} idPrefix="new-special" />
          {values.amount.trim() !== "" && parseDollars(values.amount) === undefined && <p className="text-sm">Enter an amount in dollars and cents, like 150.00.</p>}
          <button type="submit" className={primaryButton} disabled={!request}>
            Save special contribution
          </button>
          {message && <p role="status" className="text-g700">{message}</p>}
          {error && <p role="alert">That did not work. Try again.</p>}
        </form>

        <section aria-labelledby="special-history" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="special-history" className="flex justify-between gap-3 font-bold">
            <span>Special contributions</span>
            {list !== null && list.length > 0 && <span aria-label="Special contributions total">{formatCents(specialContributionTotal(list))}</span>}
          </h2>
          {list === null ? (
            <p className="mt-2 text-muted">Loading…</p>
          ) : list.length === 0 ? (
            <p className="mt-2 text-muted">No special contributions yet. Add one with the form, using a name or occasion.</p>
          ) : (
            <ul>
              {list.map((contribution) => (
                <Row key={contribution.id} contribution={contribution} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
