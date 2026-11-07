import { FaceName, Vec3 } from "../cube/geometry";
import { Move, MoveFace } from "../cube/moves";
import { COLOR_NAMES_KO, CubeState, centerColor } from "../cube/state";

const FACE_KO: Record<FaceName, string> = {
  R: "오른쪽 면",
  L: "왼쪽 면",
  U: "윗면",
  D: "아랫면",
  F: "앞면",
  B: "뒷면",
};

/** 회전 방향 화살표를 그릴 기준 면의 바깥 방향 (이 방향에서 봤을 때 amount=1 이 시계 방향) */
export const MOVE_VIEW_NORMAL: Record<MoveFace, Vec3> = {
  R: [1, 0, 0],
  L: [-1, 0, 0],
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  M: [-1, 0, 0],
  E: [0, -1, 0],
  S: [0, 0, 1],
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

const amountKo = (m: Move) =>
  m.amount === 2 ? "두 번(180°)" : m.amount === 1 ? "시계 방향으로 한 번" : "반시계 방향으로 한 번";

/** 한 수를 사람이 읽는 문장으로 */
export function describeMove(m: Move, state: CubeState): string {
  const color = (f: FaceName) => COLOR_NAMES_KO[centerColor(state, f)];
  switch (m.face) {
    case "R":
    case "L":
    case "U":
    case "D":
    case "F":
    case "B":
      return `${FACE_KO[m.face]}(${m.face}, ${color(m.face)} 센터)을 ${amountKo(m)} 돌리세요.`;
    case "M":
      return `가운데 세로층(M)을 왼쪽 면(L)과 같은 방향으로 ${m.amount === 2 ? "두 번" : m.amount === 1 ? "한 번(앞면이 아래로)" : "한 번(앞면이 위로)"} 돌리세요.`;
    case "E":
      return `가운데 가로층(E)을 아랫면(D)과 같은 방향으로 ${m.amount === 2 ? "두 번" : m.amount === 1 ? "한 번(앞면이 오른쪽으로)" : "한 번(앞면이 왼쪽으로)"} 돌리세요.`;
    case "S":
      return `가운데 앞뒤층(S)을 앞면(F)과 같은 방향으로 ${m.amount === 2 ? "두 번" : "한 번"} 돌리세요.`;
    case "y":
      if (m.amount === 2) return `큐브 전체를 반 바퀴 돌려 ${color("B")} 면이 앞으로 오게 잡으세요. (y2)`;
      return m.amount === 1
        ? `큐브 전체를 왼쪽으로 돌려 ${color("R")} 면이 앞으로 오게 잡으세요. (y)`
        : `큐브 전체를 오른쪽으로 돌려 ${color("L")} 면이 앞으로 오게 잡으세요. (y')`;
    case "x":
      if (m.amount === 2) return `큐브 전체를 앞뒤로 반 바퀴 굴려 ${color("D")} 면이 위로 오게 잡으세요. (x2)`;
      return m.amount === 1
        ? `큐브 전체를 위쪽으로 굴려 ${color("F")} 면이 위로 오게 잡으세요. (x)`
        : `큐브 전체를 아래쪽으로 굴려 ${color("B")} 면이 위로 오게 잡으세요. (x')`;
    case "z":
      if (m.amount === 2) return `큐브 전체를 옆으로 반 바퀴 돌려 ${color("D")} 면이 위로 오게 잡으세요. (z2)`;
      return m.amount === 1
        ? `큐브 전체를 오른쪽으로 기울여 ${color("L")} 면이 위로 오게 잡으세요. (z)`
        : `큐브 전체를 왼쪽으로 기울여 ${color("R")} 면이 위로 오게 잡으세요. (z')`;
  }
}
