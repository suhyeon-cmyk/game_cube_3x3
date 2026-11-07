"use client";

import { useEffect, useRef } from "react";
import { Move, moveToString } from "@/lib/cube/moves";

interface Props {
  moves: readonly Move[];
  /** 강조할 수의 위치. 그 앞은 흐리게 표시 */
  active?: number;
  /** 한 줄로 두고 가로 스크롤 (현재 수가 보이도록 자동 스크롤) */
  nowrap?: boolean;
}

export function MoveSequence({ moves, active, nowrap }: Props) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // 페이지는 움직이지 않고 이 줄만 가로로 스크롤한다
    const box = boxRef.current;
    const el = activeRef.current;
    if (!nowrap || !box || !el) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [active, nowrap]);
  return (
    <span
      ref={boxRef}
      className={
        "font-mono text-sm " +
        (nowrap ? "no-scrollbar relative flex gap-1 overflow-x-auto whitespace-nowrap" : "inline-flex flex-wrap gap-1")
      }
    >
      {moves.map((m, i) => {
        const state = active === undefined ? "idle" : i < active ? "done" : i === active ? "active" : "todo";
        return (
          <span
            key={i}
            ref={state === "active" ? activeRef : undefined}
            className={
              "shrink-0 rounded-md px-1.5 py-0.5 " +
              (state === "active"
                ? "bg-rose-500 font-semibold text-white"
                : state === "done"
                  ? "text-zinc-400 line-through decoration-zinc-300 dark:text-zinc-600 dark:decoration-zinc-700"
                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100")
            }
          >
            {moveToString(m)}
          </span>
        );
      })}
    </span>
  );
}
