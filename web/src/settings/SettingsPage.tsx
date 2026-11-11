import { useState } from "react";
import { Page } from "../pages/Page";
import {
  SIGN_OUT_URL,
  applyTheme,
  loadPreferences,
  savePreferences,
  timeZones,
  type Preferences,
  type Theme,
  type WeightUnit,
} from "./preferences";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const card = "rounded-xl border border-line bg-card p-4";
const heading = "mb-3 text-sm font-bold text-ink";
const select = "w-full rounded-lg border border-line bg-bg p-2.5 text-ink";

export function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);

  function update(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(next);
    if (patch.theme) applyTheme(patch.theme);
  }

  return (
    <Page title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="set-appearance">
          <h2 id="set-appearance" className={heading}>Appearance</h2>
          <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-sunk p-1">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={prefs.theme === t.value}
                onClick={() => update({ theme: t.value })}
                className={`flex-1 rounded-md px-3 py-2 text-sm ${prefs.theme === t.value ? "bg-card font-bold text-g700 shadow-sm" : "text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className={card} aria-labelledby="set-prefs">
          <h2 id="set-prefs" className={heading}>Preferences</h2>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-muted">
              Time zone
              <select className={select} value={prefs.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
                {timeZones(prefs.timeZone).map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Weight unit
              <select
                className={select}
                value={prefs.weightUnit}
                onChange={(e) => update({ weightUnit: e.target.value as WeightUnit })}
              >
                <option value="lb">Pounds (lb)</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </label>
          </div>
        </section>

        <section className={card} aria-labelledby="set-account">
          <h2 id="set-account" className={heading}>Account</h2>
          <p className="mb-3 text-sm text-muted">Signed in as the owner.</p>
          <a href={SIGN_OUT_URL} className="block rounded-lg border border-line px-4 py-2.5 text-center font-bold text-ink">
            Sign out
          </a>
        </section>

        <section className={card} aria-labelledby="set-data">
          <h2 id="set-data" className={heading}>Your data (coming later)</h2>
          <div className="grid gap-2">
            <button type="button" disabled className="rounded-lg border border-line px-4 py-2.5 text-muted opacity-60">
              Export all my data
            </button>
            <button type="button" disabled className="rounded-lg border border-line px-4 py-2.5 text-muted opacity-60">
              Delete all my data
            </button>
          </div>
        </section>
      </div>
    </Page>
  );
}
