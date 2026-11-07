// 카메라 프레임의 관심 영역(가이드 주변)에서 큐브 한 면(3x3)을 찾는다.
// 면이 가이드와 딱 맞지 않아도 되도록, 크기·위치 후보 수백 개를 적분 영상(합 테이블)으로
// 빠르게 평가해 "칸 안은 균일하고, 칸 사이 경계는 어두운" 정사각형을 고른다.

import { Lab, RGB, rgbToLab } from "./color";

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CellSample {
  rgb: RGB;
  lab: Lab;
  /** 칸 안 밝기 표준편차. 크면 손가락·반사광·경계가 섞인 것 */
  spread: number;
}

export interface FaceBox {
  /** 면 중심 (버퍼 기준 0~1 좌표, 원본 이미지 기준) */
  cx: number;
  cy: number;
  /** 한 변 길이 (0~1) */
  size: number;
  /** 화면에서 면이 기울어진 각도 (라디안, 시계 방향 +) */
  angle: number;
}

export interface FaceDetection {
  ok: boolean;
  reason?: "occluded" | "no-grid" | "too-dark";
  box: FaceBox;
  cells: CellSample[];
  /** 칸 평균 밝기 - 경계선 밝기 (클수록 경계가 뚜렷) */
  gridContrast: number;
  /** 칸 밝기 표준편차의 최댓값 */
  maxSpread: number;
}

/** (W+1)x(H+1) 적분 영상 */
class Integral {
  readonly w: number;
  readonly r: Float64Array;
  readonly g: Float64Array;
  readonly b: Float64Array;
  readonly l: Float64Array;
  readonly l2: Float64Array;
  constructor(buf: PixelBuffer) {
    const { data, width: W, height: H } = buf;
    const w = W + 1;
    this.w = w;
    const n = w * (H + 1);
    this.r = new Float64Array(n);
    this.g = new Float64Array(n);
    this.b = new Float64Array(n);
    this.l = new Float64Array(n);
    this.l2 = new Float64Array(n);
    for (let y = 0; y < H; y++) {
      let sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        sr += r; sg += g; sb += b; sl += l; sl2 += l * l;
        const k = (y + 1) * w + (x + 1);
        const up = y * w + (x + 1);
        this.r[k] = this.r[up] + sr;
        this.g[k] = this.g[up] + sg;
        this.b[k] = this.b[up] + sb;
        this.l[k] = this.l[up] + sl;
        this.l2[k] = this.l2[up] + sl2;
      }
    }
  }
  private sum(a: Float64Array, x0: number, y0: number, x1: number, y1: number) {
    const w = this.w;
    return a[y1 * w + x1] - a[y0 * w + x1] - a[y1 * w + x0] + a[y0 * w + x0];
  }
  /** 정수 픽셀 사각형 [x0,x1) x [y0,y1) 의 평균 색 / 밝기 / 밝기 분산 */
  stats(x0: number, y0: number, x1: number, y1: number) {
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    x1 = Math.max(x0 + 1, Math.round(x1));
    y1 = Math.max(y0 + 1, Math.round(y1));
    const n = (x1 - x0) * (y1 - y0);
    const l = this.sum(this.l, x0, y0, x1, y1) / n;
    return {
      r: this.sum(this.r, x0, y0, x1, y1) / n,
      g: this.sum(this.g, x0, y0, x1, y1) / n,
      b: this.sum(this.b, x0, y0, x1, y1) / n,
      l,
      v: Math.max(0, this.sum(this.l2, x0, y0, x1, y1) / n - l * l),
    };
  }
}

interface Candidate {
  x: number;
  y: number;
  s: number;
}

/**
 * bandFrac: 경계 띠 두께 (칸 크기 대비). 1차 탐색은 후보 간격이 넓어 경계가 띠에서 벗어나기 쉬우므로
 * 두꺼운 띠(경계가 조금 어긋나도 걸림), 2차 탐색은 얇은 띠(정확한 위치)로 잰다.
 */
function evaluate(I: Integral, c: Candidate, bandFrac = 0.12, edgeFrac = 0.06) {
  const cs = c.s / 3;
  let sumStd = 0;
  let maxStd = 0;
  let sumL = 0;
  const cells: { r: number; g: number; b: number; l: number; std: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // 칸 가운데 50% (스티커 가장자리 제외)
      const x0 = c.x + col * cs + cs * 0.25;
      const y0 = c.y + row * cs + cs * 0.25;
      const st = I.stats(x0, y0, x0 + cs * 0.5, y0 + cs * 0.5);
      const std = Math.sqrt(st.v);
      sumStd += std;
      maxStd = Math.max(maxStd, std);
      sumL += st.l;
      cells.push({ r: st.r, g: st.g, b: st.b, l: st.l, std });
    }
  }
  // 이웃한 두 칸 사이 경계 12개를 하나씩: 경계가 양쪽 칸 평균보다 어두워야 한다.
  // (평균으로 보면 일부가 배경에 걸친 어긋난 정사각형도 통과해 버린다 → 가장 약한 경계로 판단)
  const t = Math.max(1, cs * bandFrac);
  const L = (row: number, col: number) => cells[row * 3 + col].l;
  const inner: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      const xv = c.x + (col + 1) * cs;
      const y0 = c.y + row * cs + cs * 0.2;
      const band = I.stats(xv - t / 2, y0, xv + t / 2, y0 + cs * 0.6).l;
      inner.push((L(row, col) + L(row, col + 1)) / 2 - band);
    }
  }
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const yh = c.y + (row + 1) * cs;
      const x0 = c.x + col * cs + cs * 0.2;
      const band = I.stats(x0, yh - t / 2, x0 + cs * 0.6, yh + t / 2).l;
      inner.push((L(row, col) + L(row + 1, col)) / 2 - band);
    }
  }
  // 면 바깥 테두리 12구간 (큐브 몸체/스티커 틈): 바로 안쪽 칸보다 어두워야 한다
  const e = Math.max(1, cs * edgeFrac);
  const outer: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = k * cs + cs * 0.2;
    const b = a + cs * 0.6;
    outer.push(L(0, k) - I.stats(c.x + a, c.y, c.x + b, c.y + e).l); // 위
    outer.push(L(2, k) - I.stats(c.x + a, c.y + c.s - e, c.x + b, c.y + c.s).l); // 아래
    outer.push(L(k, 0) - I.stats(c.x, c.y + a, c.x + e, c.y + b).l); // 왼쪽
    outer.push(L(k, 2) - I.stats(c.x + c.s - e, c.y + a, c.x + c.s, c.y + b).l); // 오른쪽
  }
  // 가장 약한 것 하나는 봐준다 (반사광·그림자 한 군데)
  const weakest = (xs: number[]) => xs.slice().sort((p, q) => p - q)[1];
  const meanL = sumL / 9;
  return { cells, avgStd: sumStd / 9, maxStd, gridContrast: weakest(inner), outerContrast: weakest(outer), meanL };
}

/**
 * buf: 가이드 주변 영역을 정사각형으로 잘라 줄인 이미지.
 * requireGrid=false 는 칸 사이 검은 경계가 없는(스티커리스) 큐브용.
 */
/**
 * 면의 기울기 추정: 밝기 경계의 방향을 모아 90° 대칭을 접어서(각도 × 4) 평균낸다.
 * 큐브 면의 격자선은 서로 수직이라 하나의 각도로 모인다. 결과는 -45°~45°.
 */
export function estimateAngle(buf: PixelBuffer): number {
  const { data, width: W, height: H } = buf;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let C = 0;
  let S = 0;
  // 가장자리 10%는 제외 (모니터 테두리 등 바깥 물체)
  const m = Math.round(W * 0.1);
  for (let y = m; y < H - m; y++) {
    for (let x = m; x < W - m; x++) {
      const gx = lum[y * W + x + 1] - lum[y * W + x - 1];
      const gy = lum[(y + 1) * W + x] - lum[(y - 1) * W + x];
      const w = gx * gx + gy * gy;
      if (w < 400) continue; // 약한 경계(잡음)는 무시
      const phi = Math.atan2(gy, gx);
      C += w * Math.cos(4 * phi);
      S += w * Math.sin(4 * phi);
    }
  }
  return Math.atan2(S, C) / 4;
}

/** 중심 기준으로 angle 만큼 기울어진 내용을 바로 세운 이미지 (쌍선형 보간) */
function deskew(buf: PixelBuffer, angle: number): PixelBuffer {
  const { data, width: W, height: H } = buf;
  const out = new Uint8ClampedArray(W * H * 4);
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.min(W - 1.001, Math.max(0, cx + dx * cos - dy * sin));
      const sy = Math.min(H - 1.001, Math.max(0, cy + dx * sin + dy * cos));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const a = data[(y0 * W + x0) * 4 + ch];
        const b = data[(y0 * W + x0 + 1) * 4 + ch];
        const c = data[((y0 + 1) * W + x0) * 4 + ch];
        const d = data[((y0 + 1) * W + x0 + 1) * 4 + ch];
        out[o + ch] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

export function detectFace(input: PixelBuffer, { requireGrid = true } = {}): FaceDetection {
  // 기울어진 면도 찾을 수 있게 먼저 바로 세운다 (1° 미만이면 그대로)
  const angle = requireGrid ? estimateAngle(input) : 0;
  const buf = Math.abs(angle) > (1 * Math.PI) / 180 ? deskew(input, angle) : input;
  const I = new Integral(buf);
  const N = Math.min(buf.width, buf.height);
  let best: { c: Candidate; e: ReturnType<typeof evaluate>; score: number } | null = null;
  let coarse = true;
  const consider = (x: number, y: number, s: number) => {
    if (s < N * 0.3 || s > N) return;
    x = Math.max(0, Math.min(N - s, x));
    y = Math.max(0, Math.min(N - s, y));
    const c = { x, y, s };
    const e = coarse ? evaluate(I, c, 0.4, 0.16) : evaluate(I, c);
    // 균일할수록, 칸 사이·바깥 테두리가 어두울수록 좋음.
    // 크기 보너스는 작게 (경계가 없는 스티커리스 큐브에서 칸 하나 안의 작은 정사각형을 고르지 않게 하는 정도)
    const grid = requireGrid ? Math.max(-40, Math.min(e.gridContrast, 90)) : 0;
    const edge = requireGrid ? Math.max(-40, Math.min(e.outerContrast, 90)) : 0;
    const score = e.avgStd + e.maxStd * 0.5 - grid * 0.6 - edge * 0.35 - (s / N) * (requireGrid ? 3 : 12);
    if (!best || score < best.score) best = { c, e, score };
  };
  // 1차: 면 크기 영역의 40%~100%, 위치 가운데 기준 ±20%
  for (let sf = 0.4; sf <= 1.0001; sf += 0.05) {
    const s = N * sf;
    const span = Math.min(N * 0.2, (N - s) / 2);
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) consider((N - s) / 2 + (i / 4) * span, (N - s) / 2 + (j / 4) * span, s);
    }
  }
  // 2차: 가장 좋은 후보 주변을 촘촘하게 (경계선 위치를 정확히 맞추기 위해)
  coarse = false;
  const coarseBest = best!.c;
  best = null;
  consider(coarseBest.x, coarseBest.y, coarseBest.s);
  for (let pass = 0; pass < 2; pass++) {
    const b0 = best!.c;
    const step = pass === 0 ? N * 0.02 : N * 0.007;
    for (let ds = -3; ds <= 3; ds++) {
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) consider(b0.x + i * step - (ds * step) / 2, b0.y + j * step - (ds * step) / 2, b0.s + ds * step);
      }
    }
  }
  const { c, e } = best!;
  const cells: CellSample[] = e.cells.map((x) => {
    const rgb: RGB = [x.r, x.g, x.b];
    return { rgb, lab: rgbToLab(rgb), spread: x.std };
  });
  // 바로 세운 이미지의 면 중심 → 원본 이미지 좌표
  const half = (N - 1) / 2;
  const px = c.x + c.s / 2 - half;
  const py = c.y + c.s / 2 - half;
  const box: FaceBox = {
    cx: (half + px * Math.cos(angle) - py * Math.sin(angle)) / N,
    cy: (half + px * Math.sin(angle) + py * Math.cos(angle)) / N,
    size: c.s / N,
    angle,
  };
  let reason: FaceDetection["reason"];
  if (e.meanL < 35) reason = "too-dark";
  else if (e.maxStd > 32) reason = "occluded";
  else if (requireGrid && (e.gridContrast < 15 || e.outerContrast < 6)) reason = "no-grid";
  return { ok: !reason, reason, box, cells, gridContrast: e.gridContrast, maxSpread: e.maxStd };
}
