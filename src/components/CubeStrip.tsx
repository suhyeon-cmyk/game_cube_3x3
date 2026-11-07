"use client";

import { localizeColorWords } from "@/lib/cube/state";
import { moveToString } from "@/lib/cube/moves";
import { isSolved } from "@/lib/cube/state";
import { describeMove } from "@/lib/solver/hint";
import { stageInfo } from "@/lib/solver/stages";
import { btn, card, muted } from "@/lib/ui/classes";
import { canUndo, isBusy, planNextMove, useCubeStore } from "@/store/cubeStore";
import { LightbulbIcon, PauseIcon, PlayIcon, StepIcon, StopIcon, UndoIcon } from "./icons";
import { MoveSequence } from "./MoveSequence";

/** 큐브 바로 아래 띠: 자동 풀이 재생 컨트롤 또는 직접 풀기 안내 */
export function CubeStrip() {
  const mode = useCubeStore((s) => s.mode);
  return mode === "auto" ? <PlaybackStrip /> : <HintStrip />;
}

function PlaybackStrip() {
  const program = useCubeStore((s) => s.program);
  const busy = useCubeStore(isBusy);
  const current = useCubeStore((s) => s.current);
  const paused = useCubeStore((s) => s.paused);
  const scrambling = current?.source === "scramble";
  const { pause, resume, stepOnce, stop } = useCubeStore.getState();

  if (scrambling) {
    return <div className={`${card} px-4 py-3 text-sm ${muted}`}>섞는 중…</div>;
  }
  const step = program?.steps[program.stepIndex];
  if (!program || !step) {
    return (
      <div className={`${card} px-4 py-3 text-sm ${muted}`}>
        <b className="font-semibold text-zinc-800 dark:text-zinc-100">섞기</b>를 누른 뒤, 아래에서 단계별로 풀거나{" "}
        <b className="font-semibold text-zinc-800 dark:text-zinc-100">전체 풀기</b>를 눌러 보세요.
      </div>
    );
  }
  const running = busy && current?.source === "solve";
  const active = running || (busy && paused) ? program.moveIndex : step.moves.length;
  return (
    <div className={`${card} flex flex-col gap-2 p-3`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-rose-600 dark:text-rose-400">
          {step.stage}단계 · {localizeColorWords(stageInfo(step.stage).title)}
        </span>
        <span className={muted}>
          {program.stepIndex + 1} / {program.steps.length}
        </span>
      </div>
      <p className="line-clamp-2 text-sm max-lg:line-clamp-1">{step.description}</p>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MoveSequence moves={step.moves} active={active} nowrap />
        </div>
        {busy && (
          <div className="flex shrink-0 gap-1.5">
            {paused ? (
              <button className={btn.icon} onClick={resume} aria-label="재생" title="재생 (Space)">
                <PlayIcon />
              </button>
            ) : (
              <button className={btn.icon} onClick={pause} aria-label="일시정지" title="일시정지 (Space)">
                <PauseIcon />
              </button>
            )}
            <button className={btn.icon} onClick={stepOnce} aria-label="한 수씩" title="한 수만 진행 (→)">
              <StepIcon />
            </button>
            <button className={btn.icon} onClick={stop} aria-label="정지" title="지금 공식까지만 하고 정지 (Esc)">
              <StopIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HintStrip() {
  const cube = useCubeStore((s) => s.cube);
  const plan = useCubeStore((s) => s.plan);
  const busy = useCubeStore(isBusy);
  const undoable = useCubeStore(canUndo);
  const { hintMove, undo } = useCubeStore.getState();
  const next = planNextMove(plan);
  const step = plan?.steps[0];

  const undoBtn = (
    <button className={btn.secondary + " px-3"} disabled={busy || !undoable} onClick={undo} title="되돌리기 (Ctrl+Z)">
      <UndoIcon />
      <span className="hidden sm:inline">되돌리기</span>
    </button>
  );

  if (isSolved(cube) || !step || !next) {
    return (
      <div className={`${card} flex items-center justify-between gap-2 p-3`}>
        <p className="text-sm">
          {isSolved(cube) ? "🎉 완성된 큐브예요. 섞기를 눌러 연습을 시작해 보세요." : "안내를 계산하는 중…"}
        </p>
        {undoBtn}
      </div>
    );
  }
  const isUndo = step.kind === "undo";
  return (
    <div className={`${card} flex flex-col gap-2 border-2 p-3 ${isUndo ? "border-amber-400 dark:border-amber-500/70" : "border-rose-300 dark:border-rose-500/50"}`}>
      <div className="flex min-w-0 items-baseline gap-2 text-xs">
        <span className={"shrink-0 whitespace-nowrap font-semibold " + (isUndo ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
          {isUndo ? "되돌리기 필요" : `다음에 할 일 · ${step.stage}단계`}
        </span>
        <span className={`min-w-0 truncate ${muted}`}>{step.description}</span>
      </div>
      <p className="text-[15px] font-semibold leading-snug">
        {"xyz".includes(next.face) ? "🔄 큐브를 돌려 잡는 중이에요… (자동)" : describeMove(next, cube)}
      </p>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MoveSequence moves={step.moves} active={plan.moveIndex} nowrap />
        </div>
        <div className="flex shrink-0 gap-1.5">
          {undoBtn}
          <button className={btn.accent + " px-3"} disabled={busy} onClick={hintMove} title="안내한 수를 대신 돌리기 (H)">
            <LightbulbIcon />
            {moveToString(next)}
          </button>
        </div>
      </div>
    </div>
  );
}
