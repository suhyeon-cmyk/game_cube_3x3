import { describe, expect, it } from "vitest";
import { applyMoves, randomScramble, SOLVED } from "./state";
import { CORNER_POSITIONS, EDGE_POSITIONS, piecesValid, validateCube } from "./validate";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const setSlots = (state: string, slots: number[], colors: string[]) => {
  const a = [...state];
  slots.forEach((s, i) => (a[s] = colors[i]));
  return a.join("");
};

describe("validateCube", () => {
  it("돌려서 만든 상태는 모두 유효하다", () => {
    const r = rng(3);
    for (let i = 0; i < 1000; i++) {
      const s = applyMoves(SOLVED, randomScramble(25, r));
      const v = validateCube(s);
      expect(v.errors).toEqual([]);
      expect(piecesValid(s)).toBe(true);
    }
  });

  it("코너 하나를 비틀면 비틀림 오류", () => {
    const s = applyMoves(SOLVED, randomScramble(22, rng(5)));
    const p = CORNER_POSITIONS[0];
    const cs = p.slots.map((x) => s[x]);
    const twisted = setSlots(s, p.slots, [cs[1], cs[2], cs[0]]);
    expect(validateCube(twisted).errors.map((e) => e.kind)).toEqual(["twist"]);
  });

  it("엣지 하나를 뒤집으면 뒤집힘 오류", () => {
    const s = applyMoves(SOLVED, randomScramble(22, rng(6)));
    const p = EDGE_POSITIONS[3];
    const flipped = setSlots(s, p.slots, [s[p.slots[1]], s[p.slots[0]]]);
    expect(validateCube(flipped).errors.map((e) => e.kind)).toEqual(["flip"]);
  });

  it("엣지 두 개를 맞바꾸면 패리티 오류", () => {
    const s = applyMoves(SOLVED, randomScramble(22, rng(7)));
    const a = EDGE_POSITIONS[0];
    const b = EDGE_POSITIONS[5];
    let t = setSlots(s, a.slots, b.slots.map((x) => s[x]));
    t = setSlots(t, b.slots, a.slots.map((x) => s[x]));
    expect(validateCube(t).errors.map((e) => e.kind)).toEqual(["parity"]);
  });

  it("색 하나를 잘못 읽으면 개수/조각 오류", () => {
    const s = applyMoves(SOLVED, randomScramble(22, rng(8)));
    const slot = EDGE_POSITIONS[2].slots[0];
    const wrong = setSlots(s, [slot], [s[slot] === "W" ? "Y" : "W"]);
    const kinds = validateCube(wrong).errors.map((e) => e.kind);
    expect(kinds).toContain("count");
    expect(piecesValid(wrong)).toBe(false);
  });
});
