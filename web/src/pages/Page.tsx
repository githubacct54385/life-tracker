import type { ReactNode } from "react";

export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold break-words">{title}</h1>
      <div className="mt-4 text-muted">{children}</div>
    </section>
  );
}
