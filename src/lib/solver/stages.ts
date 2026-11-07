import { FACE_NORMALS, SLOTS, vecEq } from "../cube/geometry";
import { parseMoves, Move } from "../cube/moves";
import { Color, CubeState, findPiece, faceOfColor, homeSlot, isSolved } from "../cube/state";

export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const STAGE_IDS: readonly StageId[] = [1, 2, 3, 4, 5, 6, 7];

export interface Algorithm {
  id: string;
  name: string;
  text: string;
  moves: Move[];
}

export interface StageInfo {
  id: StageId;
  title: string;
  goal: string;
  algorithms: Algorithm[];
  tips: string[];
}

const alg = (id: string, name: string, text: string): Algorithm => ({
  id,
  name,
  text,
  moves: parseMoves(text),
});

export const ALGS = {
  sexy: alg("sexy", "코너 넣기", "R U R' U'"),
  rightInsert: alg("right", "오른쪽에 넣기", "U R U' R' U' F' U F"),
  leftInsert: alg("left", "왼쪽에 넣기", "U' L' U L U F U' F'"),
  cross: alg("oll-cross", "노란 십자", "F R U R' U' F'"),
  sune: alg("sune", "노란 면", "R U R' U R U2 R'"),
  // 사이트 공식(U R U' L' U R' U' L)은 코너 방향을 틀어 5단계 노란 면을 깨뜨리므로,
  // 노란 면을 유지하는 A-perm(오른쪽 앞 코너 고정)을 쓴다.
  cornerCycle: alg("corner", "코너 위치 바꾸기", "L F' L B2 L' F L B2 L2"),
  edgeCw: alg("edge-cw", "엣지 시계 방향", "R U' R U R U R U' R' U' R2"),
  edgeCcw: alg("edge-ccw", "엣지 반시계 방향", "R2 U R U R' U' R' U' R' U R'"),
};

export const STAGES: readonly StageInfo[] = [
  {
    id: 1,
    title: "흰색 십자",
    goal: "아랫면에 흰색 십자를 만들고, 엣지 옆면 색을 센터와 맞춥니다.",
    algorithms: [],
    tips: [
      "공식 없이 직관으로 맞춥니다.",
      "엣지가 윗층에 있으면 옆면 색을 센터에 맞춘 뒤 그 면을 두 번 돌립니다.",
    ],
  },
  {
    id: 2,
    title: "흰색 코너",
    goal: "흰색 코너 4개를 넣어 1층을 완성합니다.",
    algorithms: [ALGS.sexy],
    tips: ["코너를 들어갈 자리 바로 위(오른쪽 앞 위)에 놓고 공식을 1, 3, 5번 반복합니다."],
  },
  {
    id: 3,
    title: "2층 엣지",
    goal: "노란색이 없는 엣지 4개를 중간층에 넣습니다.",
    algorithms: [ALGS.rightInsert, ALGS.leftInsert],
    tips: ["엣지 앞면 색을 앞 센터와 맞추고, 윗면 색이 있는 쪽으로 넣습니다."],
  },
  {
    id: 4,
    title: "노란 십자",
    goal: "윗면에 노란색 십자를 만듭니다.",
    algorithms: [ALGS.cross],
    tips: ["점 → L자 → 일자 → 십자 순서로 바뀝니다. L자는 왼쪽 뒤, 일자는 가로로 둡니다."],
  },
  {
    id: 5,
    title: "노란 면",
    goal: "노란 코너 방향을 맞춰 윗면 전체를 노란색으로 만듭니다.",
    algorithms: [ALGS.sune],
    tips: ["중간에 다른 부분이 흐트러져 보여도 정상입니다."],
  },
  {
    id: 6,
    title: "노란 코너 위치",
    goal: "노란 코너 4개를 제자리로 옮깁니다.",
    algorithms: [ALGS.cornerCycle],
    tips: [
      "이미 제자리에 있는 코너를 오른쪽 앞에 두고 실행합니다.",
      "사이트 공식(U R U' L' U R' U' L)은 노란 면을 깨뜨려서, 노란 면을 유지하는 공식으로 바꿨습니다.",
    ],
  },
  {
    id: 7,
    title: "노란 엣지 위치",
    goal: "마지막 층 엣지를 제자리로 옮겨 큐브를 완성합니다.",
    algorithms: [ALGS.edgeCw, ALGS.edgeCcw],
    tips: ["이미 맞은 엣지를 뒤에 두고, 나머지 세 엣지가 도는 방향에 맞는 공식을 씁니다."],
  },
];

export function stageInfo(id: StageId): StageInfo {
  return STAGES[id - 1];
}

// ---------------------------------------------------------------------------
// 조각 그룹과 완료 조건

const SIDES: Color[] = ["G", "O", "B", "R"]; // 앞 → 오른쪽 → 뒤 → 왼쪽 순서 (완성 상태 기준)
const pairs = SIDES.map((c, i) => [c, SIDES[(i + 1) % 4]] as const);

export const PIECES = {
  whiteEdges: SIDES.map((c) => ["W", c] as Color[]),
  whiteCorners: pairs.map(([a, b]) => ["W", a, b] as Color[]),
  middleEdges: pairs.map(([a, b]) => [a, b] as Color[]),
  yellowEdges: SIDES.map((c) => ["Y", c] as Color[]),
  yellowCorners: pairs.map(([a, b]) => ["Y", a, b] as Color[]),
};

/** 조각 하나에 대한 조건: track 색 스티커가 ok 슬롯 중 하나에 있어야 한다 */
export interface Constraint {
  colors: Color[];
  track: Color;
  ok: Uint8Array; // 길이 54, 1 = 허용
}

function solvedConstraint(state: CubeState, colors: Color[], track: Color = colors[0]): Constraint {
  const ok = new Uint8Array(54);
  ok[homeSlot(state, colors, track)] = 1;
  return { colors, track, ok };
}

function facingConstraint(state: CubeState, colors: Color[], track: Color): Constraint {
  const ok = new Uint8Array(54);
  const n = FACE_NORMALS[faceOfColor(state, track)];
  for (const s of SLOTS) if (vecEq(s.normal, n)) ok[s.index] = 1;
  return { colors, track, ok };
}

/** 해당 단계에서 새로 맞춰야 하는 조각 조건 */
export function stageOwnConstraints(state: CubeState, stage: StageId): Constraint[] {
  switch (stage) {
    case 1:
      return PIECES.whiteEdges.map((c) => solvedConstraint(state, c, "W"));
    case 2:
      return PIECES.whiteCorners.map((c) => solvedConstraint(state, c, "W"));
    case 3:
      return PIECES.middleEdges.map((c) => solvedConstraint(state, c));
    case 4:
      return PIECES.yellowEdges.map((c) => facingConstraint(state, c, "Y"));
    case 5:
      return PIECES.yellowCorners.map((c) => facingConstraint(state, c, "Y"));
    case 6:
      return PIECES.yellowCorners.map((c) => solvedConstraint(state, c, "Y"));
    case 7:
      return PIECES.yellowEdges.map((c) => solvedConstraint(state, c, "Y"));
  }
}

/**
 * 단계 k 완료에 필요한 전체 조건 (앞 단계 포함).
 * 같은 조각에 대한 조건은 뒤 단계 것이 더 엄격하므로 덮어쓴다.
 */
export function stageAllConstraints(state: CubeState, stage: StageId): Constraint[] {
  const byPiece = new Map<string, Constraint>();
  for (let s = 1; s <= stage; s++) {
    for (const c of stageOwnConstraints(state, s as StageId)) byPiece.set(c.colors.join(""), c);
  }
  return [...byPiece.values()];
}

export function trackedSlot(state: CubeState, colors: Color[], track: Color): number {
  return findPiece(state, colors).stickers.find((s) => s.color === track)!.slot;
}

export function constraintMet(state: CubeState, c: Constraint): boolean {
  return c.ok[trackedSlot(state, c.colors, c.track)] === 1;
}

/** 흰색 센터가 아래(D)에 있는지 */
export function isWhiteDown(state: CubeState): boolean {
  return faceOfColor(state, "W") === "D";
}

export function isStageDone(state: CubeState, stage: StageId): boolean {
  if (!isWhiteDown(state) && stage < 7) {
    // 잡는 방향이 다르면 1~6단계 판정은 의미가 없다 (7단계 = 완성은 방향 무관)
    return false;
  }
  return stageAllConstraints(state, stage).every((c) => constraintMet(state, c));
}

/** 아직 끝나지 않은 첫 단계. 모두 완료면 null */
export function currentStage(state: CubeState): StageId | null {
  if (isSolved(state)) return null;
  for (const s of STAGE_IDS) {
    if (!isStageDone(state, s)) return s;
  }
  return null;
}

export function stageProgress(state: CubeState, stage: StageId): { done: number; total: number } {
  const own = stageOwnConstraints(state, stage);
  return { done: own.filter((c) => constraintMet(state, c)).length, total: own.length };
}
