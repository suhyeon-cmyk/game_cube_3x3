import { describe, expect, it } from "vitest";
import { rotateGrid } from "./assemble";
import { Lab, RGB, rgbToLab } from "./color";
import { ScannedFace, clusterFaces, isSameFace, paletteFor } from "./identify";

const face = (rgbs: RGB[]): ScannedFace => ({ rgbs, labs: rgbs.map(rgbToLab) });
const RED: RGB = [185, 35, 45];
const ORANGE: RGB = [225, 90, 35]; // 어두운 조명에서 빨강과 가까워진 주황
const W: RGB = [220, 222, 225];
const B: RGB = [30, 80, 180];
const G: RGB = [35, 150, 80];

describe("isSameFace", () => {
  it("같은 면을 다른 방향으로 다시 보여주면 같은 면", () => {
    const a = face([W, B, G, RED, RED, W, B, G, W]);
    const b = face(rotateGrid(a.rgbs, 1).map((c) => c.map((v) => v * 0.95) as RGB));
    expect(isSameFace(a, b)).toBe(true);
  });
  it("센터 색이 비슷해도(빨강/주황) 무늬가 다르면 다른 면", () => {
    const a = face([W, B, G, RED, RED, W, B, G, W]);
    const b = face([G, G, W, B, ORANGE, B, W, RED, G]);
    expect(isSameFace(a, b)).toBe(false);
  });
});

describe("paletteFor", () => {
  it("표준 색은 표준 이름, 아닌 색은 찍힌 색 이름을 쓴다", () => {
    const means: Lab[] = [
      rgbToLab([225, 205, 40]), // 노랑 역할 → 표준
      rgbToLab([240, 120, 180]), // 주황 역할인데 분홍
      rgbToLab([30, 150, 75]),
      rgbToLab([225, 228, 230]),
      rgbToLab([185, 30, 40]),
      rgbToLab([25, 75, 180]),
    ];
    const rgbMeans: RGB[] = [[225, 205, 40], [240, 120, 180], [30, 150, 75], [225, 228, 230], [185, 30, 40], [25, 75, 180]];
    const p = paletteFor(["Y", "O", "G", "W", "R", "B"], means, rgbMeans);
    expect(p.custom).toBe(true);
    expect(p.names.Y).toBe("노란색");
    expect(p.names.O).toBe("분홍색");
  });
});

describe("clusterFaces", () => {
  it("묶음 번호 g = g번째로 스캔한 면의 센터 색", () => {
    const cols: RGB[] = [[140, 60, 200], [240, 120, 180], [20, 170, 170], [250, 220, 150], [150, 90, 40], [150, 220, 50]];
    const faces = cols.map((c, g) => face(Array.from({ length: 9 }, (_, i) => (i === 4 ? c : cols[(g + i) % 6]))));
    const res = clusterFaces(faces);
    res.grids.forEach((gr, g) => expect(gr[4]).toBe(g));
    const counts = new Array(6).fill(0);
    res.grids.flat().forEach((x) => counts[x]++);
    expect(counts.every((n) => n === 9)).toBe(true);
  });
});
