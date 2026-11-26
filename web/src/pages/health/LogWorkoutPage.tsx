import { Button } from "../../ui/Button.js";
import { Skeleton } from "../../ui/Skeleton.js";
import { useBusy } from "../../ui/useBusy.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { isRepWorkout, MAX_WORKOUT_NOTE_LENGTH, WORKOUT_TYPES, type WorkoutRecord } from "@life-tracker/shared";
import { useApi } from "../../api/ApiContext";
import { shortDate } from "../car/readingFormat";
import { Page } from "../Page";
import { amountFromForm, describeAmount, parseMinutes, parseReps, SOURCE_LABELS } from "./workoutFormat";
import { FailureText } from "../../ui/FailureText";

const inputClass = "w-full rounded-xl border border-line bg-card px-3 py-3 text-lg text-ink";

interface FieldsProps {
  idPrefix: string;
  type: string;
  minutes: string;
  reps: string;
  note: string;
  onChange: (next: { type?: string; minutes?: string; reps?: string; note?: string }) => void;
  typeRef?: React.Ref<HTMLSelectElement>;
}

/** Type, duration (or a count, for pushups) and note. Deliberately no date or time (AC-HLT-02.1). */
function WorkoutFields({ idPrefix, type, minutes, reps, note, onChange, typeRef }: FieldsProps) {
  const parsed = parseMinutes(minutes);
  const parsedReps = parseReps(reps);
  const counted = isRepWorkout(type);
  const types = (WORKOUT_TYPES as readonly string[]).includes(type) ? WORKOUT_TYPES : [...WORKOUT_TYPES, type];
  return (
    <>
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-type`}>
        Type
      </label>
      <select id={`${idPrefix}-type`} ref={typeRef} className={inputClass} value={type} onChange={(e) => onChange({ type: e.target.value })}>
        {types.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      {counted ? (
        <>
          <label className="block font-bold text-ink" htmlFor={`${idPrefix}-reps`}>
            How many {type.toLowerCase()}?
          </label>
          <input id={`${idPrefix}-reps`} className={inputClass} inputMode="numeric" autoComplete="off" value={reps} onChange={(e) => onChange({ reps: e.target.value })} />
          {reps.trim() !== "" && parsedReps === undefined && <p className="text-sm">Enter a whole number, from 1 to 10,000.</p>}
        </>
      ) : (
        <>
          <label className="block font-bold text-ink" htmlFor={`${idPrefix}-minutes`}>
            Duration (minutes)
          </label>
          <input id={`${idPrefix}-minutes`} className={inputClass} inputMode="numeric" autoComplete="off" value={minutes} onChange={(e) => onChange({ minutes: e.target.value })} />
          {minutes.trim() !== "" && parsed === undefined && <p className="text-sm">Enter whole minutes, from 1 to 1,440.</p>}
        </>
      )}
      <label className="block font-bold text-ink" htmlFor={`${idPrefix}-note`}>
        Note (optional)
      </label>
      <input id={`${idPrefix}-note`} className={inputClass} maxLength={MAX_WORKOUT_NOTE_LENGTH} autoComplete="off" value={note} onChange={(e) => onChange({ note: e.target.value })} />
    </>
  );
}

/** One workout in the list, with its source, edit (type, duration, note; the date stays) and delete (for good). */
function WorkoutRow({ workout, onChanged }: { workout: WorkoutRecord; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [busy, track] = useBusy();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [form, setForm] = useState({ type: workout.type, minutes: workout.minutes === null ? "" : String(workout.minutes), reps: workout.reps === null ? "" : String(workout.reps), note: workout.note ?? "" });
  const [error, setError] = useState(false);
  const amount = amountFromForm(form.type, form);
  const label = `${workout.type} on ${shortDate(workout.date)}`;

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
        <span className="text-muted">{shortDate(workout.date)}</span>
        <b>
          {workout.type}, {describeAmount(workout)}
        </b>
        <span className="rounded-full border border-line px-2 py-0.5 text-sm">{SOURCE_LABELS[workout.source]}</span>
        {mode === "view" && (
          <span className="flex gap-2">
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Edit ${label}`} onClick={() => { setForm({ type: workout.type, minutes: workout.minutes === null ? "" : String(workout.minutes), reps: workout.reps === null ? "" : String(workout.reps), note: workout.note ?? "" }); setMode("edit"); }}>
              Edit
            </button>
            <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-gtext underline" aria-label={`Delete ${label}`} onClick={() => setMode("delete")}>
              Delete
            </button>
          </span>
        )}
      </div>
      {workout.note && mode !== "edit" && <p className="mt-1 text-sm text-muted break-words">{workout.note}</p>}

      {mode === "edit" && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount !== undefined) void track(() => run(() => api.editWorkout(workout.id, { type: form.type, ...amount, note: form.note })));
          }}
        >
          <WorkoutFields idPrefix={`edit-${workout.id}`} {...form} onChange={(next) => setForm((f) => ({ ...f, ...next }))} />
          <p className="text-sm text-muted">The date stays {shortDate(workout.date)}.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={amount === undefined} busy={busy}>
              Save change
            </Button>
            <Button variant="ghost" type="button" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === "delete" && (
        <div role="alert" className="mt-3 rounded-xl border border-line bg-sunk p-4 text-ink">
          <p>Delete this workout? It is removed for good.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void track(() => run(() => api.deleteWorkout(workout.id)))} busy={busy}>
              Yes, delete
            </Button>
            <Button variant="ghost" type="button" onClick={close} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm"><FailureText fallback="That did not work. Try again." /></p>}
    </li>
  );
}

/** Health > Workouts (HLT-02). There is no date field: a manual workout is dated when it is saved (AC-HLT-02.1). */
export function LogWorkoutPage() {
  const api = useApi();
  const [busy, track] = useBusy();
  const typeField = useRef<HTMLSelectElement>(null);
  const [form, setForm] = useState({ type: WORKOUT_TYPES[0] as string, minutes: "", reps: "", note: "" });
  const [workouts, setWorkouts] = useState<WorkoutRecord[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setWorkouts((await api.listWorkouts()).workouts);
    } catch {
      setError(true);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const amount = amountFromForm(form.type, form);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (amount === undefined) return;
    setError(false);
    setMessage(null);
    try {
      const saved = await api.logWorkout({ type: form.type, ...amount, note: form.note });
      setForm({ type: form.type, minutes: "", reps: "", note: "" });
      setMessage(`Saved ${saved.type}, ${describeAmount(saved)}.`);
      typeField.current?.focus();
    } catch {
      return setError(true);
    }
    await refresh();
  }

  return (
    <Page title="Workouts">
      <div className="grid gap-5 text-ink lg:grid-cols-2">
        <form onSubmit={(e) => void track(() => submit(e))} className="space-y-3" noValidate>
          <WorkoutFields idPrefix="new" {...form} typeRef={typeField} onChange={(next) => { setForm((f) => ({ ...f, ...next })); setMessage(null); }} />
          <p className="text-sm text-muted">Saved with today&rsquo;s date.</p>
          <Button type="submit" disabled={amount === undefined} busy={busy}>
            Save workout
          </Button>
          {message && <p role="status" className="text-gtext">{message}</p>}
          {error && <p role="alert"><FailureText fallback="That did not work. Try again." /></p>}
        </form>

        <section aria-labelledby="recent-workouts" className="rounded-2xl border border-line bg-card p-4 text-ink">
          <h2 id="recent-workouts" className="font-bold">
            Recent workouts
          </h2>
          {workouts === null ? (
            <Skeleton lines={3} />
          ) : workouts.length === 0 ? (
            <p className="mt-2 text-muted">No workouts yet. Choose a type and a duration (or a count, for pushups) above, then save.</p>
          ) : (
            <ul className="mt-2">
              {workouts.map((workout) => (
                <WorkoutRow key={workout.id} workout={workout} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
