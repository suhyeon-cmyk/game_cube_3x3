"use client";

import { localizeColorWords } from "@/lib/cube/state";
import { useState } from "react";
import { isSolved } from "@/lib/cube/state";
import { STAGES, StageId, currentStage, isStageDone } from "@/lib/solver/stages";
import { btn, card, muted } from "@/lib/ui/classes";
import { isBusy, useCubeStore } from "@/store/cubeStore";
import { MoveSequence } from "./MoveSequence";

const SPEEDS = [
  { label: "느리게", value: 1.0 },
  { label: "보통", value: 0.6 },
  { label: "빠르게", value: 0.3 },
  { label: "아주 빠르게", value: 0.12 },
];

export function AutoPanel() {
  const cube = useCubeStore((s) => s.cube);
  const busy = useCubeStore(isBusy);
  const speed = useCubeStore((s) => s.speed);
  const program = useCubeStore((s) => s.program);
  const current = useCubeStore((s) => s.current);
  const { solveStage, solveAll, setSpeed } = useCubeStore.getState();
  const nowStage = currentStage(cube);
  const runningStage = busy && program && current?.source === "solve" ? program.steps[program.stepIndex]?.stage : null;
  // 사용자가 펼친 단계. 없으면 실행 중이거나 지금 풀 차례인 단계를 펼친다
  const [opened, setOpened] = useState<StageId | null>(null);
  const [touched, setTouched] = useState(false);
  const expanded = touched ? opened : (runningStage ?? nowStage);

  return (
    <div className="flex flex-col gap-3">
      <div className={`${card} flex flex-col gap-2 p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">회전 속도</span>
          <span className={`font-mono text-xs ${muted}`}>{speed.toFixed(2)}초 / 수</span>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="radiogroup" aria-label="회전 속도">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={speed === s.value}
              onClick={() => setSpeed(s.value)}
              className={
                "min-h-10 rounded-lg px-1 text-xs font-medium transition-colors lg:min-h-8 " +
                (speed === s.value
                  ? "bg-white shadow-sm dark:bg-zinc-600"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button className={btn.primary + " w-full"} disabled={busy || isSolved(cube)} onClick={solveAll}>
        전체 풀기
      </button>

      <ol className="flex flex-col gap-2">
        {STAGES.map((st) => {
          const done = isStageDone(cube, st.id);
          const running = runningStage === st.id;
          const isNext = !running && nowStage === st.id;
          const open = expanded === st.id;
          return (
            <li
              key={st.id}
              className={
                card +
                " overflow-hidden " +
                (running ? "!border-rose-400 ring-2 ring-rose-400/30" : isNext ? "!border-zinc-400 dark:!border-zinc-500" : "")
              }
            >
              <div className="flex items-center gap-2 p-2 pl-3">
                <button
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left lg:min-h-9"
                  onClick={() => {
                    setTouched(true);
                    setOpened(open ? null : st.id);
                  }}
                  aria-expanded={open}
                >
                  <span
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                      (done
                        ? "bg-emerald-500 text-white"
                        : running
                          ? "bg-rose-500 text-white"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200")
                    }
                  >
                    {done ? "✓" : st.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{localizeColorWords(st.title)}</span>
                    <span className={`block truncate text-xs ${muted}`}>
                      {running ? "푸는 중…" : done ? "완료" : isNext ? "지금 풀 차례" : localizeColorWords(st.goal)}
                    </span>
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`shrink-0 transition-transform ${muted} ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <button
                  className={(isNext ? btn.accent : btn.secondary) + " shrink-0 px-3"}
                  disabled={busy || done}
                  onClick={() => solveStage(st.id)}
                  aria-label={`${st.id}단계 ${localizeColorWords(st.title)} 자동으로 풀기`}
                >
                  {done ? "완료" : "풀기"}
                </button>
              </div>
              {open && (
                <div className="flex flex-col gap-2 border-t border-zinc-100 px-3 pb-3 pt-2 dark:border-zinc-800">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{localizeColorWords(st.goal)}</p>
                  {st.algorithms.map((a) => (
                    <div key={a.id} className="flex flex-col gap-1">
                      <span className={`text-xs ${muted}`}>{a.name}</span>
                      <MoveSequence moves={a.moves} />
                    </div>
                  ))}
                  <ul className={`flex flex-col gap-0.5 text-xs leading-5 ${muted}`}>
                    {st.tips.map((t) => (
                      <li key={t}>· {localizeColorWords(t)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
