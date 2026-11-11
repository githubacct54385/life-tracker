import { useSyncExternalStore } from "react";
import { RAIL_MIN, SIDEBAR_MIN, type NavKind } from "./destinations";

const railQuery = `(min-width: ${RAIL_MIN}px)`;
const sidebarQuery = `(min-width: ${SIDEBAR_MIN}px)`;

function read(): NavKind {
  if (typeof window === "undefined" || !window.matchMedia) return "tabs";
  if (window.matchMedia(sidebarQuery).matches) return "sidebar";
  return window.matchMedia(railQuery).matches ? "rail" : "tabs";
}

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(railQuery), window.matchMedia(sidebarQuery)];
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

/** Which navigation the current width gets. Only one is ever in the page. */
export function useNavKind(): NavKind {
  return useSyncExternalStore(subscribe, read, () => "tabs");
}
