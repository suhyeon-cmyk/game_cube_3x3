// 큐브 색 테마. 앱 내부 색 글자(W, Y, …)는 "면의 역할"이고, 테마는 그 역할에 어떤 색을 칠할지 정한다.

import { Color, STANDARD_COLOR_NAMES } from "../cube/state";
import { RGB, colorNameKo, labDistance, rgbToLab } from "../scan/color";
import { COLOR_HEX } from "./colors";

export type BodyColor = "black" | "white" | "gray";

export const BODY_HEX: Record<BodyColor, { normal: string; dimmedLight: string; dimmedDark: string }> = {
  black: { normal: "#111111", dimmedLight: "#52525b", dimmedDark: "#18181b" },
  white: { normal: "#e7e5e4", dimmedLight: "#d6d3d1", dimmedDark: "#57534e" },
  gray: { normal: "#52525b", dimmedLight: "#a1a1aa", dimmedDark: "#3f3f46" },
};

export interface PalettePreset {
  id: string;
  name: string;
  colors: Record<Color, string>;
  body: BodyColor;
}

export const PRESETS: readonly PalettePreset[] = [
  { id: "standard", name: "표준", colors: { ...COLOR_HEX }, body: "black" },
  {
    id: "candy",
    name: "캔디",
    colors: { W: "#ffffff", Y: "#ffd60a", G: "#2ec4b6", B: "#3a86ff", R: "#ff006e", O: "#fb5607" },
    body: "black",
  },
  {
    id: "neon",
    name: "네온",
    colors: { W: "#f5f5f5", Y: "#e6ff00", G: "#00ff85", B: "#00b3ff", R: "#ff2d55", O: "#ff9f00" },
    body: "black",
  },
  {
    id: "pastel",
    name: "파스텔",
    colors: { W: "#fbf7ef", Y: "#fde68a", G: "#86efac", B: "#93c5fd", R: "#fca5a5", O: "#fdba74" },
    body: "white",
  },
  {
    id: "earth",
    name: "어스톤",
    colors: { W: "#efe6d8", Y: "#d9a441", G: "#6b8f47", B: "#3d5a80", R: "#a4403a", O: "#c97b3d" },
    body: "gray",
  },
  {
    // Okabe–Ito 팔레트 기반: 적록 색각 이상에서도 구분되도록
    id: "colorblind",
    name: "색약 친화",
    colors: { W: "#ffffff", Y: "#f0e442", G: "#009e73", B: "#0072b2", R: "#cc79a7", O: "#e69f00" },
    body: "black",
  },
];

export const ROLE_ORDER: readonly Color[] = ["Y", "G", "O", "W", "R", "B"]; // 처음 상태의 위·앞·오른쪽·아래·왼쪽·뒤

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const isStandardPalette = (colors: Record<Color, string>) =>
  (Object.keys(COLOR_HEX) as Color[]).every((c) => colors[c].toLowerCase() === COLOR_HEX[c].toLowerCase());

/**
 * 테마 색으로 화면 문구용 이름을 정한다. 표준 색이면 표준 이름,
 * 아니면 색에서 이름을 추정하고, 같은 이름이 겹치면 "진한/연한"(셋 이상이면 번호)으로 구분한다.
 */
export function namesFor(colors: Record<Color, string>): Record<Color, string> {
  const roles = Object.keys(colors) as Color[];
  const names = {} as Record<Color, string>;
  for (const c of roles) {
    names[c] = colors[c].toLowerCase() === COLOR_HEX[c].toLowerCase() ? STANDARD_COLOR_NAMES[c] : colorNameKo(hexToRgb(colors[c]));
  }
  const groups = new Map<string, Color[]>();
  roles.forEach((c) => groups.set(names[c], [...(groups.get(names[c]) ?? []), c]));
  groups.forEach((cs, name) => {
    if (cs.length < 2) return;
    const sorted = cs.slice().sort((a, b) => rgbToLab(hexToRgb(colors[a]))[0] - rgbToLab(hexToRgb(colors[b]))[0]);
    sorted.forEach((c, i) => (names[c] = cs.length === 2 ? `${i === 0 ? "진한" : "연한"} ${name}` : `${name}${i + 1}`));
  });
  return names;
}

/** 서로 너무 비슷해서 구분하기 어려운 색 쌍 */
export function similarPairs(colors: Record<Color, string>, threshold = 16): [Color, Color][] {
  const roles = Object.keys(colors) as Color[];
  const labs = Object.fromEntries(roles.map((c) => [c, rgbToLab(hexToRgb(colors[c]))])) as Record<Color, ReturnType<typeof rgbToLab>>;
  const out: [Color, Color][] = [];
  for (let i = 0; i < roles.length; i++)
    for (let j = i + 1; j < roles.length; j++) if (labDistance(labs[roles[i]], labs[roles[j]]) < threshold) out.push([roles[i], roles[j]]);
  return out;
}
