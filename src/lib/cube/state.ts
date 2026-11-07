import { FACE_NAMES, FaceName, FACE_NORMALS, POSITIONS, SLOTS, Vec3, posKey, vecEq } from "./geometry";
import { FACE_MOVES, MOVE_DEFS, Move, Perm, movePerm, sequencePerm, Amount } from "./moves";

export type Color = "W" | "Y" | "G" | "B" | "R" | "O";

/** 54칸 스티커 색. 순서는 geometry.SLOTS (U R F D L B 면, 각 면 3x3 읽기 순서) */
export type CubeState = string;

/** 완성 상태: 노란색 위, 흰색 아래, 초록 앞, 주황 오른쪽, 빨강 왼쪽, 파랑 뒤 */
export const SOLVED_FACE_COLORS: Record<FaceName, Color> = {
  U: "Y",
  D: "W",
  F: "G",
  B: "B",
  R: "O",
  L: "R",
};

export const SOLVED: CubeState = FACE_NAMES.map((f) => SOLVED_FACE_COLORS[f].repeat(9)).join("");

export const STANDARD_COLOR_NAMES: Readonly<Record<Color, string>> = {
  W: "흰색",
  Y: "노란색",
  G: "초록색",
  B: "파란색",
  R: "빨간색",
  O: "주황색",
};

/**
 * 화면 문구에 쓰는 색 이름. 앱 내부 색 글자(W, Y, …)는 "면의 역할"이고,
 * 실제 큐브 색이 다르면(스캔한 큐브) 이 이름을 실제 색 이름으로 바꾼다.
 */
export const COLOR_NAMES_KO: Record<Color, string> = { ...STANDARD_COLOR_NAMES };

export function setColorNames(names: Partial<Record<Color, string>> | null) {
  Object.assign(COLOR_NAMES_KO, STANDARD_COLOR_NAMES, names ?? {});
}

/** 고정 문구 속 "흰색/노란색" 등을 현재 색 이름으로 바꾼다 (표준 색이면 그대로) */
export function localizeColorWords(text: string): string {
  const colors = ["W", "Y", "G", "B", "R", "O"] as Color[];
  if (colors.every((c) => COLOR_NAMES_KO[c] === STANDARD_COLOR_NAMES[c])) return text;
  // 바꾼 이름이 다른 표준 이름과 겹쳐도 두 번 바뀌지 않게 자리표시자를 거친다
  let out = text;
  colors.forEach((c, i) => {
    const std = STANDARD_COLOR_NAMES[c];
    out = out.split(std).join(`${i}F`).split(std.replace("색", "") + " ").join(`${i}S `);
  });
  colors.forEach((c, i) => {
    const cur = COLOR_NAMES_KO[c];
    out = out.split(`${i}F`).join(cur).split(`${i}S`).join(cur.replace("색", ""));
  });
  return out;
}


export function applyPerm(state: CubeState, perm: Perm): CubeState {
  const out = new Array<string>(54);
  for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
  return out.join("");
}

export function applyMove(state: CubeState, move: Move): CubeState {
  return applyPerm(state, movePerm(move));
}

export function applyMoves(state: CubeState, moves: readonly Move[]): CubeState {
  return applyPerm(state, sequencePerm(moves));
}

export function isSolved(state: CubeState): boolean {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9];
    for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
}

const CENTER_SLOT: Record<FaceName, number> = Object.fromEntries(
  FACE_NAMES.map((f, i) => [f, i * 9 + 4]),
) as Record<FaceName, number>;

export function centerColor(state: CubeState, face: FaceName): Color {
  return state[CENTER_SLOT[face]] as Color;
}

/** 해당 색 센터가 있는 면 */
export function faceOfColor(state: CubeState, color: Color): FaceName {
  for (const f of FACE_NAMES) if (centerColor(state, f) === color) return f;
  throw new Error(`center ${color} not found`);
}

export function faceOfNormal(n: Vec3): FaceName {
  for (const f of FACE_NAMES) if (vecEq(FACE_NORMALS[f], n)) return f;
  throw new Error(`no face for normal ${n}`);
}

export interface PieceInfo {
  pos: Vec3;
  kind: "center" | "edge" | "corner";
  /** 이 위치에 있는 스티커들: 슬롯 번호와 색 */
  stickers: { slot: number; color: Color }[];
}

export function piecesOf(state: CubeState): PieceInfo[] {
  return POSITIONS.map((p) => ({
    pos: p.pos,
    kind: p.kind,
    stickers: p.slots.map((slot) => ({ slot, color: state[slot] as Color })),
  }));
}

const colorSetKey = (colors: Iterable<Color>) => [...colors].sort().join("");

/** 색 조합으로 조각 찾기 */
export function findPiece(state: CubeState, colors: readonly Color[]): PieceInfo {
  const k = colorSetKey(colors);
  for (const p of piecesOf(state)) {
    if (colorSetKey(p.stickers.map((s) => s.color)) === k) return p;
  }
  throw new Error(`piece ${colors.join("")} not found`);
}

/**
 * 조각(색 조합)의 특정 색 스티커가 있어야 할 슬롯.
 * 현재 센터 위치를 기준으로 계산하므로 큐브 전체 회전 후에도 맞다.
 */
export function homeSlot(state: CubeState, colors: readonly Color[], color: Color): number {
  const pos: [number, number, number] = [0, 0, 0];
  for (const c of colors) {
    const n = FACE_NORMALS[faceOfColor(state, c)];
    pos[0] += n[0];
    pos[1] += n[1];
    pos[2] += n[2];
  }
  const n = FACE_NORMALS[faceOfColor(state, color)];
  return SLOTS.findIndex((s) => vecEq(s.pos, pos) && vecEq(s.normal, n));
}

export function homePosKey(state: CubeState, colors: readonly Color[]): string {
  return posKey(SLOTS[homeSlot(state, colors, colors[0])].pos);
}

/** 무작위 섞기 (같은 면 연속 금지, 같은 축 3연속 금지) */
export function randomScramble(length = 22, rng: () => number = Math.random): Move[] {
  const moves: Move[] = [];
  const amounts: Amount[] = [1, -1, 2];
  while (moves.length < length) {
    const face = FACE_MOVES[Math.floor(rng() * FACE_MOVES.length)];
    const a = moves[moves.length - 1];
    const b = moves[moves.length - 2];
    if (a && a.face === face) continue;
    const axis = MOVE_DEFS[face].axis;
    if (a && b && MOVE_DEFS[a.face].axis === axis && MOVE_DEFS[b.face].axis === axis) continue;
    moves.push({ face, amount: amounts[Math.floor(rng() * 3)] });
  }
  return moves;
}
