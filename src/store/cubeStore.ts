"use client";

import { create } from "zustand";
import { Move, formatMoves, inverseMove, invertMoves } from "@/lib/cube/moves";
import { Color, CubeState, SOLVED, applyMove, isSolved, localizeColorWords, randomScramble, setColorNames } from "@/lib/cube/state";
import { COLOR_HEX } from "@/lib/ui/colors";
import { BodyColor, isStandardPalette, namesFor } from "@/lib/ui/palettes";
import { describeMove } from "@/lib/solver/hint";
import { SolveStep, planCurrentStage, solveAll, solveUpTo } from "@/lib/solver/solve";
import { StageId, currentStage, stageInfo } from "@/lib/solver/stages";

export type Mode = "auto" | "manual";
/** auto = 직접 풀기에서 앱이 대신 해 주는 "큐브 돌려 잡기"(x/y/z) */
export type MoveSource = "scramble" | "solve" | "user" | "hint" | "undo" | "auto";

export interface QueuedMove {
  id: number;
  move: Move;
  source: MoveSource;
  /** 풀이 프로그램 안에서의 위치 (강조 표시용) */
  stepIndex?: number;
  moveIndex?: number;
}

/** 되돌리기 기록. auto = 앱이 대신 한 큐브 돌려 잡기 */
export interface HistoryEntry {
  move: Move;
  auto: boolean;
}

export const canUndo = (s: { history: HistoryEntry[] }) => s.history.some((h) => !h.auto);

export interface Program {
  steps: SolveStep[];
  /** 지금 실행 중(또는 마지막으로 실행한) 수의 위치 */
  stepIndex: number;
  moveIndex: number;
}

export interface Plan {
  steps: SolveStep[];
  /** steps[0] 안에서 다음에 둘 수의 위치 */
  moveIndex: number;
}

interface CubeStore {
  cube: CubeState;
  mode: Mode;
  queue: QueuedMove[];
  current: QueuedMove | null;
  paused: boolean;
  /** 90° 한 수에 걸리는 시간(초) */
  speed: number;
  scrambleText: string;
  program: Program | null;
  plan: Plan | null;
  message: string | null;
  messageId: number;
  lastStage: StageId | null;
  /** 직접 풀기에서 사용자가 둔 수 (되돌리기용) */
  history: HistoryEntry[];
  showLabels: boolean;
  /** 값이 바뀌면 3D 시점을 처음으로 되돌린다 */
  viewResetToken: number;
  /** 직접 풀기에서 스티커를 누르고 있는 동안: 누른 스티커와, 지금 손을 떼면 둘 수 */
  dragPreview: { slot: number; move: Move | null } | null;
  /** 앱 내부 색(면의 역할) → 화면에 그릴 실제 색 */
  palette: Record<Color, string>;
  /** 실제 큐브 색이 표준과 다른지 */
  customPalette: boolean;
  /** 고른 테마: "standard" | 테마 id | "custom"(직접 고름) | "scan"(스캔한 색) */
  paletteId: string;
  bodyColor: BodyColor;
  /** 마지막으로 스캔한 큐브의 색 (테마 목록에서 다시 고를 수 있게) */
  scannedPalette: { colors: Record<Color, string>; names: Record<Color, string> } | null;

  setMode: (mode: Mode) => void;
  setSpeed: (s: number) => void;
  reset: () => void;
  /** 카메라로 스캔한 큐브 등 외부 상태를 불러온다. palette/names 를 주면 실제 큐브 색으로 그린다 */
  loadCube: (cube: CubeState, opts?: { label?: string; palette?: Record<Color, string>; names?: Record<Color, string> }) => void;
  /** 표준 색(흰·노·초·파·빨·주)으로 되돌리기 */
  resetPalette: () => void;
  /** 큐브 색 바꾸기. names 를 안 주면 색에서 이름을 추정한다 */
  setPalette: (colors: Record<Color, string>, id: string, names?: Record<Color, string>) => void;
  setBodyColor: (body: BodyColor) => void;
  /** 이 브라우저에 저장해 둔 색 설정 불러오기 */
  loadSavedPalette: () => void;
  scramble: () => void;
  solveStage: (stage: StageId) => void;
  solveAll: () => void;
  pause: () => void;
  resume: () => void;
  stepOnce: () => void;
  stop: () => void;
  userMove: (m: Move) => void;
  hintMove: () => void;
  undo: () => void;
  toggleLabels: () => void;
  resetView: () => void;
  clearMessage: () => void;
  setDragPreview: (p: { slot: number; move: Move | null } | null) => void;
  finishCurrent: (id: number) => void;
}

let nextId = 1;

const PALETTE_KEY = "cube-colors";
interface SavedPalette {
  id?: string;
  colors?: Record<Color, string>;
  body?: BodyColor;
  scanned?: { colors: Record<Color, string>; names: Record<Color, string> } | null;
}
function savePalette(s: Pick<CubeStore, "palette" | "paletteId" | "bodyColor" | "scannedPalette">) {
  try {
    const data: SavedPalette = { id: s.paletteId, colors: s.palette, body: s.bodyColor, scanned: s.scannedPalette };
    localStorage.setItem(PALETTE_KEY, JSON.stringify(data));
  } catch {
    // 저장이 막혀 있어도 이번 화면에는 적용된다
  }
}
const SCRAMBLE_SPEED = 0.15;

export const isBusy = (s: Pick<CubeStore, "queue" | "current">) => s.current !== null || s.queue.length > 0;

/** 이 수의 애니메이션 시간(초) */
export function moveDuration(q: QueuedMove, speed: number): number {
  const base =
    q.source === "scramble"
      ? SCRAMBLE_SPEED
      : q.source === "user" || q.source === "undo"
        ? Math.min(speed, 0.25)
        : speed;
  return q.move.amount === 2 ? base * 1.5 : base;
}

function programQueue(steps: SolveStep[]): QueuedMove[] {
  return steps.flatMap((step, stepIndex) =>
    step.moves.map((move, moveIndex) => ({ id: nextId++, move, source: "solve" as const, stepIndex, moveIndex })),
  );
}

const sameMove = (a: Move, b: Move) => a.face === b.face && a.amount === b.amount;

export function planNextMove(plan: Plan | null): Move | null {
  if (!plan || plan.steps.length === 0) return null;
  return plan.steps[0].moves[plan.moveIndex] ?? null;
}

function makePlan(cube: CubeState): Plan | null {
  if (isSolved(cube)) return null;
  return { steps: planCurrentStage(cube), moveIndex: 0 };
}

/** 사용자가 한 수를 둔 뒤 안내 수순을 갱신한다 */
function updatePlan(plan: Plan | null, move: Move, before: CubeState, after: CubeState): Plan | null {
  if (isSolved(after)) return null;
  const expected = planNextMove(plan);
  if (plan && expected && sameMove(expected, move)) {
    let { steps, moveIndex } = plan;
    moveIndex++;
    if (moveIndex >= steps[0].moves.length) {
      steps = steps.slice(1);
      moveIndex = 0;
    }
    return steps.length > 0 ? { steps, moveIndex } : makePlan(after);
  }
  // 안내가 X2(180°)인데 X 또는 X' 로 한 번만 돌린 경우: 절반 진행으로 보고 "같은 방향으로 한 번 더"를 안내한다.
  // (드래그 한 번은 90° 라서 X2 는 두 번 밀어야 한다. 새로 계산하면 방금 돌린 걸 되돌리라는
  //  안내가 나와 X2 → X → X' → X2 … 반복에 빠진다)
  if (plan && expected && expected.amount === 2 && move.face === expected.face && move.amount !== 2) {
    const steps = plan.steps.slice();
    const first = { ...steps[0], moves: steps[0].moves.slice() };
    first.moves[plan.moveIndex] = { face: move.face, amount: move.amount };
    first.description = "절반(90°) 돌렸어요! 같은 방향으로 한 번 더 돌리세요.";
    steps[0] = first;
    return { steps, moveIndex: plan.moveIndex };
  }
  // 안내와 다른 수: 진행 상황이 유지되면 새로 계산, 깨졌으면 되돌리기 안내
  const planStage = plan?.steps[0]?.stage ?? currentStage(before);
  const nowStage = currentStage(after);
  if (!plan || nowStage === null || planStage === null || nowStage >= planStage) return makePlan(after);
  const undo: SolveStep = {
    stage: plan.steps[0].stage,
    kind: "undo",
    label: formatMoves([inverseMove(move)]),
    description: "안내와 다르게 돌렸어요. 방금 돌린 면을 반대로 돌려 되돌리세요.",
    moves: [inverseMove(move)],
    targets: plan.steps[0].targets,
  };
  const rest = plan.steps.slice();
  if (plan.moveIndex > 0) rest[0] = { ...rest[0], moves: rest[0].moves.slice(plan.moveIndex) };
  return { steps: [undo, ...rest], moveIndex: 0 };
}

export const useCubeStore = create<CubeStore>((set, get) => {
  /** 대기 중인 다음 수를 시작한다 */
  const startNext = (force = false) => {
    const s = get();
    if (s.current || s.queue.length === 0) return;
    if (s.paused && !force) return;
    const [next, ...rest] = s.queue;
    set({
      current: next,
      queue: rest,
      program:
        s.program && next.stepIndex !== undefined
          ? { ...s.program, stepIndex: next.stepIndex, moveIndex: next.moveIndex ?? 0 }
          : s.program,
    });

// ---------------------------------------------------------------------------
// 직접 풀기: 다음 안내가 "큐브 돌려 잡기"(x/y/z)면 앱이 대신 돌려 준다.
// 큐브 전체 회전은 잡는 방향만 바꿀 뿐 퍼즐 상태는 그대로라서, 터치로 하게 하면
// (빈 곳 드래그 = 시점 이동이라 인정되지 않음) 사용자가 가운데 층을 돌리는 등 헤매게 된다.
// 되돌리기 기록에는 넣지 않는다 (되돌리면 다시 자동 회전되는 반복을 막기 위해).

const AUTO_ROTATE_DELAY_MS = 450;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoRotate(s: CubeStore) {
  const next = s.mode === "manual" && !isBusy(s) && !s.dragPreview ? planNextMove(s.plan) : null;
  const isRotation = next !== null && (next.face === "x" || next.face === "y" || next.face === "z");
  if (!isRotation) {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
    return;
  }
  if (autoTimer) return;
  const planAtSchedule = s.plan;
  autoTimer = setTimeout(() => {
    autoTimer = null;
    const now = useCubeStore.getState();
    if (now.plan !== planAtSchedule || now.mode !== "manual" || isBusy(now)) return;
    const m = planNextMove(now.plan);
    if (!m || !(m.face === "x" || m.face === "y" || m.face === "z")) return;
    useCubeStore.setState((st) => ({
      queue: [...st.queue, { id: nextId++, move: m, source: "auto" }],
      message: "🔄 " + describeMove(m, st.cube).replace("잡으세요", "잡을게요") + " 큐브 모양은 그대로예요.",
      messageId: st.messageId + 1,
    }));
    // 대기열에 넣은 수 시작
    const st = useCubeStore.getState();
    if (!st.current && st.queue.length > 0) {
      const [first, ...rest] = st.queue;
      useCubeStore.setState({ current: first, queue: rest });
    }
  }, AUTO_ROTATE_DELAY_MS);
}

if (typeof window !== "undefined") {
  useCubeStore.subscribe((s) => scheduleAutoRotate(s));
}
  };

  const enqueue = (moves: QueuedMove[], patch: Partial<CubeStore> = {}) => {
    if ("message" in patch) patch = { ...patch, messageId: get().messageId + 1 };
    set((s) => ({ ...patch, queue: [...s.queue, ...moves] }));
    startNext();
  };

  return {
    cube: SOLVED,
    mode: "auto",
    queue: [],
    current: null,
    paused: false,
    speed: 0.6,
    scrambleText: "",
    program: null,
    plan: null,
    message: null,
    messageId: 0,
    lastStage: null,
    history: [],
    showLabels: false,
    viewResetToken: 0,
    dragPreview: null,
    palette: { ...COLOR_HEX },
    customPalette: false,
    paletteId: "standard",
    bodyColor: "black",
    scannedPalette: null,

    setMode: (mode) => {
      if (isBusy(get())) return;
      set({ mode, message: null, program: null, history: [], plan: mode === "manual" ? makePlan(get().cube) : null });
    },
    setSpeed: (speed) => set({ speed }),

    reset: () => {
      set({
        cube: SOLVED,
        queue: [],
        current: null,
        paused: false,
        scrambleText: "",
        program: null,
        plan: null,
        message: null,
        lastStage: null,
        history: [],
      });
    },

    loadCube: (cube, opts = {}) => {
      const label = opts.label ?? "스캔한 큐브";
      // 스캔한 색이 표준과 다르면 그 색으로, 아니면 지금 고른 테마를 그대로 쓴다
      if (opts.palette && opts.names) {
        set({ scannedPalette: { colors: { ...opts.palette }, names: { ...opts.names } } });
        get().setPalette(opts.palette, "scan", opts.names);
      }
      set((s) => ({
        cube,
        queue: [],
        current: null,
        paused: false,
        scrambleText: label,
        program: null,
        history: [],
        plan: s.mode === "manual" ? makePlan(cube) : null,
        message: localizeColorWords(`${label}를 불러왔어요. 실물과 같은 방향으로 잡아 주세요 (노란색 센터 위, 초록색 센터 앞).`),
        messageId: s.messageId + 1,
      }));
    },

    scramble: () => {
      if (isBusy(get())) return;
      const moves = randomScramble();
      enqueue(
        moves.map((move) => ({ id: nextId++, move, source: "scramble" })),
        { scrambleText: formatMoves(moves), program: null, message: null, paused: false, history: [] },
      );
    },

    solveStage: (stage) => {
      if (isBusy(get())) return;
      const steps = solveUpTo(get().cube, stage);
      if (steps.length === 0) {
        set((s) => ({ message: `${stage}단계는 이미 완료되어 있어요.`, messageId: s.messageId + 1 }));
        return;
      }
      enqueue(programQueue(steps), { program: { steps, stepIndex: 0, moveIndex: 0 }, message: null, paused: false });
    },

    solveAll: () => {
      if (isBusy(get())) return;
      const steps = solveAll(get().cube);
      if (steps.length === 0) {
        set((s) => ({ message: "이미 완성된 큐브예요.", messageId: s.messageId + 1 }));
        return;
      }
      enqueue(programQueue(steps), { program: { steps, stepIndex: 0, moveIndex: 0 }, message: null, paused: false });
    },

    pause: () => set({ paused: true }),
    resume: () => {
      set({ paused: false });
      startNext();
    },
    stepOnce: () => {
      if (!get().paused) set({ paused: true });
      startNext(true);
    },
    // 공식 중간에 멈추면 앞 단계가 흐트러지므로, 지금 실행 중인 묶음(공식)까지는 끝낸다
    stop: () => {
      const { current, queue } = get();
      const keep = current?.stepIndex !== undefined ? queue.filter((q) => q.stepIndex === current.stepIndex) : [];
      set({ queue: keep, paused: false });
      startNext();
    },

    userMove: (move) => {
      if (isBusy(get())) return;
      enqueue([{ id: nextId++, move, source: "user" }], { message: null });
    },

    hintMove: () => {
      const s = get();
      if (isBusy(s)) return;
      const move = planNextMove(s.plan);
      if (move) enqueue([{ id: nextId++, move, source: "hint" }], { message: null });
    },

    undo: () => {
      const s = get();
      if (isBusy(s) || !canUndo(s)) return;
      // 마지막 사용자 수까지 되돌린다. 그 뒤에 앱이 자동으로 한 돌려 잡기도 함께 되돌려야
      // 같은 방향으로 잡은 상태에서 정확히 반대로 돌릴 수 있다.
      let i = s.history.length - 1;
      while (i >= 0 && s.history[i].auto) i--;
      const undone = s.history.slice(i).map((h) => h.move);
      enqueue(
        invertMoves(undone).map((move) => ({ id: nextId++, move, source: "undo" as const })),
        { message: null, history: s.history.slice(0, i) },
      );
    },
    resetPalette: () => get().setPalette({ ...COLOR_HEX }, "standard"),

    setPalette: (colors, id, names) => {
      const standard = isStandardPalette(colors);
      setColorNames(standard ? null : (names ?? namesFor(colors)));
      set((s) => ({
        palette: { ...colors },
        customPalette: !standard,
        paletteId: standard ? "standard" : id,
        // 안내 문구에 색 이름이 들어 있으므로 다시 만든다
        plan: s.mode === "manual" && !isBusy(s) ? makePlan(s.cube) : s.plan,
      }));
      savePalette(get());
    },
    setBodyColor: (bodyColor) => {
      set({ bodyColor });
      savePalette(get());
    },
    loadSavedPalette: () => {
      try {
        const raw = localStorage.getItem(PALETTE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as SavedPalette;
        if (saved.scanned) set({ scannedPalette: saved.scanned });
        if (saved.body) set({ bodyColor: saved.body });
        if (saved.colors) get().setPalette(saved.colors, saved.id ?? "custom", saved.id === "scan" ? saved.scanned?.names : undefined);
      } catch {
        // 저장소를 못 쓰면 기본 색
      }
    },
    toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
    resetView: () => set((s) => ({ viewResetToken: s.viewResetToken + 1 })),
    clearMessage: () => set({ message: null }),
    setDragPreview: (dragPreview) => {
      const cur = get().dragPreview;
      const same =
        cur === dragPreview ||
        (cur &&
          dragPreview &&
          cur.slot === dragPreview.slot &&
          cur.move?.face === dragPreview.move?.face &&
          cur.move?.amount === dragPreview.move?.amount);
      if (!same) set({ dragPreview });
    },

    finishCurrent: (id) => {
      const s = get();
      if (!s.current || s.current.id !== id) return;
      const { move, source } = s.current;
      const before = s.cube;
      const cube = applyMove(before, move);
      const patch: Partial<CubeStore> = { cube, current: null };

      if (source === "user" || source === "hint" || source === "auto")
        patch.history = [...s.history, { move, auto: source === "auto" }].slice(-200);
      if (source === "user" || source === "hint" || source === "undo" || source === "auto") {
        const prevStage = currentStage(before);
        const nowStage = currentStage(cube);
        patch.plan = updatePlan(s.plan, move, before, cube);
        if (nowStage === null) patch.message = "🎉 큐브를 완성했어요!";
        else if (prevStage !== null && nowStage > prevStage)
          patch.message = `${prevStage}단계 「${localizeColorWords(stageInfo(prevStage).title)}」 완료! 다음은 ${nowStage}단계예요.`;
      }
      if (s.queue.length === 0) {
        if (source === "solve") {
          const st = currentStage(cube);
          patch.message =
            st === null ? "🎉 큐브를 완성했어요!" : st > 1 ? `${st - 1}단계까지 완료했어요.` : "풀이를 멈췄어요.";
        }
        if (source === "scramble" && s.mode === "manual") patch.plan = makePlan(cube);
        patch.paused = false;
      }
      if (patch.message) patch.messageId = s.messageId + 1;
      set(patch);
      startNext();
    },
  };
});

// 개발 모드에서만: 브라우저 자동 테스트가 큐브 상태를 확인할 수 있게
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __cubeStore?: typeof useCubeStore }).__cubeStore = useCubeStore;
}
