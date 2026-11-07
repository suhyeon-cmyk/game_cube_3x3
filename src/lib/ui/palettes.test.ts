import { describe, expect, it } from "vitest";
import { PRESETS, namesFor, similarPairs } from "./palettes";

describe("palettes", () => {
  it("모든 테마는 6색이 서로 구분된다", () => {
    for (const p of PRESETS) expect(similarPairs(p.colors), p.name).toEqual([]);
  });

  it("모든 테마의 색 이름이 서로 다르다", () => {
    for (const p of PRESETS) {
      const names = Object.values(namesFor(p.colors));
      expect(new Set(names).size, `${p.name}: ${names.join(",")}`).toBe(6);
    }
  });

  it("표준 테마는 표준 이름", () => {
    expect(namesFor(PRESETS[0].colors)).toEqual({ W: "흰색", Y: "노란색", G: "초록색", B: "파란색", R: "빨간색", O: "주황색" });
  });

  it("비슷한 색은 경고", () => {
    const c = { ...PRESETS[0].colors, O: "#dc2a2a" }; // 주황 역할을 빨강과 거의 같게
    expect(similarPairs(c).length).toBeGreaterThan(0);
  });
});
