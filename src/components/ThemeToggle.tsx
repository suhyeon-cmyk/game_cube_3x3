"use client";

import { useSyncExternalStore } from "react";
import { ThemePref, getServerThemePref, getThemePref, setThemePref, subscribeTheme } from "@/lib/ui/theme";

const ORDER: ThemePref[] = ["system", "light", "dark"];
const LABEL: Record<ThemePref, string> = { system: "시스템", light: "라이트", dark: "다크" };

function Icon({ pref }: { pref: ThemePref }) {
  const common = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
  if (pref === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (pref === "dark")
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribeTheme, getThemePref, getServerThemePref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  return (
    <button
      onClick={() => setThemePref(next)}
      className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      aria-label={`테마: ${LABEL[pref]} (눌러서 ${LABEL[next]}로 바꾸기)`}
      title={`테마: ${LABEL[pref]}`}
    >
      <Icon pref={pref} />
      <span className="hidden sm:inline">{LABEL[pref]}</span>
    </button>
  );
}
