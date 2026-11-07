import { describe, expect, it } from "vitest";
import { parseMoves } from "../cube/moves";
import { SOLVED, applyMoves, isSolved, randomScramble } from "../cube/state";
import { STAGE_IDS, currentStage, isStageDone } from "./stages";
import { solveAll, solveUpTo, planCurrentStage } from "./solve";

// 재현 가능한 난수
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("stages", () => {
  it("solved cube has no current stage", () => {
    expect(currentStage(SOLVED)).toBeNull();
    expect(currentStage(applyMoves(SOLVED, parseMoves("x y")))).toBeNull();
  });
  it("tutorial algs keep earlier stages", () => {
    expect(currentStage(applyMoves(SOLVED, parseMoves("F R U R' U' F'")))).toBe(4);
    expect(currentStage(applyMoves(SOLVED, parseMoves("R U R' U R U2 R'")))).toBe(5);
    expect(currentStage(applyMoves(SOLVED, parseMoves("L F' L B2 L' F L B2 L2")))).toBe(6);
    expect(currentStage(applyMoves(SOLVED, parseMoves("R U' R U R U R U' R' U' R2")))).toBe(7);
  });
});

describe("solver", () => {
  it("solves random scrambles stage by stage", () => {
    const r = rng(42);
    const N = Number(process.env.SOLVE_N ?? 1000);
    let totalMoves = 0;
    let worst = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      let s = applyMoves(SOLVED, randomScramble(22, r));
      for (const st of STAGE_IDS) {
        const t = performance.now();
        const steps = solveUpTo(s, st);
        worst = Math.max(worst, performance.now() - t);
        s = applyMoves(s, steps.flatMap((p) => p.moves));
        totalMoves += steps.reduce((n, p) => n + p.moves.length, 0);
        expect(isStageDone(s, st), `scramble ${i} stage ${st}`).toBe(true);
      }
      expect(isSolved(s)).toBe(true);
    }
    console.log(`avg moves ${(totalMoves / N).toFixed(1)}, avg ${((performance.now() - t0) / N).toFixed(1)}ms/solve, worst stage ${worst.toFixed(0)}ms`);
  }, 600_000);

  it("solves from rotated orientation", () => {
    const s = applyMoves(SOLVED, parseMoves("R U F' D2 L B x z'"));
    const steps = solveAll(s);
    expect(steps[0].kind).toBe("orient");
    expect(isSolved(applyMoves(s, steps.flatMap((p) => p.moves)))).toBe(true);
  });

  it("plan for current stage only", () => {
    const s = applyMoves(SOLVED, parseMoves("R U R' U R U2 R'"));
    const plan = planCurrentStage(s);
    expect(plan.every((p) => p.stage === 5)).toBe(true);
    expect(currentStage(applyMoves(s, plan.flatMap((p) => p.moves)))).not.toBe(5);
  });
});
