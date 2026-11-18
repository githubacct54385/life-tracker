import { useCallback, useEffect, useState, type FormEvent } from "react";
import { groupGiftsByMonth, MAX_DESCRIPTION_LENGTH, PAYMENT_METHODS, type GiftRecord, type PaymentMethod, type SaveGiftRequest } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { Page } from "../Page";
import { centsToInput, dateLabel, defaultDescription, formatCents, METHOD_LABEL, monthLabel, parseDollars, todayLocal } from "./giftFormat";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";
const primaryButton = "rounded-xl bg-g700 px-4 py-3 font-bold text-white disabled:opacity-40";
const ghostButton = "rounded-xl border border-line px-4 py-3 text-ink";

interface FormValues {
  dateGiven: string;
  forMonth: string;
  amount: string;
  method: PaymentMethod;
  description: string;
  /** True once the owner has typed in the description. Until then it follows the month it is for. */
  descriptionEdited: boolean;
}

const blankForm = (forMonth = todayLocal().slice(0, 7)): FormValues => ({
  dateGiven: todayLocal(),
  forMonth,
  amount: "",
  method: "check",
  description: defaultDescription(forMonth),
  descriptionEdited: false,
});

/** The request for a form, or undefined while a field is not usable yet. */
function toRequest(values: FormValues): SaveGiftRequest | undefined {
  const cents = parseDollars(values.amount);
  if (cents === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(values.dateGiven) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.forMonth)) return undefined;
  return { dateGiven: values.dateGiven, forMonth: values.forMonth, cents, method: values.method, description: values.description.trim() };
}

/** The four fields of a gift. A date only: there is no time field (AC-GIV-01.1). Used for both a new gift and an edit. */
function GiftFields({ values, onChange, idPrefix }: { values: FormValues; onChange: (values: FormValues) => void; idPrefix: string }) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...values, [key]: value });
  // Choosing another month moves the default description with it, unless the owner has written their own (AC-GIV-02.3).
  const setMonth = (forMonth: string) =>
    onChange({ ...values, forMonth, ...(values.descriptionEdited ? {} : { description: defaultDescription(forMonth) }) });
  return (
    <div className="space-y-3">
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-date`}>
        Date given
        <input id={`${idPrefix}-date`} type="date" className={`${inputClass} mt-1 font-normal`} value={values.dateGiven} onChange={(e) => set("dateGiven", e.target.value)} />
      </label>
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-month`}>
        Month it is for
        <input id={`${idPrefix}-month`} type="month" className={`${inputClass} mt-1 font-normal`} value={values.forMonth} onChange={(e) => setMonth(e.target.value)} />
      </label>
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-description`}>
        Description
        <input
          id={`${idPrefix}-description`}
          className={`${inputClass} mt-1 font-normal`}
          maxLength={MAX_DESCRIPTION_LENGTH}
          autoComplete="off"
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value, descriptionEdited: true })}
        />
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
            <label key={method} className="flex min-h-11 items-center gap-2">
              <input type="radio" name={`${idPrefix}-method`} checked={values.method === method} onChange={() => set("method", method)} />
              {METHOD_LABEL[method]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** One gift in the list, with edit (every field) and delete (for good). */
function GiftRow({ gift, onChanged }: { gift: GiftRecord; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [values, setValues] = useState<FormValues>({
    dateGiven: gift.dateGiven,
    forMonth: gift.forMonth,
    amount: centsToInput(gift.cents),
    method: gift.method,
    description: gift.description ?? "",
    descriptionEdited: true,
  });
  const [error, setError] = useState(false);
  const request = toRequest(values);
  const label = `${formatCents(gift.cents)} given ${dateLabel(gift.dateGiven)}`;

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
        <span className="text-muted">{dateLabel(gift.dateGiven)}</span>
        {gift.description && <span>{gift.description}</span>}
        <b>{formatCents(gift.cents)}</b>
        <span className="text-muted">{METHOD_LABEL[gift.method]}</span>
        {mode === "view" && (
          <span className="flex gap-3">
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Edit gift: ${label}`} onClick={() => setMode("edit")}>
              Edit
            </button>
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Delete gift: ${label}`} onClick={() => setMode("delete")}>
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
            if (request) void run(() => api.editGift(gift.id, request));
          }}
        >
          <GiftFields values={values} onChange={setValues} idPrefix={`edit-${gift.id}`} />
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
          <p>Delete this gift? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryButton} onClick={() => void run(() => api.deleteGift(gift.id))}>
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

/** Giving > Log a gift (GIV-01). Gifts are listed under the month they are for, with the month total (AC-GIV-01.3). */
export function LogGiftPage() {
  const api = useApi();
  const [values, setValues] = useState<FormValues>(blankForm);
  const [gifts, setGifts] = useState<GiftRecord[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setGifts((await api.listGifts()).gifts);
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
      const saved = await api.logGift(request);
      // Keep the dates for the next gift; clear the amount and start the description from the month again.
      setValues({ ...values, amount: "", description: defaultDescription(values.forMonth), descriptionEdited: false });
      setMessage(`Saved ${formatCents(saved.cents)} for ${monthLabel(saved.forMonth)}.`);
      document.getElementById("new-gift-amount")?.focus();
    } catch {
      return setError(true);
    }
    await refresh();
  }

  const months = gifts === null ? null : groupGiftsByMonth(gifts);

  return (
    <Page title="Log a gift">
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
          <GiftFields values={values} onChange={(next) => { setValues(next); setMessage(null); }} idPrefix="new-gift" />
          {values.amount.trim() !== "" && parseDollars(values.amount) === undefined && (
            <p className="text-sm">Enter an amount in dollars and cents, like 150.00.</p>
          )}
          <button type="submit" className={primaryButton} disabled={!request}>
            Save gift
          </button>
          {message && <p role="status" className="text-gtext">{message}</p>}
          {error && <p role="alert">That did not work. Try again.</p>}
        </form>

        <section aria-labelledby="gift-history" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="gift-history" className="font-bold">
            Gifts by month
          </h2>
          {months === null ? (
            <p className="mt-2 text-muted">Loading…</p>
          ) : months.length === 0 ? (
            <p className="mt-2 text-muted">No gifts yet. Fill in the form and save your first gift.</p>
          ) : (
            months.map((month) => (
              <div key={month.month} className="mt-4" role="group" aria-label={monthLabel(month.month)}>
                <h3 className="flex justify-between gap-3 font-bold">
                  <span>{monthLabel(month.month)}</span>
                  <span>{formatCents(month.cents)}</span>
                </h3>
                <ul>
                  {month.gifts.map((gift) => (
                    <GiftRow key={gift.id} gift={gift} onChanged={refresh} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </Page>
  );
}
