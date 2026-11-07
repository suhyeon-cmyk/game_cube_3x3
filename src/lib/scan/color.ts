// 스티커 색 인식: RGB → CIE-Lab, 기준색(센터)과의 거리로 분류.
// 조명에 따라 절대값이 크게 변하므로, 스캔이 끝나면 6개 센터 색을 앵커로 54칸을 다시 묶는다(각 색 9칸).

import { Color } from "../cube/state";

export type Lab = [number, number, number];
export type RGB = [number, number, number];

export const COLORS: readonly Color[] = ["W", "Y", "G", "B", "R", "O"];

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // D65
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * 두 색의 거리. 밝기(L)는 조명/그림자에 따라 크게 흔들리므로 가중치를 낮추고,
 * 흰색/노란색(b*), 빨간색/주황색(a*, b* 비율) 구분에 중요한 색도 성분을 살린다.
 */
export function labDistance(a: Lab, b: Lab): number {
  const dL = (a[0] - b[0]) * 0.45;
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** 일반적인 실내 조명에서의 스티커 색 (센터를 스캔하기 전 임시 기준) */
export const DEFAULT_REFS: Record<Color, Lab> = {
  W: rgbToLab([225, 228, 230]),
  Y: rgbToLab([225, 205, 40]),
  G: rgbToLab([30, 150, 75]),
  B: rgbToLab([25, 75, 180]),
  R: rgbToLab([185, 30, 40]),
  O: rgbToLab([235, 105, 30]),
};

export function classify(lab: Lab, refs: Record<Color, Lab>): { color: Color; margin: number } {
  let best: Color = "W";
  let d1 = Infinity;
  let d2 = Infinity;
  for (const c of COLORS) {
    const d = labDistance(lab, refs[c]);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      best = c;
    } else if (d < d2) {
      d2 = d;
    }
  }
  return { color: best, margin: d2 - d1 };
}

export interface ClusterResult {
  colors: Color[];
  /** 0~1, 낮을수록 애매함 (두 번째로 가까운 색과의 차이) */
  confidence: number[];
}

export interface LabelClusterResult {
  /** 칸마다 묶인 앵커 번호 (0 ~ anchors.length-1) */
  labels: number[];
  /** 0~1, 낮을수록 애매함 */
  confidence: number[];
  /** 묶음마다 평균 색 */
  means: Lab[];
}

/**
 * 칸들을 앵커(센터 칸) 개수만큼의 묶음으로 나눈다. 색 이름은 쓰지 않는다 — 큐브 색이 무엇이든 동작.
 * - 앵커 칸은 자기 묶음으로 고정
 * - 묶음마다 정확히 perGroup 칸 (탐욕 배정: 가장 가까운 (칸, 묶음) 쌍부터)
 * - 배정 결과로 묶음 평균을 다시 구해 몇 번 반복 (K-means 비슷하게)
 */
export function clusterByAnchors(labs: Lab[], anchors: number[], perGroup = 9): LabelClusterResult {
  const n = labs.length;
  const k = anchors.length;
  let means: Lab[] = anchors.map((i) => labs[i]);
  let labels: number[] = new Array(n).fill(-1);
  for (let iter = 0; iter < 6; iter++) {
    const next: number[] = new Array(n).fill(-1);
    const count = new Array(k).fill(0);
    anchors.forEach((i, g) => {
      next[i] = g;
      count[g]++;
    });
    const pairs: { i: number; g: number; d: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (next[i] >= 0) continue;
      for (let g = 0; g < k; g++) pairs.push({ i, g, d: labDistance(labs[i], means[g]) });
    }
    pairs.sort((a, b) => a.d - b.d);
    for (const { i, g } of pairs) {
      if (next[i] >= 0 || count[g] >= perGroup) continue;
      next[i] = g;
      count[g]++;
    }
    labels = next;
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    labs.forEach((l, i) => {
      const s = sum[labels[i]];
      s[0] += l[0];
      s[1] += l[1];
      s[2] += l[2];
      s[3]++;
    });
    means = sum.map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]] as Lab);
  }
  const confidence = labs.map((l, i) => {
    const own = labDistance(l, means[labels[i]]);
    let other = Infinity;
    for (let g = 0; g < k; g++) if (g !== labels[i]) other = Math.min(other, labDistance(l, means[g]));
    return Math.max(0, Math.min(1, (other - own) / Math.max(other, 1e-6)));
  });
  return { labels, confidence, means };
}

/** 표준 6색 이름으로 묶기 (센터 색 → 그 색). 표준 색 큐브 전용 */
export function clusterBalanced(labs: Lab[], centerIndex: Record<Color, number>): ClusterResult {
  const res = clusterByAnchors(labs, COLORS.map((c) => centerIndex[c]));
  return { colors: res.labels.map((g) => COLORS[g]), confidence: res.confidence };
}

// ---------------------------------------------------------------------------
// 인식한 색을 화면에 쓸 색과 이름으로

const toHex = (rgb: RGB) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** 카메라로 찍힌 칙칙한 색을 화면용으로 또렷하게 (채도·밝기 보정) */
export function vividHex(rgb: RGB): string {
  const [h, s, v] = rgbToHsv(rgb);
  if (s < 0.15) return toHex(hsvToRgb(h, s * 0.5, Math.min(0.97, Math.max(v * 1.15, 0.85)))); // 흰색/회색 계열
  return toHex(hsvToRgb(h, Math.min(1, s * 1.15 + 0.05), Math.min(0.98, Math.max(v * 1.1, 0.6))));
}

/** 색 이름 (한국어). 같은 이름이 겹치면 호출하는 쪽에서 구분한다 */
export function colorNameKo(rgb: RGB): string {
  const [h, s, v] = rgbToHsv(rgb);
  if (s < 0.18) return v > 0.7 ? "흰색" : v > 0.3 ? "회색" : "검은색";
  if (v < 0.25) return "검은색";
  if (h < 12 || h >= 340) return "빨간색";
  if (h < 45 && v < 0.65) return "갈색";
  if (h < 38) return "주황색";
  if (h < 68) return "노란색";
  if (h < 95) return "연두색";
  if (h < 160) return "초록색";
  if (h < 190) return "청록색";
  if (h < 215) return "하늘색";
  if (h < 255) return "파란색";
  if (h < 290) return "보라색";
  return "분홍색";
}
