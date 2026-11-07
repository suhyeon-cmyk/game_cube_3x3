import { describe, expect, it } from "vitest";
import { SLOTS, POSITIONS } from "./geometry";
import { formatMoves, invertMoves, parseMoves, simplifyMoves, MoveFace } from "./moves";
import { SOLVED, applyMove, applyMoves, isSolved, randomScramble, centerColor } from "./state";

const ALL: MoveFace[] = ["R", "L", "U", "D", "F", "B", "M", "E", "S", "x", "y", "z"];

describe("geometry", () => {
  it("54 slots, 26 positions", () => {
    expect(SLOTS.length).toBe(54);
    expect(POSITIONS.length).toBe(26);
  });
});

describe("moves", () => {
  it("each move x4 = identity, X X' = identity", () => {
    for (const f of ALL) {
      const m = { face: f, amount: 1 as const };
      expect(applyMoves(SOLVED, [m, m, m, m])).toBe(SOLVED);
      expect(applyMoves(SOLVED, [m, { face: f, amount: -1 }])).toBe(SOLVED);
      expect(applyMove(SOLVED, m)).not.toBe(SOLVED);
    }
  });

  it("sexy move x6 = identity", () => {
    const alg = parseMoves("R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'");
    expect(applyMoves(SOLVED, alg)).toBe(SOLVED);
  });

  it("R moves F sticker to U (clockwise seen from right)", () => {
    // R: 앞면 오른쪽 열이 윗면으로 올라간다
    const s = applyMoves(SOLVED, parseMoves("R"));
    expect(s[2]).toBe("G"); // U 면 오른쪽 위
    const u = applyMoves(SOLVED, parseMoves("U"));
    expect(u[2 * 9 + 0]).toBe("O"); // U: 오른쪽 면 윗줄이 앞으로
    const f = applyMoves(SOLVED, parseMoves("F"));
    expect(f[1 * 9 + 0]).toBe("Y"); // F: 윗면 아랫줄이 오른쪽으로
  });

  it("rotations match face moves", () => {
    expect(applyMoves(SOLVED, parseMoves("x"))).toBe(applyMoves(SOLVED, parseMoves("R M' L'")));
    expect(applyMoves(SOLVED, parseMoves("y"))).toBe(applyMoves(SOLVED, parseMoves("U E' D'")));
    expect(applyMoves(SOLVED, parseMoves("z"))).toBe(applyMoves(SOLVED, parseMoves("F S B'")));
    expect(centerColor(applyMoves(SOLVED, parseMoves("y")), "F")).toBe("O");
  });

  it("scramble then inverse = solved", () => {
    for (let i = 0; i < 50; i++) {
      const sc = randomScramble();
      const s = applyMoves(SOLVED, sc);
      expect(isSolved(s)).toBe(false);
      expect(applyMoves(s, invertMoves(sc))).toBe(SOLVED);
    }
  });

  it("parse / format / simplify", () => {
    expect(formatMoves(parseMoves("R U2 R' U'"))).toBe("R U2 R' U'");
    expect(formatMoves(simplifyMoves(parseMoves("U U R R' U'")))).toBe("U");
  });
});
