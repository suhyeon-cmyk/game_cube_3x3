// 큐브 상태(54칸 색)가 실제로 돌려서 만들 수 있는 상태인지 검사한다.
// - 모든 코너/엣지가 존재하는 조각이고 정확히 한 번씩 나오는지
// - 코너 비틀림 합 ≡ 0 (mod 3), 엣지 뒤집힘 합 ≡ 0 (mod 2)
// - 코너 순열과 엣지 순열의 홀짝이 같은지

import { POSITIONS, SLOTS, Vec3 } from "./geometry";
import { COLOR_NAMES_KO, Color, CubeState, SOLVED } from "./state";

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 조각 위치마다 스티커 슬롯을 정해진 순서로: 코너는 U/D 스티커부터 같은 회전 방향, 엣지는 U/D(없으면 F/B) 스티커부터 */
interface OrderedPosition {
  pos: Vec3;
  slots: number[];
}

const isUD = (slot: number) => SLOTS[slot].normal[1] !== 0;
const isFB = (slot: number) => SLOTS[slot].normal[2] !== 0;

export const CORNER_POSITIONS: OrderedPosition[] = POSITIONS.filter((p) => p.kind === "corner").map((p) => {
  const first = p.slots.find(isUD)!;
  const others = p.slots.filter((s) => s !== first);
  // 바깥에서 봤을 때 같은 방향으로 돌도록: (n0 × n1) · pos > 0 인 쪽을 두 번째로
  const n0 = SLOTS[first].normal;
  const [a, b] = others;
  const second = dot(cross(n0, SLOTS[a].normal), p.pos) > 0 ? a : b;
  const third = second === a ? b : a;
  return { pos: p.pos, slots: [first, second, third] };
});

export const EDGE_POSITIONS: OrderedPosition[] = POSITIONS.filter((p) => p.kind === "edge").map((p) => {
  const first = p.slots.find(isUD) ?? p.slots.find(isFB)!;
  const second = p.slots.find((s) => s !== first)!;
  return { pos: p.pos, slots: [first, second] };
});

const colorsAt = (state: CubeState, slots: number[]) => slots.map((s) => state[s] as Color);

// 완성 상태 기준 조각 목록 (색 순서 포함)
const SOLVED_CORNERS = CORNER_POSITIONS.map((p) => colorsAt(SOLVED, p.slots));
const SOLVED_EDGES = EDGE_POSITIONS.map((p) => colorsAt(SOLVED, p.slots));

export type ValidationError =
  | { kind: "center"; message: string }
  | { kind: "count"; message: string; color: Color }
  | { kind: "piece"; message: string; slots: number[] }
  | { kind: "duplicate"; message: string; slots: number[] }
  | { kind: "twist"; message: string }
  | { kind: "flip"; message: string }
  | { kind: "parity"; message: string };

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const name = (cs: Color[]) => cs.map((c) => COLOR_NAMES_KO[c].replace("색", "")).join("·");

function permParity(perm: number[]): number {
  const seen = new Array(perm.length).fill(false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      len++;
    }
    parity += len - 1;
  }
  return parity % 2;
}

/** 조각 구성만 검사 (빠름). 방향 조합 탐색에서 쓴다 */
export function piecesValid(state: CubeState): boolean {
  const usedC = new Array(8).fill(false);
  for (const p of CORNER_POSITIONS) {
    const id = identifyCorner(colorsAt(state, p.slots));
    if (!id || usedC[id.piece]) return false;
    usedC[id.piece] = true;
  }
  const usedE = new Array(12).fill(false);
  for (const p of EDGE_POSITIONS) {
    const id = identifyEdge(colorsAt(state, p.slots));
    if (!id || usedE[id.piece]) return false;
    usedE[id.piece] = true;
  }
  return true;
}

function identifyCorner(cs: Color[]): { piece: number; twist: number } | null {
  for (let i = 0; i < 8; i++) {
    const ref = SOLVED_CORNERS[i];
    for (let t = 0; t < 3; t++) {
      if (cs[0] === ref[t] && cs[1] === ref[(t + 1) % 3] && cs[2] === ref[(t + 2) % 3]) return { piece: i, twist: t };
    }
  }
  return null;
}

function identifyEdge(cs: Color[]): { piece: number; flip: number } | null {
  for (let i = 0; i < 12; i++) {
    const ref = SOLVED_EDGES[i];
    if (cs[0] === ref[0] && cs[1] === ref[1]) return { piece: i, flip: 0 };
    if (cs[0] === ref[1] && cs[1] === ref[0]) return { piece: i, flip: 1 };
  }
  return null;
}

export function validateCube(state: CubeState): ValidationResult {
  const errors: ValidationError[] = [];
  if (state.length !== 54) return { ok: false, errors: [{ kind: "center", message: "54칸이 모두 채워지지 않았어요." }] };

  // 센터 배치는 완성 상태와 같아야 한다 (스캔할 때 면 위치를 센터 색으로 정하므로)
  for (let f = 0; f < 6; f++) {
    if (state[f * 9 + 4] !== SOLVED[f * 9 + 4]) {
      errors.push({ kind: "center", message: "센터 색 배치가 표준(흰↔노, 초↔파, 빨↔주)과 달라요." });
      break;
    }
  }
  for (const c of ["W", "Y", "G", "B", "R", "O"] as Color[]) {
    const n = [...state].filter((x) => x === c).length;
    if (n !== 9) errors.push({ kind: "count", color: c, message: `${COLOR_NAMES_KO[c]} 칸이 ${n}개예요 (9개여야 해요).` });
  }

  const cornerPerm: number[] = [];
  let twist = 0;
  const seenC = new Map<number, number[]>();
  CORNER_POSITIONS.forEach((p, idx) => {
    const cs = colorsAt(state, p.slots);
    const id = identifyCorner(cs);
    if (!id) {
      errors.push({ kind: "piece", slots: p.slots, message: `있을 수 없는 코너 조각이 있어요 (${name(cs)}).` });
      return;
    }
    if (seenC.has(id.piece)) {
      errors.push({ kind: "duplicate", slots: [...seenC.get(id.piece)!, ...p.slots], message: `같은 코너가 두 번 나와요 (${name(cs)}).` });
    }
    seenC.set(id.piece, p.slots);
    cornerPerm[idx] = id.piece;
    twist += id.twist;
  });

  const edgePerm: number[] = [];
  let flip = 0;
  const seenE = new Map<number, number[]>();
  EDGE_POSITIONS.forEach((p, idx) => {
    const cs = colorsAt(state, p.slots);
    const id = identifyEdge(cs);
    if (!id) {
      errors.push({ kind: "piece", slots: p.slots, message: `있을 수 없는 엣지 조각이 있어요 (${name(cs)}).` });
      return;
    }
    if (seenE.has(id.piece)) {
      errors.push({ kind: "duplicate", slots: [...seenE.get(id.piece)!, ...p.slots], message: `같은 엣지가 두 번 나와요 (${name(cs)}).` });
    }
    seenE.set(id.piece, p.slots);
    edgePerm[idx] = id.piece;
    flip += id.flip;
  });

  // 조각 구성이 맞을 때만 패리티 검사가 의미 있다
  if (errors.length === 0) {
    if (twist % 3 !== 0) errors.push({ kind: "twist", message: "코너 하나가 비틀려 있어요 (돌려서는 만들 수 없는 상태). 코너 색을 다시 확인해 주세요." });
    if (flip % 2 !== 0) errors.push({ kind: "flip", message: "엣지 하나가 뒤집혀 있어요 (돌려서는 만들 수 없는 상태). 엣지 색을 다시 확인해 주세요." });
    if (permParity(cornerPerm) !== permParity(edgePerm))
      errors.push({ kind: "parity", message: "조각 두 개가 서로 바뀌어 있어요 (돌려서는 만들 수 없는 상태)." });
  }
  return { ok: errors.length === 0, errors };
}
