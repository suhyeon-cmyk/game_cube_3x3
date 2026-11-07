import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyMoves, isSolved, randomScramble, SOLVED } from "@/lib/cube/state";
import { parseMoves } from "@/lib/cube/moves";

// 자동 돌려 잡기는 브라우저에서만 구독하므로 window 를 흉내 낸다
type Store = typeof import("./cubeStore");
let mod: Store;

beforeAll(async () => {
  vi.useFakeTimers();
  (globalThis as unknown as { window: object }).window = globalThis;
  mod = await import("./cubeStore");
});

afterEach(() => {
  mod.useCubeStore.getState().reset();
});

const st = () => mod.useCubeStore.getState();

/** 애니메이션 없이 대기 중인 수를 모두 끝낸다 (자동 돌려 잡기 타이머 포함) */
function drain() {
  for (let guard = 0; guard < 200; guard++) {
    const cur = st().current;
    if (cur) {
      st().finishCurrent(cur.id);
      continue;
    }
    vi.advanceTimersByTime(1000);
    if (!st().current) return;
  }
  throw new Error("drain did not settle");
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("직접 풀기 안내 따라가기", () => {
  it("큐브 돌려 잡기는 자동으로 하고, 안내만 따라 하면 끝까지 풀린다", () => {
    const r = rng(7);
    for (let n = 0; n < 15; n++) {
      mod.useCubeStore.setState({ cube: applyMoves(SOLVED, randomScramble(22, r)) });
      st().setMode("manual");
      drain();
      let autoRotations = 0;
      let steps = 0;
      while (!isSolved(st().cube)) {
        const next = mod.planNextMove(st().plan);
        expect(next, "안내가 없음").not.toBeNull();
        // 사용자는 면/층 회전만 직접 한다. 큐브 돌려 잡기는 앱이 해야 한다
        expect("xyz".includes(next!.face), "돌려 잡기가 자동으로 처리되지 않음").toBe(false);
        const before = st().history.length;
        if (next!.amount === 2) {
          // 터치 사용자: 드래그 한 번은 90° 라서 180° 는 두 번에 나눠 돌린다 (방향은 아무 쪽이나)
          const dir = r() < 0.5 ? 1 : -1;
          st().userMove({ face: next!.face, amount: dir });
          drain();
          expect(mod.planNextMove(st().plan), "절반 돌린 뒤 같은 방향 한 번 더 안내").toEqual({ face: next!.face, amount: dir });
          st().userMove({ face: next!.face, amount: dir });
        } else {
          st().userMove(next!);
        }
        drain();
        autoRotations += st().history.slice(before).filter((h) => h.auto).length;
        steps++;
        expect(steps, "안내가 끝나지 않음 (반복)").toBeLessThan(400);
      }
      expect(autoRotations).toBeGreaterThan(0);
      st().setMode("auto");
    }
  });

  it("자동 돌려 잡기 직후 되돌리기 하면 정확히 그 수 전으로 돌아간다", () => {
    const r = rng(11);
    let checked = 0;
    for (let n = 0; n < 10 && checked < 5; n++) {
      mod.useCubeStore.setState({ cube: applyMoves(SOLVED, randomScramble(22, r)) });
      st().setMode("manual");
      drain();
      for (let steps = 0; steps < 300 && !isSolved(st().cube); steps++) {
        const next = mod.planNextMove(st().plan)!;
        const cubeBefore = st().cube;
        const histBefore = st().history.length;
        st().userMove(next);
        drain();
        const autoAfter = st().history.slice(histBefore + 1).some((h) => h.auto);
        if (autoAfter) {
          st().undo();
          // 되돌리기 수만 처리하고 (다시 자동 회전되기 전에) 비교
          while (st().current) st().finishCurrent(st().current!.id);
          expect(st().cube).toBe(cubeBefore);
          checked++;
          drain();
          break;
        }
      }
      st().setMode("auto");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("손으로 y 를 눌러도 반복에 빠지지 않는다", () => {
    mod.useCubeStore.setState({ cube: applyMoves(SOLVED, parseMoves("R U F")) });
    st().setMode("manual");
    drain();
    st().userMove({ face: "y", amount: 1 });
    drain();
    expect(mod.planNextMove(st().plan)).not.toBeNull();
  });
});
