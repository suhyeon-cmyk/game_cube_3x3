import { FACE_MOVES, Move, parseMoves, repeatMoves, sequencePerm, formatMoves } from "../cube/moves";
import { COLOR_NAMES_KO, Color, CubeState, applyMoves, centerColor, isSolved } from "../cube/state";
import { SearchMacro, bfs } from "./search";
import {
  ALGS,
  Algorithm,
  Constraint,
  PIECES,
  StageId,
  constraintMet,
  currentStage,
  isWhiteDown,
  stageAllConstraints,
  stageOwnConstraints,
  trackedSlot,
} from "./stages";

export type StepKind = "orient" | "rotate" | "setup" | "alg" | "free" | "undo";

export interface SolveStep {
  stage: StageId;
  kind: StepKind;
  /** 짧은 제목 (예: "R U R' U' × 3") */
  label: string;
  /** 사람이 읽는 설명 */
  description: string;
  moves: Move[];
  algId?: string;
  repeat?: number;
  /** 강조할 조각 (색 조합) */
  targets: Color[][];
}

// ---------------------------------------------------------------------------
// 매크로

type MacroData =
  | { kind: "move"; moves: Move[] }
  | { kind: "alg"; alg: Algorithm; side: number; repeat: number };

const Y_TURNS: Move[][] = [[], parseMoves("y"), parseMoves("y2"), parseMoves("y'")];

function algMacro(alg: Algorithm, side: number, repeat: number): SearchMacro<MacroData> {
  const moves = repeatMoves(alg.moves, repeat);
  const back = Y_TURNS[(4 - side) % 4];
  return {
    perm: sequencePerm([...Y_TURNS[side], ...moves, ...back]),
    family: `${alg.id}:${side}`,
    data: { kind: "alg", alg, side, repeat },
  };
}

function moveMacro(text: string, family: string): SearchMacro<MacroData> {
  const moves = parseMoves(text);
  return { perm: sequencePerm(moves), family, data: { kind: "move", moves } };
}

const U_MACROS = ["U", "U'", "U2"].map((t) => moveMacro(t, "U"));

const FACE_MACROS = FACE_MOVES.flatMap((f) =>
  [`${f}`, `${f}'`, `${f}2`].map((t) => moveMacro(t, f)),
);

const sides = (alg: Algorithm, repeats: number[], sideList = [0, 1, 2, 3]) =>
  sideList.flatMap((side) => repeats.map((r) => algMacro(alg, side, r)));

const STAGE_MACROS: Record<Exclude<StageId, 1>, SearchMacro<MacroData>[]> = {
  2: [...U_MACROS, ...sides(ALGS.sexy, [1, 2, 3, 4, 5])],
  3: [...U_MACROS, ...sides(ALGS.rightInsert, [1]), ...sides(ALGS.leftInsert, [1])],
  4: [...U_MACROS, ...sides(ALGS.cross, [1], [0])],
  5: [...U_MACROS, ...sides(ALGS.sune, [1, 2], [0])],
  6: [...U_MACROS, ...sides(ALGS.cornerCycle, [1, 2])],
  7: [...U_MACROS, ...sides(ALGS.edgeCw, [1]), ...sides(ALGS.edgeCcw, [1])],
};

const STAGE_DEPTH: Record<StageId, number> = { 1: 8, 2: 4, 3: 5, 4: 6, 5: 8, 6: 4, 7: 4 };

// ---------------------------------------------------------------------------
// 탐색 헬퍼

function searchConstraints(
  state: CubeState,
  constraints: Constraint[],
  macros: readonly SearchMacro<MacroData>[],
  maxDepth: number,
): MacroData[] | null {
  const start = constraints.map((c) => trackedSlot(state, c.colors, c.track));
  const oks = constraints.map((c) => c.ok);
  return bfs(
    start,
    macros,
    (slots) => {
      for (let i = 0; i < slots.length; i++) if (oks[i][slots[i]] !== 1) return false;
      return true;
    },
    { maxDepth },
  );
}

const moveCount = (path: MacroData[]) =>
  path.reduce((n, d) => n + (d.kind === "move" ? d.moves.length : d.alg.moves.length * d.repeat), 0);

const pieceName = (colors: Color[]) => colors.map((c) => COLOR_NAMES_KO[c].replace("색", "")).join("·");

/** 매크로 경로를 실제 수순(큐브 회전 y 포함)으로 바꾼다 */
function pathToSteps(state: CubeState, stage: StageId, path: MacroData[], targets: Color[][]): SolveStep[] {
  const steps: SolveStep[] = [];
  let frame = 0;
  let s = state;
  const push = (step: Omit<SolveStep, "stage" | "targets">) => {
    steps.push({ ...step, stage, targets });
    s = applyMoves(s, step.moves);
  };
  for (const d of path) {
    if (d.kind === "move") {
      if (stage === 1) {
        push({ kind: "free", label: formatMoves(d.moves), description: "", moves: d.moves });
      } else {
        push({
          kind: "setup",
          label: formatMoves(d.moves),
          description: "윗면(U)을 돌려 조각을 공식을 쓸 위치로 옮깁니다.",
          moves: d.moves,
        });
      }
      continue;
    }
    const turn = (d.side - frame + 4) % 4;
    if (turn !== 0) {
      const moves = Y_TURNS[turn];
      const nextFront = centerColor(s, turn === 1 ? "R" : turn === 2 ? "B" : "L");
      push({
        kind: "rotate",
        label: formatMoves(moves),
        description: `큐브 전체를 돌려 ${COLOR_NAMES_KO[nextFront]} 면이 앞으로 오게 잡습니다.`,
        moves,
      });
      frame = d.side;
    }
    const moves = repeatMoves(d.alg.moves, d.repeat);
    push({
      kind: "alg",
      label: d.alg.text + (d.repeat > 1 ? ` × ${d.repeat}` : ""),
      description: `${d.alg.name} 공식${d.repeat > 1 ? `을 ${d.repeat}번 반복합니다` : "을 실행합니다"}.`,
      moves,
      algId: d.alg.id,
      repeat: d.repeat,
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 단계별 풀이

/** 흰색이 아래로 오도록 큐브를 다시 잡는 수 */
function orientMoves(state: CubeState): Move[] {
  for (const t of ["", "x", "x'", "x2", "z", "z'"]) {
    const m = parseMoves(t);
    if (isWhiteDown(applyMoves(state, m))) return m;
  }
  throw new Error("orientation not found");
}

/** 조각을 하나씩 맞추는 단계 (1, 2, 3) */
function solveIncremental(state: CubeState, stage: 1 | 2 | 3): SolveStep[] {
  const steps: SolveStep[] = [];
  let s = state;
  const macros = stage === 1 ? FACE_MACROS : STAGE_MACROS[stage];
  for (let guard = 0; guard < 8; guard++) {
    const preserve = stage === 1 ? [] : stageAllConstraints(s, (stage - 1) as StageId);
    const own = stageOwnConstraints(s, stage);
    const solved = own.filter((c) => constraintMet(s, c));
    const todo = own.filter((c) => !constraintMet(s, c));
    if (todo.length === 0) return steps;

    let best: { path: MacroData[]; target: Constraint } | null = null;
    for (const target of todo) {
      const path = searchConstraints(s, [...preserve, ...solved, target], macros, STAGE_DEPTH[stage]);
      if (!path) continue;
      if (
        !best ||
        path.length < best.path.length ||
        (path.length === best.path.length && moveCount(path) < moveCount(best.path))
      ) {
        best = { path, target };
      }
    }
    if (!best) throw new Error(`stage ${stage}: no solution found`);

    const name = pieceName(best.target.colors);
    const kindName = best.target.colors.length === 3 ? "코너를" : "엣지를";
    const part = pathToSteps(s, stage, best.path, [best.target.colors]);
    if (stage === 1) {
      // 1단계는 한 조각의 수순을 한 묶음으로 보여준다
      const moves = part.flatMap((p) => p.moves);
      steps.push({
        stage,
        kind: "free",
        label: formatMoves(moves),
        description: `${name} ${kindName} 제자리로 옮깁니다.`,
        moves,
        targets: [best.target.colors],
      });
    } else {
      for (const p of part) p.description = `[${name} ${kindName.slice(0, 2)}] ${p.description}`;
      steps.push(...part);
    }
    s = applyMoves(s, part.flatMap((p) => p.moves));
  }
  throw new Error(`stage ${stage}: too many iterations`);
}

const LAST_LAYER_TARGETS: Record<4 | 5 | 6 | 7, Color[][]> = {
  4: PIECES.yellowEdges,
  5: PIECES.yellowCorners,
  6: PIECES.yellowCorners,
  7: PIECES.yellowEdges,
};

/** 마지막 층 단계 (4~7): 단계 전체를 한 번에 탐색 */
function solveLastLayer(state: CubeState, stage: 4 | 5 | 6 | 7): SolveStep[] {
  const constraints = stageAllConstraints(state, stage);
  const path = searchConstraints(state, constraints, STAGE_MACROS[stage], STAGE_DEPTH[stage]);
  if (!path) throw new Error(`stage ${stage}: no solution found`);
  return pathToSteps(state, stage, path, LAST_LAYER_TARGETS[stage]);
}

function solveOneStage(state: CubeState, stage: StageId): SolveStep[] {
  if (stage <= 3) return solveIncremental(state, stage as 1 | 2 | 3);
  return solveLastLayer(state, stage as 4 | 5 | 6 | 7);
}

/**
 * 현재 상태에서 목표 단계까지 푼다. 앞 단계가 안 끝났으면 앞 단계부터 이어서 푼다.
 */
export function solveUpTo(state: CubeState, target: StageId): SolveStep[] {
  const steps: SolveStep[] = [];
  let s = state;
  if (isSolved(s)) return steps;
  if (!isWhiteDown(s)) {
    const moves = orientMoves(s);
    steps.push({
      stage: 1,
      kind: "orient",
      label: formatMoves(moves),
      description: "흰색 센터가 아래로 오도록 큐브를 돌려 잡습니다.",
      moves,
      targets: [],
    });
    s = applyMoves(s, moves);
  }
  for (let st = currentStage(s); st !== null && st <= target; st = currentStage(s)) {
    const part = solveOneStage(s, st);
    steps.push(...part);
    s = applyMoves(s, part.flatMap((p) => p.moves));
  }
  return steps;
}

export function solveAll(state: CubeState): SolveStep[] {
  return solveUpTo(state, 7);
}

/** 현재 단계만 푸는 수순 (직접 풀기 힌트용) */
export function planCurrentStage(state: CubeState): SolveStep[] {
  const st = currentStage(state);
  if (st === null) return [];
  return solveUpTo(state, st);
}

