"use client";

import { useState } from "react";
import { FaceName } from "@/lib/cube/geometry";
import { Amount, Move, MoveFace, moveToString } from "@/lib/cube/moves";
import { centerColor, CubeState, localizeColorWords } from "@/lib/cube/state";
import { describeMove } from "@/lib/solver/hint";
import { StageId, currentStage, stageInfo, stageProgress } from "@/lib/solver/stages";
import { card, muted } from "@/lib/ui/classes";
import { isBusy, planNextMove, useCubeStore } from "@/store/cubeStore";
import { MoveSequence } from "./MoveSequence";

export function ManualPanel() {
  const cube = useCubeStore((s) => s.cube);
  const stage = currentStage(cube);
  return (
    <div className="flex flex-col gap-3">
      {stage !== null && <StageCard stage={stage} cube={cube} />}
      <MovePad />
      <KeyboardHelp />
    </div>
  );
}

function StageCard({ stage, cube }: { stage: StageId; cube: CubeState }) {
  const info = stageInfo(stage);
  const { done, total } = stageProgress(cube, stage);
  return (
    <div className={`${card} p-4`}>
      <div className={`flex items-center justify-between text-xs ${muted}`}>
        <span>현재 단계</span>
        <span>
          {total}개 중 {done}개 완료
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-xs font-semibold text-white">
          {stage}
        </span>
        <span className="text-lg font-semibold">{localizeColorWords(info.title)}</span>
        <span className={`ml-auto text-xs ${muted}`}>{stage} / 7</span>
      </div>
      {/* 전체 7단계 진행 */}
      <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden>
        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
          <div
            key={s}
            className={
              "h-1.5 overflow-hidden rounded-full " +
              (s < stage ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-800")
            }
          >
            {s === stage && <div className="h-full bg-rose-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{localizeColorWords(info.goal)}</p>
      {info.algorithms.map((a) => (
        <div key={a.id} className="mt-2 flex flex-col gap-1">
          <span className={`text-xs ${muted}`}>{a.name}</span>
          <MoveSequence moves={a.moves} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Group = "face" | "slice" | "rotate";

const GROUPS: { id: Group; label: string; faces: MoveFace[] }[] = [
  { id: "face", label: "면 돌리기", faces: ["R", "L", "U", "D", "F", "B"] },
  { id: "slice", label: "가운데 층", faces: ["M", "E", "S"] },
  { id: "rotate", label: "큐브 돌려 잡기", faces: ["x", "y", "z"] },
];

const FACE_KO: Partial<Record<MoveFace, string>> = {
  R: "오른쪽",
  L: "왼쪽",
  U: "위",
  D: "아래",
  F: "앞",
  B: "뒤",
  M: "세로",
  E: "가로",
  S: "앞뒤",
  x: "앞→위",
  y: "오른→앞",
  z: "위→오른",
};

const AMOUNTS: { amount: Amount; glyph: string; label: string }[] = [
  { amount: 1, glyph: "↻", label: "시계" },
  { amount: -1, glyph: "↺", label: "반시계" },
  { amount: 2, glyph: "⟲", label: "두 번" },
];

function MovePad() {
  const cube = useCubeStore((s) => s.cube);
  const plan = useCubeStore((s) => s.plan);
  const busy = useCubeStore(isBusy);
  const { userMove } = useCubeStore.getState();
  const next = planNextMove(plan);
  const nextGroup = next ? GROUPS.find((g) => g.faces.includes(next.face))?.id : undefined;
  // 안내가 바뀌면 안내하는 수가 있는 탭으로 자동 이동하고, 그 뒤엔 사용자가 고른 탭을 유지한다
  const nextKey = next ? `${moveToString(next)}@${plan?.steps.length}:${plan?.moveIndex}` : "none";
  const [picked, setPicked] = useState<{ group: Group; at: string } | null>(null);
  const group = picked && picked.at === nextKey ? picked.group : (nextGroup ?? picked?.group ?? "face");
  const def = GROUPS.find((g) => g.id === group)!;

  return (
    <div className={`${card} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">직접 돌리기</span>
        <span className={`text-xs ${muted}`}>
          <span className="lg:hidden">스티커를 밀어서 돌릴 수도 있어요</span>
          <span className="hidden lg:inline">스티커를 드래그해도 돌아가요</span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setPicked({ group: g.id, at: nextKey })}
            className={
              "relative min-h-10 rounded-lg px-1 text-xs font-medium transition-colors lg:min-h-8 " +
              (group === g.id
                ? "bg-white shadow-sm dark:bg-zinc-600"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100")
            }
          >
            {g.label}
            {nextGroup === g.id && group !== g.id && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" aria-label="안내 있음" />
            )}
          </button>
        ))}
      </div>

      <div className={`mt-3 grid gap-1.5 ${def.faces.length === 6 ? "grid-cols-6" : "grid-cols-3"}`}>
        {def.faces.map((face) => (
          <FaceHeader key={face} face={face} cube={cube} />
        ))}
        {AMOUNTS.map(({ amount, glyph, label }) =>
          def.faces.map((face) => {
            const m: Move = { face, amount };
            const isNext = next?.face === face && next.amount === amount;
            const rotation = face === face.toLowerCase();
            return (
              <button
                key={moveToString(m)}
                disabled={busy}
                onClick={() => userMove(m)}
                title={describeMove(m, cube)}
                aria-label={`${moveToString(m)}: ${describeMove(m, cube)}`}
                className={
                  "flex min-h-12 flex-col items-center justify-center rounded-xl font-mono leading-tight transition-colors active:scale-95 disabled:opacity-40 lg:min-h-11 " +
                  (isNext
                    ? "bg-rose-500 text-white ring-2 ring-rose-300 dark:ring-rose-700"
                    : rotation
                      ? "bg-violet-100 text-violet-900 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-100 dark:hover:bg-violet-900"
                      : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700")
                }
              >
                <span className="text-sm font-semibold">{moveToString(m)}</span>
                <span className={`text-[10px] ${isNext ? "text-white/80" : muted}`} aria-hidden>
                  {glyph} {label}
                </span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function FaceHeader({ face, cube }: { face: MoveFace; cube: CubeState }) {
  const palette = useCubeStore((s) => s.palette);
  const isOuter = "RLUDFB".includes(face);
  return (
    <div className="flex flex-col items-center gap-0.5 pb-0.5 text-center">
      <span className="flex items-center gap-1 font-mono text-sm font-semibold">
        {isOuter && (
          <span
            className="h-3 w-3 rounded-sm border border-black/20 dark:border-white/20"
            style={{ background: palette[centerColor(cube, face as FaceName)] }}
            aria-hidden
          />
        )}
        {face}
      </span>
      <span className={`text-[10px] leading-tight ${muted}`}>{FACE_KO[face]}</span>
    </div>
  );
}

function KeyboardHelp() {
  const keys: [string, string][] = [
    ["R L U D F B", "면 시계 방향"],
    ["Shift + 키", "반시계 방향"],
    ["M E S · X Y Z", "가운데 층 · 큐브 회전"],
    ["H", "힌트 한 수"],
    ["Ctrl + Z", "되돌리기"],
  ];
  return (
    <div className={`${card} hidden p-3 lg:block`}>
      <div className="text-sm font-semibold">키보드 단축키</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {keys.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <kbd className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono dark:border-zinc-700 dark:bg-zinc-800">
                {k}
              </kbd>
            </dt>
            <dd className={muted}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
