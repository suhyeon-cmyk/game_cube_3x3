// 큐브 기하 정보: 스티커 슬롯 54개와 회전 순열 테이블.
// 좌표계: +x = R(오른쪽), +y = U(위), +z = F(앞). three.js 좌표계와 같다.

export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;

export type FaceName = "U" | "R" | "F" | "D" | "L" | "B";

export const FACE_NAMES: readonly FaceName[] = ["U", "R", "F", "D", "L", "B"];

export const FACE_NORMALS: Record<FaceName, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

// 각 면을 바깥에서 봤을 때 읽는 방향 (오른쪽, 아래쪽)
const FACE_READING: Record<FaceName, { right: Vec3; down: Vec3 }> = {
  U: { right: [1, 0, 0], down: [0, 0, 1] },
  R: { right: [0, 0, -1], down: [0, -1, 0] },
  F: { right: [1, 0, 0], down: [0, -1, 0] },
  D: { right: [1, 0, 0], down: [0, 0, -1] },
  L: { right: [0, 0, 1], down: [0, -1, 0] },
  B: { right: [-1, 0, 0], down: [0, -1, 0] },
};

export interface Slot {
  index: number;
  face: FaceName;
  pos: Vec3; // 스티커가 붙은 조각의 위치
  normal: Vec3; // 스티커가 바라보는 방향
}

const key = (p: Vec3, n: Vec3) => `${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`;
export const posKey = (p: Vec3) => `${p[0]},${p[1]},${p[2]}`;

export const SLOTS: readonly Slot[] = (() => {
  const slots: Slot[] = [];
  for (const face of FACE_NAMES) {
    const n = FACE_NORMALS[face];
    const { right, down } = FACE_READING[face];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const pos: Vec3 = [
          n[0] + (col - 1) * right[0] + (row - 1) * down[0],
          n[1] + (col - 1) * right[1] + (row - 1) * down[1],
          n[2] + (col - 1) * right[2] + (row - 1) * down[2],
        ];
        slots.push({ index: slots.length, face, pos, normal: n });
      }
    }
  }
  return slots;
})();

const SLOT_BY_KEY = new Map(SLOTS.map((s) => [key(s.pos, s.normal), s.index]));

export function slotAt(pos: Vec3, normal: Vec3): number {
  const i = SLOT_BY_KEY.get(key(pos, normal));
  if (i === undefined) throw new Error(`no slot at ${key(pos, normal)}`);
  return i;
}

export type PieceKind = "center" | "edge" | "corner";

export interface Position {
  pos: Vec3;
  kind: PieceKind;
  slots: number[];
}

/** 조각 위치 26개 (중심 코어 제외)와 각 위치의 스티커 슬롯 */
export const POSITIONS: readonly Position[] = (() => {
  const map = new Map<string, Position>();
  for (const s of SLOTS) {
    const k = posKey(s.pos);
    let p = map.get(k);
    if (!p) {
      const nonZero = s.pos.filter((c) => c !== 0).length;
      const kind: PieceKind = nonZero === 1 ? "center" : nonZero === 2 ? "edge" : "corner";
      p = { pos: s.pos, kind, slots: [] };
      map.set(k, p);
    }
    p.slots.push(s.index);
  }
  return [...map.values()];
})();

export const POSITION_BY_KEY = new Map(POSITIONS.map((p) => [posKey(p.pos), p]));

/** 축 기준 +90°(오른손 법칙, +축에서 봤을 때 반시계) 회전을 q번 */
export function rotateVec(v: Vec3, axis: Axis, q: number): Vec3 {
  let [x, y, z] = v;
  const turns = ((q % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  // -0 정규화
  return [x + 0, y + 0, z + 0];
}

export const vecEq = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
