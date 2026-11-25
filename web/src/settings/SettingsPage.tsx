import { useState } from "react";
import { useGroceryStore } from "../groceries/GroceryStoreContext";
import { clearGroceryDevice } from "../groceries/offlineStore";
import { Page } from "../pages/Page";
import { BUILD, versionText, type BuildInfo } from "../version";
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
const select = "min-h-11 w-full rounded-lg border border-line bg-bg p-2.5 text-ink";

const ENVIRONMENT_NAME = { production: "Production", staging: "Staging", local: "Local" } as const;

/** `navigate` and `build` are props only so a test can see where sign out goes and try each environment. */
export function SettingsPage({ navigate = (url: string) => window.location.assign(url), build = BUILD }: { navigate?: (url: string) => void; build?: BuildInfo } = {}) {
  const groceries = useGroceryStore();
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
                className={`min-h-11 flex-1 rounded-md px-3 py-2 text-sm ${prefs.theme === t.value ? "bg-card font-bold text-gtext shadow-sm" : "text-muted"}`}
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
              <select className={select} value={prefs.timeZone} onChange={(e) => update({ timeZone: e.target.value })} aria-describedby="tz-help">
                {timeZones(prefs.timeZone).map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </label>
            <p id="tz-help" className="-mt-2 text-sm text-muted">
              Decides which day a new reading, weight or workout is saved on, and what &ldquo;today&rdquo; means, wherever you are.
            </p>
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
          <a
            href={SIGN_OUT_URL}
            // The saved grocery list is deleted from this phone before signing out (ADR-0027, AC-GRO-02.5).
            onClick={(event) => {
              event.preventDefault();
              void clearGroceryDevice(groceries).finally(() => navigate(SIGN_OUT_URL));
            }}
            className="block rounded-lg border border-line px-4 py-2.5 text-center font-bold text-ink">
            Sign out
          </a>
        </section>

        <section className={card} aria-labelledby="set-about">
          <h2 id="set-about" className={heading}>About</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Version</dt>
            <dd className="text-ink">{versionText(build)}</dd>
            <dt className="text-muted">Environment</dt>
            <dd className="text-ink">{ENVIRONMENT_NAME[build.environment]}</dd>
          </dl>
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
