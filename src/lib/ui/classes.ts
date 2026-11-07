const base =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-40 min-h-11 lg:min-h-9 px-4 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500";

export const btn = {
  primary: `${base} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white`,
  secondary: `${base} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`,
  accent: `${base} bg-rose-500 text-white hover:bg-rose-600`,
  icon:
    "inline-flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-xl transition-colors disabled:opacity-40 " +
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500",
};

export const card = "rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
export const muted = "text-zinc-500 dark:text-zinc-400";
