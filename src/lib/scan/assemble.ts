// 면 6개(각 9칸, 카메라에 보인 그대로의 순서)를 하나의 큐브 상태로 조립한다.
// 사용자가 면을 어느 방향으로 돌려서 보여줬는지 모르므로, 면마다 4가지 회전을 모두 시도해
// 실제로 존재할 수 있는 큐브가 되는 조합을 찾는다.

import { FACE_NAMES, FaceName } from "../cube/geometry";
import { Color, CubeState, SOLVED_FACE_COLORS, applyMoves, centerColor } from "../cube/state";
import { parseMoves } from "../cube/moves";
import { DEFAULT_REFS, Lab, labDistance } from "./color";
import { piecesValid, validateCube } from "../cube/validate";

/** 3x3 칸을 시계 방향으로 90° × k 회전 (행 우선 순서) */
export function rotateGrid<T>(cells: readonly T[], k: number): T[] {
  let g = cells.slice();
  for (let t = 0; t < ((k % 4) + 4) % 4; t++) {
    const r: T[] = new Array(9);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) r[row * 3 + col] = g[(2 - col) * 3 + row];
    g = r;
  }
  return g;
}

/** 센터 색 → 그 색이 있어야 할 면 */
export const FACE_OF_CENTER: Record<Color, FaceName> = Object.fromEntries(
  FACE_NAMES.map((f) => [SOLVED_FACE_COLORS[f], f]),
) as Record<Color, FaceName>;

export interface AssembleResult {
  /** 유효한 상태 (조각 + 패리티 모두 통과). 없으면 null */
  state: CubeState | null;
  /** 면별로 적용한 회전 (U R F D L B 순서) */
  rotations: number[];
  /** 유효한 서로 다른 상태가 여러 개였는지 */
  ambiguous: boolean;
}

/**
 * faces: 면 이름 → 카메라에 보인 순서의 9칸 색 (가운데 = index 4).
 * 회전 조합 4^6 = 4096 가지를 빠르게 확인한다.
 */
export function assembleFaces(
  faces: Record<FaceName, Color[]>,
  fixed: Partial<Record<FaceName, number>> = {},
  firstOnly = false,
): AssembleResult {
  const rotated = FACE_NAMES.map((f) => [0, 1, 2, 3].map((k) => rotateGrid(faces[f], k).join("")));
  const found = new Map<string, number[]>();
  const rot = [0, 0, 0, 0, 0, 0];
  const visit = (i: number) => {
    if (firstOnly && found.size > 0) return;
    if (i === 6) {
      const s = rot.map((k, f) => rotated[f][k]).join("");
      if (!found.has(s) && piecesValid(s) && validateCube(s).ok) found.set(s, rot.slice());
      return;
    }
    const fk = fixed[FACE_NAMES[i]];
    for (let k = 0; k < 4; k++) {
      if (fk !== undefined && k !== fk) continue;
      rot[i] = k;
      visit(i + 1);
    }
  };
  visit(0);
  const first = found.entries().next();
  if (first.done) return { state: null, rotations: [0, 0, 0, 0, 0, 0], ambiguous: false };
  return { state: first.value[0], rotations: first.value[1], ambiguous: found.size > 1 };
}

/** 회전 없이 그대로 이어 붙인 상태 (검증 실패 시 직접 고칠 수 있게 보여주는 용도) */
export function joinFaces(faces: Record<FaceName, Color[]>, rotations: number[] = [0, 0, 0, 0, 0, 0]): CubeState {
  return FACE_NAMES.map((f, i) => rotateGrid(faces[f], rotations[i]).join("")).join("");
}

// ---------------------------------------------------------------------------
// 색이 정해지지 않은 큐브: 면마다 "묶음 번호(0~5)"만 아는 상태에서 조립한다.
// 어느 색끼리 마주 보는지, 어느 면이 어디인지도 모르므로 배치까지 찾는다.


export interface LabelAssembly {
  /** 앱 내부 표준 색 글자로 바꾼 상태 (센터 = 표준 배치) */
  state: CubeState;
  /** 묶음 번호 → 앱 내부 색 */
  colorOf: Color[];
}

/** 큐브 전체를 잡는 24가지 방향 */
const ROTATIONS_24 = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y2", "y'"].map((b) => parseMoves(`${a} ${b}`)),
);

const permutations = <T>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

/**
 * grids[g]: 가운데 칸이 묶음 g 인 면의 9칸 묶음 번호 (카메라에 보인 순서, 방향 모름).
 * labMeans: 묶음마다 평균 색 — 같은 큐브를 24가지 방향으로 잡을 수 있으므로, 표준 색과 가장 비슷하게
 *           (흰색 계열이 아래, 노란색 계열이 위 …) 잡는 방향을 고르는 데 쓴다.
 */
export function assembleLabels(grids: number[][], labMeans?: Lab[]): LabelAssembly | null {
  if (grids.length !== 6 || grids.some((g, i) => g.length !== 9 || g[4] !== i || g.some((x) => x < 0 || x > 5))) return null;
  // 각 묶음은 9칸이어야 한다
  const count = new Array(6).fill(0);
  grids.forEach((g) => g.forEach((x) => count[x]++));
  if (count.some((c) => c !== 9)) return null;

  let found: LabelAssembly | null = null;
  // 묶음 0 을 윗면(U), 회전 0 으로 고정해도 일반성을 잃지 않는다 (큐브 전체를 돌려 잡으면 됨)
  const others = [1, 2, 3, 4, 5];
  search: for (const d of others) {
    const ring = others.filter((x) => x !== d);
    for (const [f, r, b, l] of permutations(ring)) {
      const slotLabel: Record<FaceName, number> = { U: 0, D: d, F: f, R: r, B: b, L: l };
      const colorOf: Color[] = new Array(6);
      FACE_NAMES.forEach((fn) => (colorOf[slotLabel[fn]] = SOLVED_FACE_COLORS[fn]));
      const faces = {} as Record<FaceName, Color[]>;
      FACE_NAMES.forEach((fn) => (faces[fn] = grids[slotLabel[fn]].map((x) => colorOf[x])));
      const res = assembleFaces(faces, { U: 0 }, true);
      if (res.state) {
        found = { state: res.state, colorOf };
        break search;
      }
    }
  }
  if (!found || !labMeans) return found;

  // 같은 큐브의 24가지 잡는 방향 중, 묶음 색이 표준 색과 가장 비슷한 것
  let best = found;
  let bestCost = Infinity;
  for (const rot of ROTATIONS_24) {
    const turned = applyMoves(found.state, rot);
    const relabel = new Map<string, Color>(FACE_NAMES.map((fn) => [centerColor(turned, fn), SOLVED_FACE_COLORS[fn]]));
    const state = [...turned].map((c) => relabel.get(c)!).join("");
    const colorOf = found.colorOf.map((c) => relabel.get(c)!);
    const cost = colorOf.reduce((sum, c, g) => sum + labDistance(labMeans[g], DEFAULT_REFS[c]), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = { state, colorOf };
    }
  }
  return best;
}
