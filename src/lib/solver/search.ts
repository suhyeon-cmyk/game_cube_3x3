import { Perm } from "../cube/moves";

/**
 * 조각마다 스티커 하나의 슬롯 번호만 추적하는 가벼운 탐색.
 * 스티커 하나의 슬롯만 알면 그 조각의 위치와 방향이 정해진다.
 * 매크로(한 수 또는 공식 묶음)는 센터를 움직이지 않는 면 회전으로만 이루어져야 한다.
 */
export interface SearchMacro<T> {
  perm: Perm;
  /** 같은 family 매크로는 연속으로 쓰지 않는다 (예: U 다음 U', 같은 공식 반복 횟수 변형) */
  family: string;
  data: T;
}

export interface SearchOptions {
  maxDepth: number;
  maxNodes?: number;
}

export function bfs<T>(
  start: readonly number[],
  macros: readonly SearchMacro<T>[],
  goal: (slots: Int8Array) => boolean,
  { maxDepth, maxNodes = 2_000_000 }: SearchOptions,
): T[] | null {
  const s0 = Int8Array.from(start);
  if (goal(s0)) return [];

  const keyOf = (s: Int8Array) => String.fromCharCode(...s);
  const states: Int8Array[] = [s0];
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const depth: number[] = [0];
  const seen = new Set<string>([keyOf(s0)]);

  for (let head = 0; head < states.length; head++) {
    if (depth[head] >= maxDepth) continue;
    const cur = states[head];
    const prevFamily = via[head] >= 0 ? macros[via[head]].family : null;
    for (let mi = 0; mi < macros.length; mi++) {
      const m = macros[mi];
      if (m.family === prevFamily) continue;
      const next = new Int8Array(cur.length);
      for (let i = 0; i < cur.length; i++) next[i] = m.perm[cur[i]];
      const k = keyOf(next);
      if (seen.has(k)) continue;
      seen.add(k);
      states.push(next);
      parent.push(head);
      via.push(mi);
      depth.push(depth[head] + 1);
      if (goal(next)) {
        const path: T[] = [];
        for (let n = states.length - 1; n > 0; n = parent[n]) path.push(macros[via[n]].data);
        return path.reverse();
      }
      if (states.length > maxNodes) return null;
    }
  }
  return null;
}
