import { afterEach, expect, it } from "vitest";
import { localizeColorWords, setColorNames } from "./state";

afterEach(() => setColorNames(null));

it("표준 색이면 문구 그대로", () => {
  expect(localizeColorWords("흰색 십자 · 노란 면")).toBe("흰색 십자 · 노란 면");
});

it("스캔한 색 이름으로 바꾸고, 이름이 서로 겹쳐도 두 번 바뀌지 않는다", () => {
  setColorNames({ W: "노란색", Y: "분홍색" });
  expect(localizeColorWords("흰색 십자 · 노란 면 · 노란색 코너")).toBe("노란색 십자 · 분홍 면 · 분홍색 코너");
});
