import { Link, Outlet, useLocation } from "react-router";
import { APP_NAME } from "@life-tracker/shared";
import { COMPACT_NAV, WIDE_NAV, isActive, type Destination, type NavKind } from "./destinations";
import { useNavKind } from "./useNavKind";

function Icon({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`block size-[22px] rounded-[7px] border-2 ${active ? "border-g500 bg-g500" : "border-g300"}`}
    />
  );
}

const itemClass: Record<NavKind, (active: boolean) => string> = {
  tabs: (a) => `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${a ? "font-bold text-g700" : "text-muted"}`,
  rail: (a) =>
    `flex w-[68px] flex-col items-center gap-[3px] rounded-xl py-2 text-[11px] ${a ? "bg-g100 font-bold text-g700" : "text-muted"}`,
  sidebar: (a) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${a ? "bg-g100 font-bold text-g700" : "text-muted"}`,
};

const containerClass: Record<NavKind, string> = {
  tabs: "fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card pb-[env(safe-area-inset-bottom)]",
  rail: "sticky top-0 flex h-dvh w-[84px] flex-none flex-col items-center gap-1.5 border-r border-line bg-card py-4",
  sidebar: "sticky top-0 flex h-dvh w-60 flex-none flex-col gap-1 border-r border-line bg-card p-4",
};

function Nav({ kind, items }: { kind: NavKind; items: Destination[] }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main" data-nav={kind} className={containerClass[kind]}>
      {kind === "sidebar" && <p className="mb-3 px-3 text-base font-bold text-g900">{APP_NAME}</p>}
      {items.map((dest) => {
        const active = isActive(dest, pathname, kind);
        return (
          <Link
            key={dest.path}
            to={dest.path}
            className={itemClass[kind](active)}
            aria-current={active ? "page" : undefined}
          >
            <Icon active={active} />
            {dest.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const kind = useNavKind();
  return (
    <div className={`min-h-dvh bg-bg text-ink ${kind === "tabs" ? "" : "flex"}`}>
      <Nav kind={kind} items={kind === "sidebar" ? WIDE_NAV : COMPACT_NAV} />
      <main className={`min-w-0 flex-1 p-5 ${kind === "tabs" ? "pb-24" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
