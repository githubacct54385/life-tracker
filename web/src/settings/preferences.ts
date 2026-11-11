// Owner preferences (SET-01). Stored in this browser only, so Settings needs no API call and works in demo mode.
export type Theme = "light" | "dark" | "system";
export type WeightUnit = "lb" | "kg";
export interface Preferences {
  theme: Theme;
  timeZone: string;
  weightUnit: WeightUnit;
}

export const SIGN_OUT_URL = "/cdn-cgi/access/logout";
const KEY = "life-tracker.preferences";

export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function defaults(): Preferences {
  return { theme: "system", timeZone: detectTimeZone(), weightUnit: "lb" };
}

export function loadPreferences(): Preferences {
  const base = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Preferences> | null;
    if (!raw) return base;
    return {
      theme: raw.theme === "light" || raw.theme === "dark" || raw.theme === "system" ? raw.theme : base.theme,
      timeZone: typeof raw.timeZone === "string" && raw.timeZone ? raw.timeZone : base.timeZone,
      weightUnit: raw.weightUnit === "kg" || raw.weightUnit === "lb" ? raw.weightUnit : base.weightUnit,
    };
  } catch {
    return base;
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}

/** "system" removes the override so the prefers-color-scheme rule in index.css decides. */
export function applyTheme(theme: Theme): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}
