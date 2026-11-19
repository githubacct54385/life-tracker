import { useEffect, type ReactNode } from "react";
import { APP_NAME } from "@life-tracker/shared";

/** The browser tab title: "Giving · Life Tracker" on a page, just the app name on Home. */
export function documentTitle(title: string): string {
  return title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`;
}

export function Page({ title, children, level = 1 }: { title: string; children?: ReactNode; level?: 1 | 2 }) {
  useEffect(() => {
    if (level === 1) document.title = documentTitle(title);
  }, [title, level]);
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="mx-auto max-w-3xl">
      <Heading className="text-2xl font-bold break-words">{title}</Heading>
      <div className="mt-4 text-muted">{children}</div>
    </section>
  );
}
