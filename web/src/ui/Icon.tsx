import type { ReactNode } from "react";

/** Simple line icons, drawn here so the app needs no icon package. They take their colour from the text (`currentColor`). */
const PATHS = {
  home: <path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6" />,
  giving: <path d="M12 21s-7-4.6-9.3-9.1C1 8.5 3 5 6.5 5c2.1 0 3.9 1.2 5.5 3 1.6-1.8 3.4-3 5.5-3C21 5 23 8.5 21.3 11.9 19 16.4 12 21 12 21z" />,
  health: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  car: (
    <>
      <path d="M4 17v-4l2-5h12l2 5v4M4 17h16M3 13h18" />
      <path d="M7.5 15h.01M16.5 15h.01" />
    </>
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  scale: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10a4 4 0 0 1 8 0M12 10l1.8-2" />
    </>
  ),
  dumbbell: <path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12" />,
  gauge: <path d="M4 18a8 8 0 1 1 16 0M12 18l4-5" />,
  gift: (
    <>
      <path d="M4 11h16v9H4zM3 8h18v3H3zM12 8v12" />
      <path d="M12 8C9 8 8 6 8 5s1-2 2-2c2 0 2 3 2 5zM12 8c3 0 4-2 4-3s-1-2-2-2c-2 0-2 3-2 5z" />
    </>
  ),
  chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  chevron: <path d="M9 6l6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
