import { describe, expect, it } from "vitest";
import { FACE_NAMES, FaceName } from "../cube/geometry";
import { Color, SOLVED, applyMoves, randomScramble } from "../cube/state";
import { assembleFaces, rotateGrid } from "./assemble";
import { COLORS, Lab, RGB, clusterBalanced, rgbToLab } from "./color";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const facesOf = (s: string) =>
  Object.fromEntries(FACE_NAMES.map((f, i) => [f, [...s.slice(i * 9, i * 9 + 9)] as Color[]])) as Record<FaceName, Color[]>;

describe("assembleFaces", () => {
  it("면을 아무 방향으로 돌려 보여줘도 원래 큐브를 찾는다", () => {
    const r = rng(1);
    let ambiguous = 0;
    for (let n = 0; n < 200; n++) {
      const s = applyMoves(SOLVED, randomScramble(22, r));
      const faces = facesOf(s);
      // 사용자가 면을 임의로 돌려서 보여준 상황
      for (const f of FACE_NAMES) faces[f] = rotateGrid(faces[f], Math.floor(r() * 4));
      const res = assembleFaces(faces);
      expect(res.state).not.toBeNull();
      if (res.ambiguous) ambiguous++;
      else expect(res.state).toBe(s);
    }
    expect(ambiguous).toBeLessThan(5);
  });

  it("색을 하나 잘못 읽으면 조립 실패", () => {
    const s = applyMoves(SOLVED, randomScramble(22, rng(2)));
    const faces = facesOf(s);
    faces.F[0] = faces.F[0] === "W" ? "Y" : "W";
    expect(assembleFaces(faces).state).toBeNull();
  });
});

describe("clusterBalanced", () => {
  it("조명이 어둡고 노랗게 치우쳐도 센터 기준으로 9칸씩 바르게 묶는다", () => {
    const base: Record<Color, RGB> = {
      W: [230, 230, 230],
      Y: [230, 210, 40],
      G: [30, 150, 75],
      B: [25, 75, 180],
      R: [185, 30, 40],
      O: [235, 105, 30],
    };
    const r = rng(9);
    const s = applyMoves(SOLVED, randomScramble(22, r));
    // 전체적으로 어둡고 따뜻한 조명 + 칸마다 잡음
    const labs: Lab[] = [...s].map((c) => {
      const [R, G, B] = base[c as Color];
      const noise = () => (r() - 0.5) * 24;
      return rgbToLab([
        Math.max(0, Math.min(255, R * 0.75 + 15 + noise())),
        Math.max(0, Math.min(255, G * 0.7 + noise())),
        Math.max(0, Math.min(255, B * 0.55 + noise())),
      ]);
    });
    const centerIndex = Object.fromEntries(COLORS.map((c) => [c, FACE_NAMES.findIndex((_, i) => s[i * 9 + 4] === c) * 9 + 4])) as Record<
      Color,
      number
    >;
    const res = clusterBalanced(labs, centerIndex);
    expect(res.colors.join("")).toBe(s);
  });
});

import { assembleLabels } from "./assemble";
import { DEFAULT_REFS as REFS } from "./color";

describe("assembleLabels (색이 정해지지 않은 큐브)", () => {
  it("색 이름·면 순서·면 방향을 모두 섞어도 유효한 큐브로 조립한다", () => {
    const r = rng(21);
    let maxMs = 0;
    for (let n = 0; n < 40; n++) {
      const s = applyMoves(SOLVED, randomScramble(22, r));
      // 실물 색 = 아무 이름 없는 묶음 번호. 면을 스캔한 순서도 무작위
      const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5); // order[k] = k번째로 스캔한 면(슬롯)
      const labelOfColor = new Map<string, number>(order.map((slot, k) => [s[slot * 9 + 4], k]));
      const grids = order.map((slot) =>
        rotateGrid([...s.slice(slot * 9, slot * 9 + 9)].map((c) => labelOfColor.get(c)!), Math.floor(r() * 4)),
      );
      const t0 = performance.now();
      const res = assembleLabels(grids);
      maxMs = Math.max(maxMs, performance.now() - t0);
      expect(res).not.toBeNull();
      // 묶음 → 내부 색으로 바꾼 면이, 조립 결과의 같은 센터 면과 (방향만 다르게) 같아야 한다
      for (let g = 0; g < 6; g++) {
        const mapped = grids[g].map((x) => res!.colorOf[x]).join("");
        const f = FACE_NAMES.findIndex((_, i) => res!.state[i * 9 + 4] === res!.colorOf[g]);
        const face = res!.state.slice(f * 9, f * 9 + 9);
        expect([0, 1, 2, 3].some((k) => rotateGrid([...mapped], k).join("") === face)).toBe(true);
      }
    }
    console.log("assembleLabels max ms", maxMs.toFixed(0));
    expect(maxMs).toBeLessThan(1500);
  });

  it("표준 색이면 표준 방향(노랑 위·초록 앞)으로 잡아 원래 상태와 같다", () => {
    const r = rng(22);
    for (let n = 0; n < 20; n++) {
      const s = applyMoves(SOLVED, randomScramble(22, r));
      const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5);
      const centers = order.map((slot) => s[slot * 9 + 4] as Color);
      const labelOfColor = new Map<string, number>(centers.map((c, k) => [c, k]));
      const grids = order.map((slot) =>
        rotateGrid([...s.slice(slot * 9, slot * 9 + 9)].map((c) => labelOfColor.get(c)!), Math.floor(r() * 4)),
      );
      const res = assembleLabels(grids, centers.map((c) => REFS[c]));
      expect(res!.state).toBe(s);
      expect(res!.colorOf).toEqual(centers);
    }
  });
});
