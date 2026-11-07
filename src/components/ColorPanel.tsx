"use client";

import { useEffect, useRef } from "react";
import { COLOR_NAMES_KO, Color } from "@/lib/cube/state";
import { btn, card, muted } from "@/lib/ui/classes";
import { BODY_HEX, BodyColor, PRESETS, ROLE_ORDER, namesFor, similarPairs } from "@/lib/ui/palettes";
import { useCubeStore } from "@/store/cubeStore";

/** 처음(맞춰진) 상태에서 그 색이 있는 면 */
const ROLE_FACE: Record<Color, string> = { Y: "위(U)", G: "앞(F)", O: "오른쪽(R)", W: "아래(D)", R: "왼쪽(L)", B: "뒤(B)" };

const BODIES: { id: BodyColor; label: string }[] = [
  { id: "black", label: "검정" },
  { id: "white", label: "흰색" },
  { id: "gray", label: "회색" },
];

/** 테마 미리보기: 큐브 한 귀퉁이처럼 3면 */
function Swatch({ colors, body }: { colors: Record<Color, string>; body: BodyColor }) {
  return (
    <span className="grid grid-cols-3 gap-[2px] rounded-md p-[3px]" style={{ background: BODY_HEX[body].normal }}>
      {ROLE_ORDER.map((c) => (
        <span key={c} className="h-4 w-4 rounded-[3px]" style={{ background: colors[c] }} />
      ))}
    </span>
  );
}

export function ColorPanel({ onClose }: { onClose: () => void }) {
  const palette = useCubeStore((s) => s.palette);
  const paletteId = useCubeStore((s) => s.paletteId);
  const body = useCubeStore((s) => s.bodyColor);
  const scanned = useCubeStore((s) => s.scannedPalette);
  const { setPalette, setBodyColor } = useCubeStore.getState();
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 로 닫기, 열리면 패널에 초점
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const similar = similarPairs(palette);
  const names = namesFor(palette);

  const themes = [
    ...PRESETS.map((p) => ({ id: p.id, name: p.name, colors: p.colors, body: p.body, names: undefined as Record<Color, string> | undefined })),
    ...(scanned ? [{ id: "scan", name: "스캔한 색", colors: scanned.colors, body, names: scanned.names }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="큐브 색 바꾸기"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88svh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">큐브 색 바꾸기</h2>
          <button className={btn.secondary + " px-3"} onClick={onClose}>
            닫기
          </button>
        </div>

        <section className={`${card} p-3`}>
          <div className="mb-2 text-sm font-semibold">테마</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {themes.map((t) => {
              const selected = paletteId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setPalette(t.colors, t.id, t.names);
                    if (t.id !== "scan") setBodyColor(t.body);
                  }}
                  aria-pressed={selected}
                  className={
                    "flex min-h-14 items-center gap-2 rounded-xl border p-2 text-left text-sm transition-colors " +
                    (selected
                      ? "border-rose-400 bg-rose-50 ring-2 ring-rose-300 dark:border-rose-500 dark:bg-rose-950/30 dark:ring-rose-800"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800")
                  }
                >
                  <Swatch colors={t.colors} body={t.id === "scan" ? body : t.body} />
                  <span className="font-medium">{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={`${card} p-3`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">면마다 직접 고르기</span>
            {paletteId === "custom" && <span className={`text-xs ${muted}`}>직접 고른 색</span>}
          </div>
          <p className={`mt-1 text-xs ${muted}`}>맞춰진 상태에서 그 색이 있는 면 기준이에요. 섞어도 색의 역할은 같아요.</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROLE_ORDER.map((c) => (
              <li key={c}>
                <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-2 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <input
                    type="color"
                    value={palette[c]}
                    onChange={(e) => setPalette({ ...palette, [c]: e.target.value }, "custom")}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
                    aria-label={`${ROLE_FACE[c]} 면 색 고르기`}
                  />
                  <span className="min-w-0 text-xs leading-tight">
                    <span className="block font-medium">{ROLE_FACE[c]}</span>
                    <span className={`block truncate ${muted}`}>{names[c]}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {similar.length > 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠ {similar.map(([a, b]) => `${COLOR_NAMES_KO[a]}·${COLOR_NAMES_KO[b]}`).join(", ")} 이(가) 서로 비슷해서 구분하기 어려워요.
            </p>
          )}
        </section>

        <section className={`${card} p-3`}>
          <div className="mb-2 text-sm font-semibold">큐브 몸체</div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="radiogroup" aria-label="큐브 몸체 색">
            {BODIES.map((b) => (
              <button
                key={b.id}
                role="radio"
                aria-checked={body === b.id}
                onClick={() => setBodyColor(b.id)}
                className={
                  "flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors " +
                  (body === b.id ? "bg-white shadow-sm dark:bg-zinc-600" : "text-zinc-600 dark:text-zinc-400")
                }
              >
                <span className="h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: BODY_HEX[b.id].normal }} />
                {b.label}
              </button>
            ))}
          </div>
        </section>

        <p className={`text-xs ${muted}`}>고른 색은 이 브라우저에 저장돼요. 안내 문구의 색 이름도 같이 바뀌어요.</p>
      </div>
    </div>
  );
}
