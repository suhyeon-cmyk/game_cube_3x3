// 색 이름에 기대지 않는 스캔 처리:
// - 면은 "가운데 칸의 실제 색(Lab)"으로 구분한다 (빨강·주황이 비슷한 큐브도 무늬까지 비교해 구분)
// - 6면이 모이면 54칸을 6개 센터 색으로 묶고, 묶음마다 실제 색과 이름을 정한다

import { Color, STANDARD_COLOR_NAMES } from "../cube/state";
import { COLOR_HEX } from "../ui/colors";
import { rotateGrid } from "./assemble";
import { DEFAULT_REFS, Lab, RGB, classify, clusterByAnchors, colorNameKo, labDistance, rgbToLab, vividHex } from "./color";

export interface ScannedFace {
  /** 카메라에 보인 순서의 9칸 색 */
  labs: Lab[];
  rgbs: RGB[];
}

/**
 * 두 번 본 같은 면인지.
 * - 센터 색이 아주 가까우면 같은 면 (한 큐브에 같은 센터 색은 없다)
 * - 센터 색이 꽤 비슷하면(빨강/주황 등) 9칸 무늬까지 비교 (방향은 4가지 모두)
 */
export function isSameFace(a: ScannedFace, b: ScannedFace): boolean {
  const dc = labDistance(a.labs[4], b.labs[4]);
  if (dc < 8) return true;
  if (dc > 24) return false;
  for (let k = 0; k < 4; k++) {
    const rb = rotateGrid(b.labs, k);
    const mean = a.labs.reduce((s, l, i) => s + labDistance(l, rb[i]), 0) / 9;
    if (mean < 14) return true;
  }
  return false;
}

export function findSameFace(face: ScannedFace, saved: readonly ScannedFace[]): number {
  return saved.findIndex((s) => isSameFace(face, s));
}

export interface FaceClusters {
  /** grids[g]: g번째로 스캔한 면의 9칸 묶음 번호 (가운데 = g) */
  grids: number[][];
  confidence: number[][];
  /** 묶음마다 평균 색 */
  means: Lab[];
  rgbMeans: RGB[];
}

/** 6면 54칸을 각 면 센터 색을 앵커로 묶는다 (묶음 g = g번째 면의 센터 색) */
export function clusterFaces(faces: readonly ScannedFace[]): FaceClusters {
  const labs = faces.flatMap((f) => f.labs);
  const rgbs = faces.flatMap((f) => f.rgbs);
  const res = clusterByAnchors(
    labs,
    faces.map((_, g) => g * 9 + 4),
  );
  const sum = faces.map(() => [0, 0, 0, 0]);
  res.labels.forEach((g, i) => {
    sum[g][0] += rgbs[i][0];
    sum[g][1] += rgbs[i][1];
    sum[g][2] += rgbs[i][2];
    sum[g][3]++;
  });
  return {
    grids: faces.map((_, g) => res.labels.slice(g * 9, g * 9 + 9)),
    confidence: faces.map((_, g) => res.confidence.slice(g * 9, g * 9 + 9)),
    means: res.means,
    rgbMeans: sum.map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]] as RGB),
  };
}

export interface ScanPalette {
  /** 앱 내부 색 → 화면에 그릴 색 */
  palette: Record<Color, string>;
  /** 앱 내부 색 → 이름 */
  names: Record<Color, string>;
  /** 표준 6색과 다른 색이 있는지 */
  custom: boolean;
  /** 묶음 번호 → 화면 색 (전개도용) */
  labelHex: string[];
}

/**
 * 묶음마다 화면 색과 이름을 정한다.
 * 표준 색과 충분히 비슷하면(같은 역할의 표준 색이 가장 가까움) 표준 색·이름을 그대로 쓰고,
 * 아니면 실제로 찍힌 색을 또렷하게 보정해 쓴다.
 */
export function paletteFor(colorOf: readonly Color[], means: readonly Lab[], rgbMeans: readonly RGB[]): ScanPalette {
  const palette = { ...COLOR_HEX };
  const names = { ...STANDARD_COLOR_NAMES } as Record<Color, string>;
  const labelHex: string[] = [];
  let custom = false;
  const customLabels: number[] = [];
  colorOf.forEach((c, g) => {
    const near = classify(means[g], DEFAULT_REFS);
    const standard = near.color === c && labDistance(means[g], DEFAULT_REFS[c]) < 30;
    if (standard) {
      palette[c] = COLOR_HEX[c];
      names[c] = STANDARD_COLOR_NAMES[c];
    } else {
      custom = true;
      customLabels.push(g);
      palette[c] = vividHex(rgbMeans[g]);
      names[c] = colorNameKo(rgbMeans[g]);
    }
    labelHex[g] = palette[c];
  });
  // 이름이 겹치면 밝기로 구분 (진한 / 연한), 셋 이상이면 번호
  const byName = new Map<string, number[]>();
  colorOf.forEach((c, g) => byName.set(names[c], [...(byName.get(names[c]) ?? []), g]));
  byName.forEach((gs, name) => {
    if (gs.length < 2) return;
    const sorted = gs.slice().sort((a, b) => means[a][0] - means[b][0]);
    sorted.forEach((g, i) => {
      names[colorOf[g]] = gs.length === 2 ? `${i === 0 ? "진한" : "연한"} ${name}` : `${name}${i + 1}`;
    });
    custom = true;
  });
  return { palette, names, custom, labelHex };
}

/** 표준 색으로 직접 입력할 때 쓰는 묶음 정보 (묶음 g = 표준 면 순서 U R F D L B 의 색) */
export function standardLabelInfo(order: readonly Color[]): { means: Lab[]; rgbMeans: RGB[] } {
  const rgbMeans = order.map((c) => {
    const h = COLOR_HEX[c];
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as RGB;
  });
  return { means: order.map((c) => DEFAULT_REFS[c] ?? rgbToLab(rgbMeans[0])), rgbMeans };
}
