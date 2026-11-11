export type Destination = { label: string; path: string };

// ADR-0017 as amended by ADR-0021. There is no Money destination.
export const HOME: Destination = { label: "Home", path: "/" };
export const GIVING: Destination = { label: "Giving", path: "/giving" };
export const HEALTH: Destination = { label: "Health", path: "/health" };
export const CAR: Destination = { label: "Car", path: "/car" };
export const MORE: Destination = { label: "More", path: "/more" };
export const SETTINGS: Destination = { label: "Settings", path: "/settings" };

/** Phone tab bar and tablet icon rail: Settings lives inside More. */
export const COMPACT_NAV: Destination[] = [HOME, GIVING, HEALTH, CAR, MORE];
/** Desktop sidebar: everything is one click away. */
export const WIDE_NAV: Destination[] = [HOME, GIVING, HEALTH, CAR, SETTINGS];

export type NavKind = "tabs" | "rail" | "sidebar";

// Breakpoints from AGENTS.md: phone under 640, tablet 640 to 1023, desktop 1024 and up.
export const RAIL_MIN = 640;
export const SIDEBAR_MIN = 1024;

/** Which destination is highlighted. On compact layouts Settings belongs to More. */
export function isActive(dest: Destination, pathname: string, kind: NavKind): boolean {
  const current = kind !== "sidebar" && pathname === SETTINGS.path ? MORE.path : pathname;
  return dest.path === "/" ? current === "/" : current === dest.path || current.startsWith(dest.path + "/");
}
