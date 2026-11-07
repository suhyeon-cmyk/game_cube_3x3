import { describe, expect, it } from "vitest";
import { Color } from "../cube/state";
import { rotateGrid } from "./assemble";
import { DEFAULT_REFS, classify } from "./color";
import { PixelBuffer, detectFace } from "./frame";

const BASE: Record<Color, [number, number, number]> = {
  W: [215, 220, 225],
  Y: [215, 195, 45],
  G: [40, 160, 90],
  B: [35, 85, 190],
  R: [195, 40, 50],
  O: [240, 115, 40],
};
const COLORS: Color[] = ["W", "Y", "G", "B", "R", "O"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

interface Scene {
  cells: Color[];
  scale: number; // 영역 대비 면 한 변
  dx: number;
  dy: number;
  angle: number; // 라디안
  gap: [number, number, number]; // 칸 사이 색
  background: [number, number, number];
  moire: number;
  noise: number;
}

/** 카메라가 본 것 같은 128x128 이미지 (가이드 주변 영역) */
function render(sc: Scene, r: () => number, N = 128): PixelBuffer {
  const data = new Uint8ClampedArray(N * N * 4);
  const side = N * sc.scale;
  const cx = N / 2 + sc.dx * N;
  const cy = N / 2 + sc.dy * N;
  const cos = Math.cos(-sc.angle);
  const sin = Math.sin(-sc.angle);
  const SS = 3; // 픽셀당 3x3 슈퍼샘플 (카메라의 흐림 비슷하게)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const acc = [0, 0, 0];
      for (let a = 0; a < SS; a++) {
        for (let b = 0; b < SS; b++) {
          const x = i + (a + 0.5) / SS;
          const y = j + (b + 0.5) / SS;
          const ddx = x - cx;
          const ddy = y - cy;
          const u = (ddx * cos - ddy * sin) / side + 0.5;
          const v = (ddx * sin + ddy * cos) / side + 0.5;
          let c = sc.background;
          if (u >= 0 && u < 1 && v >= 0 && v < 1) {
            const gx = Math.floor(u * 3);
            const gy = Math.floor(v * 3);
            const lu = u * 3 - gx;
            const lv = v * 3 - gy;
            c = lu < 0.07 || lu > 0.93 || lv < 0.07 || lv > 0.93 ? sc.gap : BASE[sc.cells[gy * 3 + gx]];
          }
          for (let ch = 0; ch < 3; ch++) acc[ch] += c[ch];
        }
      }
      const shade = 1 + sc.moire * Math.sin((i * 0.93 + j * 0.37) * 2.1) * Math.sin(j * 1.7);
      const o = (j * N + i) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = (acc[ch] / (SS * SS)) * shade + (r() - 0.5) * sc.noise;
      data[o + 3] = 255;
    }
  }
  return { data, width: N, height: N };
}

function randomScene(r: () => number, hard: boolean): Scene {
  return {
    cells: Array.from({ length: 9 }, () => COLORS[Math.floor(r() * 6)]),
    scale: 0.5 + r() * 0.38,
    dx: (r() - 0.5) * 0.12,
    dy: (r() - 0.5) * 0.12,
    angle: ((r() - 0.5) * (hard ? 16 : 4) * Math.PI) / 180,
    gap: hard ? [50, 52, 56] : [20, 20, 22],
    background: r() < 0.5 ? [235, 236, 240] : [120, 110, 100],
    moire: hard ? 0.07 : 0,
    noise: hard ? 22 : 8,
  };
}

describe("detectFace", () => {
  for (const hard of [false, true]) {
    it(`${hard ? "어려운" : "쉬운"} 장면: 위치·크기·기울기가 달라도 면을 찾고 색을 맞게 읽는다`, () => {
      const r = rng(hard ? 41 : 17);
      const N = 60;
      let correct = 0;
      const fails: string[] = [];
      for (let n = 0; n < N; n++) {
        const sc = randomScene(r, hard);
        const det = detectFace(render(sc, r));
        const got = det.cells.map((c) => classify(c.lab, DEFAULT_REFS).color);
        const ok = det.ok && [0, 1, 2, 3].some((k) => rotateGrid(sc.cells, k).join("") === got.join(""));
        if (ok) correct++;
        else
          fails.push(
            `scale=${sc.scale.toFixed(2)} angle=${((sc.angle * 180) / Math.PI).toFixed(1)}° → ${det.ok ? "ok" : det.reason} grid=${det.gridContrast.toFixed(0)} got=${got.join("")} want=${sc.cells.join("")}`,
          );
      }
      // 프레임 하나하나가 아니라 여러 프레임 투표로 저장하므로, 프레임 단위로 90% 이상이면 충분하다
      expect(correct / N, fails.slice(0, 6).join("\n")).toBeGreaterThanOrEqual(0.9);
    }, 60_000);
  }

  it("빈 벽·배경만 있으면 면으로 인식하지 않는다", () => {
    const r = rng(5);
    for (let n = 0; n < 10; n++) {
      const N = 128;
      const data = new Uint8ClampedArray(N * N * 4);
      const base = [100 + r() * 140, 100 + r() * 140, 100 + r() * 140];
      for (let i = 0; i < N * N; i++) {
        for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = base[ch] + (r() - 0.5) * 16;
        data[i * 4 + 3] = 255;
      }
      expect(detectFace({ data, width: N, height: N }).ok).toBe(false);
    }
  });
});
