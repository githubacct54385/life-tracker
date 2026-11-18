import type { ReactNode } from "react";

export function Page({ title, children, level = 1 }: { title: string; children?: ReactNode; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className="mx-auto max-w-3xl">
      <Heading className="text-2xl font-bold break-words">{title}</Heading>
      <div className="mt-4 text-muted">{children}</div>
    </section>
  );
}
