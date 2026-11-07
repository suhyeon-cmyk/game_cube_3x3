import { Axis, SLOTS, rotateVec, slotAt } from "./geometry";

export type MoveFace =
  | "R" | "L" | "U" | "D" | "F" | "B"
  | "M" | "E" | "S"
  | "x" | "y" | "z";

/** 1 = 시계 방향 90°, -1 = 반시계 방향 90° ('), 2 = 180° */
export type Amount = 1 | -1 | 2;

export interface Move {
  face: MoveFace;
  amount: Amount;
}

export interface MoveDef {
  axis: Axis;
  /** 회전하는 층의 좌표값. null 이면 큐브 전체 */
  layer: -1 | 0 | 1 | null;
  /** amount=1 일 때 축 기준 +90° 회전 횟수의 부호 */
  sign: 1 | -1;
}

export const MOVE_DEFS: Record<MoveFace, MoveDef> = {
  R: { axis: 0, layer: 1, sign: -1 },
  L: { axis: 0, layer: -1, sign: 1 },
  U: { axis: 1, layer: 1, sign: -1 },
  D: { axis: 1, layer: -1, sign: 1 },
  F: { axis: 2, layer: 1, sign: -1 },
  B: { axis: 2, layer: -1, sign: 1 },
  M: { axis: 0, layer: 0, sign: 1 }, // L 방향
  E: { axis: 1, layer: 0, sign: 1 }, // D 방향
  S: { axis: 2, layer: 0, sign: -1 }, // F 방향
  x: { axis: 0, layer: null, sign: -1 }, // R 방향
  y: { axis: 1, layer: null, sign: -1 }, // U 방향
  z: { axis: 2, layer: null, sign: -1 }, // F 방향
};

export const FACE_MOVES: readonly MoveFace[] = ["R", "L", "U", "D", "F", "B"];
export const ROTATIONS: readonly MoveFace[] = ["x", "y", "z"];

/** +축 기준 +90° 회전 횟수 (애니메이션 각도 계산용) */
export function quarterTurns(m: Move): number {
  return MOVE_DEFS[m.face].sign * m.amount;
}

/** 슬롯 순열: 회전 후 상태에서 newState[to[i]] = oldState[i] */
export type Perm = Int8Array;

const tableCache = new Map<string, Perm>();

export function moveToString(m: Move): string {
  return m.face + (m.amount === -1 ? "'" : m.amount === 2 ? "2" : "");
}

export function movePerm(m: Move): Perm {
  const k = moveToString(m);
  let t = tableCache.get(k);
  if (t) return t;
  const def = MOVE_DEFS[m.face];
  const q = def.sign * m.amount;
  t = new Int8Array(SLOTS.length);
  for (const s of SLOTS) {
    if (def.layer === null || s.pos[def.axis] === def.layer) {
      t[s.index] = slotAt(rotateVec(s.pos, def.axis, q), rotateVec(s.normal, def.axis, q));
    } else {
      t[s.index] = s.index;
    }
  }
  tableCache.set(k, t);
  return t;
}

export const IDENTITY: Perm = Int8Array.from(SLOTS.map((s) => s.index));

/** a 다음 b */
export function composePerm(a: Perm, b: Perm): Perm {
  const c = new Int8Array(a.length);
  for (let i = 0; i < a.length; i++) c[i] = b[a[i]];
  return c;
}

export function sequencePerm(moves: readonly Move[]): Perm {
  let p = IDENTITY;
  for (const m of moves) p = composePerm(p, movePerm(m));
  return p;
}

export function inverseMove(m: Move): Move {
  return { face: m.face, amount: m.amount === 2 ? 2 : (-m.amount as Amount) };
}

export function invertMoves(moves: readonly Move[]): Move[] {
  return [...moves].reverse().map(inverseMove);
}

const MOVE_RE = /^([RLUDFBMESxyz])(2|'|2'|)$/;

export function parseMove(token: string): Move {
  const m = MOVE_RE.exec(token.trim().replace("’", "'"));
  if (!m) throw new Error(`잘못된 회전 기호: ${token}`);
  const amount: Amount = m[2] === "'" ? -1 : m[2].startsWith("2") ? 2 : 1;
  return { face: m[1] as MoveFace, amount };
}

export function parseMoves(text: string): Move[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

export function formatMoves(moves: readonly Move[]): string {
  return moves.map(moveToString).join(" ");
}

export function repeatMoves(moves: readonly Move[], n: number): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < n; i++) out.push(...moves);
  return out;
}

/** 같은 면 연속 회전 합치기 (예: U U → U2, U U' → 없음) */
export function simplifyMoves(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.face === m.face) {
      const q = (((toQuarter(last.amount) + toQuarter(m.amount)) % 4) + 4) % 4;
      out.pop();
      if (q !== 0) out.push({ face: m.face, amount: fromQuarter(q) });
    } else {
      out.push(m);
    }
  }
  return out;
}

const toQuarter = (a: Amount) => (a === -1 ? 3 : a);
const fromQuarter = (q: number): Amount => (q === 3 ? -1 : (q as Amount));
