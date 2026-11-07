"use client";

import { localizeColorWords } from "@/lib/cube/state";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MoveFace, moveToString } from "@/lib/cube/moves";
import { btn, muted } from "@/lib/ui/classes";
import { isBusy, planNextMove, useCubeStore } from "@/store/cubeStore";
import { AutoPanel } from "./AutoPanel";
import { CubeStrip } from "./CubeStrip";
import { CameraIcon, LabelIcon, PaletteIcon, ShuffleIcon, ViewResetIcon } from "./icons";
import { ColorPanel } from "./ColorPanel";
import { ManualPanel } from "./ManualPanel";
import { ThemeToggle } from "./ThemeToggle";

const Cube3D = dynamic(() => import("./Cube3D"), {
  ssr: false,
  loading: () => <div className={`flex h-full items-center justify-center text-sm ${muted}`}>큐브 불러오는 중…</div>,
});

// 카메라 스캔 화면은 누를 때만 불러온다
const CubeScanner = dynamic(() => import("./CubeScanner").then((m) => m.CubeScanner), { ssr: false });

const KEY_FACES: Record<string, MoveFace> = {
  r: "R", l: "L", u: "U", d: "D", f: "F", b: "B", m: "M", e: "E", s: "S", x: "x", y: "y", z: "z",
};

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useCubeStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (s.mode === "manual") {
          e.preventDefault();
          s.undo();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (s.mode === "auto") {
        if (!isBusy(s)) return;
        if (e.key === " ") {
          e.preventDefault();
          if (s.paused) s.resume();
          else s.pause();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          s.stepOnce();
        } else if (e.key === "Escape") {
          s.stop();
        }
        return;
      }
      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        s.hintMove();
        return;
      }
      const face = KEY_FACES[e.key.toLowerCase()];
      if (face) {
        e.preventDefault();
        s.userMove({ face, amount: e.shiftKey ? -1 : 1 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Toast() {
  const message = useCubeStore((s) => s.message);
  const messageId = useCubeStore((s) => s.messageId);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => useCubeStore.getState().clearMessage(), 3500);
    return () => clearTimeout(t);
  }, [message, messageId]);
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-3 top-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-full bg-zinc-900/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg dark:bg-white/90 dark:text-zinc-900"
    >
      {message}
    </div>
  );
}

/** 스티커를 누르고 있는 동안: 손을 떼면 어떤 수가 되는지 */
function DragPreviewPill() {
  const preview = useCubeStore((s) => s.dragPreview);
  const plan = useCubeStore((s) => s.plan);
  if (!preview) return null;
  const next = planNextMove(plan);
  const m = preview.move;
  const matches = m && next && m.face === next.face && (m.amount === next.amount || next.amount === 2);
  return (
    <div
      role="status"
      className={
        "pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-full px-4 py-2 text-center text-sm font-semibold text-white shadow-lg " +
        (!m ? "bg-zinc-900/85 dark:bg-zinc-700/90" : matches ? "bg-emerald-600" : "bg-rose-500")
      }
    >
      {!m ? (
        "돌리고 싶은 방향으로 밀어 보세요"
      ) : (
        <>
          손을 떼면 <span className="font-mono">{moveToString(m)}</span> 회전
          {next && (matches ? " · 안내한 방향 ✓" : " · 안내와 달라요")}
        </>
      )}
    </div>
  );
}

function CanvasToolbar({ onColors }: { onColors: () => void }) {
  const showLabels = useCubeStore((s) => s.showLabels);
  const { toggleLabels, resetView } = useCubeStore.getState();
  const tool =
    "flex h-10 items-center gap-1 rounded-full bg-white/85 px-3 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur hover:bg-white dark:bg-zinc-800/85 dark:text-zinc-200 dark:hover:bg-zinc-800 lg:h-9";
  return (
    <div className="absolute bottom-3 right-3 flex gap-1.5">
      <button
        className={tool + (showLabels ? " !bg-rose-500 !text-white" : "")}
        onClick={toggleLabels}
        aria-pressed={showLabels}
        title="면 기호(U, F, R…) 표시"
      >
        <LabelIcon />
        기호
      </button>
      <button className={tool} onClick={onColors} title="큐브 색 바꾸기 (테마·직접 고르기)">
        <PaletteIcon />
        색상
      </button>
      <button className={tool} onClick={resetView} title="처음 시점으로">
        <ViewResetIcon />
        <span className="hidden sm:inline">시점</span>
      </button>
    </div>
  );
}

function CanvasHelp() {
  const mode = useCubeStore((s) => s.mode);
  return (
    <p className={`pointer-events-none absolute bottom-3 left-3 max-w-[55%] text-[11px] leading-4 ${muted}`}>
      {mode === "manual" ? (
        <>
          <span className="lg:hidden">스티커 밀기: 돌리기 · 빈 곳: 시점</span>
          <span className="hidden lg:inline">스티커 드래그: 층 돌리기 · 빈 곳 드래그: 시점 · 휠: 확대</span>
        </>
      ) : (
        <>
          <span className="lg:hidden">드래그: 시점 · 두 손가락: 확대</span>
          <span className="hidden lg:inline">드래그: 시점 회전 · 휠: 확대</span>
        </>
      )}
    </p>
  );
}

const tab = (active: boolean) =>
  "min-h-10 flex-1 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50 lg:min-h-9 " +
  (active
    ? "bg-white shadow-sm dark:bg-zinc-600"
    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100");

export function CubeGuide() {
  useKeyboard();
  const [colorsOpen, setColorsOpen] = useState(false);
  // 이 브라우저에 저장해 둔 큐브 색 (화면을 그린 뒤에 적용해 서버 렌더와 어긋나지 않게)
  useEffect(() => useCubeStore.getState().loadSavedPalette(), []);
  const mode = useCubeStore((s) => s.mode);
  const busy = useCubeStore(isBusy);
  const scrambleText = useCubeStore((s) => s.scrambleText);
  const { reset, scramble, setMode } = useCubeStore.getState();
  const [scanning, setScanning] = useState(false);
  const customPalette = useCubeStore((s) => s.customPalette);

  return (
    <div className="flex w-full flex-1 flex-col lg:grid lg:h-svh lg:max-h-svh lg:flex-none lg:grid-cols-[minmax(0,1fr)_460px] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      {/* 큐브 영역: 모바일에서는 화면 위에 고정, PC에서는 왼쪽 */}
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] lg:col-start-1 lg:row-start-1 lg:px-6 lg:pt-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold lg:text-2xl">3x3 큐브 가이드</h1>
            <p className={`hidden text-sm sm:block ${muted}`}>초보자 층별 풀이법 7단계 · {localizeColorWords("흰색은 아래, 노란색은 위")}</p>
          </div>
          <ThemeToggle />
        </header>
        <div className="sticky top-0 z-20 flex flex-col gap-2 bg-background px-3 pb-2 pt-1 shadow-[0_8px_12px_-12px_rgba(0,0,0,0.3)] lg:static lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:gap-3 lg:px-5 lg:pb-5 lg:shadow-none">
          <div className="relative h-[38svh] min-h-[240px] overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950 lg:h-auto lg:min-h-0 lg:flex-1">
            <Cube3D />
            <Toast />
            <DragPreviewPill />
            <CanvasHelp />
            <CanvasToolbar onColors={() => setColorsOpen(true)} />
          </div>
          <CubeStrip />
        </div>

      {/* 조작 패널 */}
      <main className="flex flex-col gap-3 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-zinc-200 lg:p-5 lg:dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button className={btn.secondary} onClick={reset} title="맞춰진 큐브로 되돌리기">
            초기화
          </button>
          <button className={btn.primary + " flex-1"} disabled={busy} onClick={scramble}>
            <ShuffleIcon />
            섞기
          </button>
          <button className={btn.secondary + " px-3"} disabled={busy} onClick={() => setScanning(true)} title="실물 큐브를 카메라로 스캔해서 불러오기">
            <CameraIcon />
            스캔
          </button>
        </div>
        {(scrambleText || customPalette) && (
          <div className="-mt-1 flex items-center gap-2">
            {scrambleText && (
              <p className={`min-w-0 flex-1 break-all font-mono text-xs leading-5 ${muted}`}>
                {scrambleText === "스캔한 큐브" ? "📷 카메라로 스캔한 큐브" : `섞기: ${scrambleText}`}
              </p>
            )}
            {customPalette && (
              <button
                className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
                onClick={() => useCubeStore.getState().resetPalette()}
                title="스캔한 실제 색 대신 표준 6색으로 보기"
              >
                기본 색으로
              </button>
            )}
          </div>
        )}
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist" aria-label="모드">
          <button role="tab" aria-selected={mode === "auto"} className={tab(mode === "auto")} disabled={busy} onClick={() => setMode("auto")}>
            자동 풀이
          </button>
          <button role="tab" aria-selected={mode === "manual"} className={tab(mode === "manual")} disabled={busy} onClick={() => setMode("manual")}>
            직접 풀기
          </button>
        </div>
        {mode === "auto" ? <AutoPanel /> : <ManualPanel />}
      </main>
      {scanning && <CubeScanner onClose={() => setScanning(false)} />}
      {colorsOpen && <ColorPanel onClose={() => setColorsOpen(false)} />}
    </div>
  );
}
