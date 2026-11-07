"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FACE_NAMES, FaceName } from "@/lib/cube/geometry";
import { Color, SOLVED_FACE_COLORS } from "@/lib/cube/state";
import { assembleLabels, rotateGrid } from "@/lib/scan/assemble";
import { Lab, RGB, colorNameKo, labDistance, vividHex } from "@/lib/scan/color";
import { FaceBox, FaceDetection, detectFace } from "@/lib/scan/frame";
import { ScannedFace, clusterFaces, findSameFace, paletteFor, standardLabelInfo } from "@/lib/scan/identify";
import { btn, card, muted } from "@/lib/ui/classes";
import { useCubeStore } from "@/store/cubeStore";

/** 권장 위치 가이드가 카메라 화면(정사각형으로 자른 영역)에서 차지하는 비율 */
const GUIDE = 0.62;
/** 면을 찾는 영역 (가이드보다 넉넉하게) */
const SEARCH = 0.88;
/** 최근 VOTE_WINDOW 프레임 중 VOTE_MIN 번 이상 면을 찾고, 그동안 칸 색이 흔들리지 않으면 저장 (약 0.4초) */
const VOTE_WINDOW = 12;
const VOTE_MIN = 8;
/** 저장할 때 칸 색이 이 거리 안에서만 흔들려야 한다 */
const STABLE_SPREAD = 14;
const SAMPLE_SIZE = 128;

type Phase = "camera" | "review";

const FACE_LABEL: Record<FaceName, string> = { U: "위", D: "아래", F: "앞", B: "뒤", R: "오른쪽", L: "왼쪽" };
const hexOf = (rgb: RGB) => vividHex(rgb);

/** 전개도에 쓰는 묶음 정보 */
interface ReviewData {
  /** grids[g]: 가운데가 묶음 g 인 면의 9칸 묶음 번호 (-1 = 모름) */
  grids: number[][];
  confidence: number[][] | null;
  means: Lab[];
  rgbMeans: RGB[];
  labelHex: string[];
  labelName: string[];
}

export function CubeScanner({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("camera");
  const [faces, setFaces] = useState<ScannedFace[]>([]);
  const [review, setReview] = useState<ReviewData | null>(null);

  // 스캔 화면이 떠 있는 동안 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const finalize = useCallback((all: ScannedFace[]) => {
    // 54칸을 6개 센터의 실제 색으로 묶는다 (색 이름 없이)
    const c = clusterFaces(all);
    setReview({
      grids: c.grids,
      confidence: c.confidence,
      means: c.means,
      rgbMeans: c.rgbMeans,
      labelHex: c.rgbMeans.map(hexOf),
      labelName: c.rgbMeans.map(colorNameKo),
    });
    setPhase("review");
  }, []);

  const onFaceScanned = useCallback(
    (face: ScannedFace) => {
      setFaces((prev) => {
        if (prev.length >= 6 || findSameFace(face, prev) >= 0) return prev;
        const next = [...prev, face];
        if (next.length === 6) setTimeout(() => finalize(next), 0);
        return next;
      });
    },
    [finalize],
  );

  const startManual = () => {
    // 직접 입력: 표준 6색 (묶음 g = 표준 면 순서의 색)
    const order = FACE_NAMES.map((f) => SOLVED_FACE_COLORS[f]);
    const { means, rgbMeans } = standardLabelInfo(order);
    setReview({
      grids: order.map((_, g) => Array.from({ length: 9 }, (_, i) => (i === 4 ? g : -1))),
      confidence: null,
      means,
      rgbMeans,
      labelHex: rgbMeans.map((rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("")),
      labelName: rgbMeans.map(colorNameKo),
    });
    setPhase("review");
  };

  const rescanFace = (index: number) => {
    setFaces((prev) => prev.filter((_, i) => i !== index));
    setPhase("camera");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="큐브 스캔">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-lg font-bold">{phase === "camera" ? "카메라로 큐브 스캔" : "스캔 결과 확인"}</h2>
        <button className={btn.secondary + " px-3"} onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {phase === "camera" ? (
          <CameraStep faces={faces} onFaceScanned={onFaceScanned} onRemove={rescanFace} onManual={startManual} />
        ) : (
          review && (
            <ReviewStep
              data={review}
              setData={setReview}
              canRescan={faces.length === 6}
              onRescanFace={rescanFace}
              onRescanAll={() => {
                setFaces([]);
                setPhase("camera");
              }}
              onImport={(state, colorOf) => {
                const p = paletteFor(colorOf, review.means, review.rgbMeans);
                useCubeStore.getState().loadCube(state, p.custom ? { palette: p.palette, names: p.names } : {});
                onClose();
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1단계: 카메라

interface CameraStepProps {
  faces: ScannedFace[];
  onFaceScanned: (face: ScannedFace) => void;
  onRemove: (index: number) => void;
  onManual: () => void;
}

type LiveStatus = "starting" | "searching" | "occluded" | "no-grid" | "too-dark" | "stable" | "duplicate" | "saved";

function CameraStep({ faces, onFaceScanned, onRemove, onManual }: CameraStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirror, setMirror] = useState(false);
  const [live, setLive] = useState<{
    rgbs: RGB[] | null;
    status: LiveStatus;
    progress: number;
    duplicateOf?: number;
    box?: FaceBox | null;
    reason?: FaceDetection["reason"];
  }>({ rgbs: null, status: "starting", progress: 0 });
  const [stickerless, setStickerless] = useState(false);
  const facesRef = useRef(faces);
  const optsRef = useRef({ stickerless, onFaceScanned });
  useEffect(() => {
    facesRef.current = faces;
    optsRef.current = { stickerless, onFaceScanned };
  });

  // 카메라 열기
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError(
          "휴대폰 브라우저는 보안 연결(HTTPS)에서만 카메라를 열 수 있어요. PC에서 `npm run dev:https` 로 서버를 켜고 https:// 주소로 접속해 주세요. 지금은 아래 '직접 입력'을 쓸 수 있어요.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 카메라를 지원하지 않아요. '직접 입력'을 써 주세요.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
        setMirror(facing !== "environment");
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "카메라 권한이 거부됐어요. 브라우저 주소창의 권한 설정에서 카메라를 허용해 주세요."
            : name === "NotFoundError"
              ? "카메라를 찾을 수 없어요. '직접 입력'을 써 주세요."
              : "카메라를 열 수 없어요. 다른 앱이 카메라를 쓰고 있는지 확인해 주세요.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 프레임 분석 루프: 가이드 주변 영역만 128x128 로 (고품질 축소 → 모니터 줄무늬·잡음 완화)
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    let raf = 0;
    let frame = 0;
    let savedUntil = 0;
    // 최근 프레임들의 인식 결과. null = 면을 못 찾은 프레임
    const history: (ScannedFace | null)[] = [];
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (!ctx || !v || v.readyState < 2 || !v.videoWidth) return;
      frame++;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const side = Math.min(vw, vh) * SEARCH;
      ctx.drawImage(v, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const { stickerless: sl, onFaceScanned: save } = optsRef.current;
      const det = detectFace(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE), { requireGrid: !sl });
      const current: ScannedFace = { labs: det.cells.map((c) => c.lab), rgbs: det.cells.map((c) => c.rgb) };

      history.push(det.ok ? current : null);
      if (history.length > VOTE_WINDOW) history.shift();

      // 면을 찾은 프레임이 충분하고, 그 프레임들 사이에서 칸마다 색이 거의 그대로면 안정
      const found = history.filter((h): h is ScannedFace => h !== null);
      let averaged: ScannedFace | null = null;
      let stableCount = 0;
      if (found.length >= 2) {
        const recent = found.slice(-VOTE_MIN);
        const labs = Array.from({ length: 9 }, (_, i) => {
          const ls = recent.map((h) => h.labs[i]);
          return [0, 1, 2].map((k) => ls.reduce((s, l) => s + l[k], 0) / ls.length) as Lab;
        });
        const rgbs = Array.from({ length: 9 }, (_, i) => {
          const rs = recent.map((h) => h.rgbs[i]);
          return [0, 1, 2].map((k) => rs.reduce((s, r) => s + r[k], 0) / rs.length) as RGB;
        });
        const spread = Math.max(...recent.flatMap((h) => h.labs.map((l, i) => labDistance(l, labs[i]))));
        averaged = { labs, rgbs };
        stableCount = spread < STABLE_SPREAD ? recent.length : 0;
      }

      const dup = averaged ? findSameFace(averaged, facesRef.current) : -1;
      let status: LiveStatus;
      if (performance.now() < savedUntil) status = "saved";
      else if (!det.ok && found.length < VOTE_MIN) status = det.reason ?? "no-grid";
      else if (dup >= 0) status = "duplicate";
      else status = "stable";

      if (status === "stable" && averaged && stableCount >= VOTE_MIN && facesRef.current.length < 6) {
        save(averaged);
        navigator.vibrate?.(40);
        savedUntil = performance.now() + 1000;
        history.length = 0;
      }
      if (frame % 2 === 0) {
        setLive({
          // 이번 프레임에서 면을 못 찾았으면 그 위치(배경)를 그리지 않는다
          rgbs: det.ok ? current.rgbs : null,
          status,
          progress: status === "stable" ? stableCount : 0,
          duplicateOf: dup >= 0 ? dup : undefined,
          box: det.ok ? det.box : null,
          reason: det.reason,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const statusText: Record<LiveStatus, string> = {
    starting: "카메라를 여는 중…",
    searching: "아무 면이나 네모 안에 보여주세요",
    "no-grid": "큐브 한 면을 네모 안에 보여주세요 (칸 사이 검은 선이 보이게)",
    occluded: "칸 안이 얼룩덜룩해요 — 손가락·반사광·화면 줄무늬를 확인해 주세요",
    "too-dark": "너무 어두워요. 밝은 곳에서 보여주세요",
    stable: `인식 중… 그대로 잠깐만요 (${Math.min(live.progress, VOTE_MIN)}/${VOTE_MIN})`,
    duplicate: `${live.duplicateOf !== undefined ? live.duplicateOf + 1 : ""}번째로 저장한 면이에요. 다른 면을 보여주세요`,
    saved: "저장했어요! 큐브를 돌려 다음 면을 보여주세요",
  };

  // 감지한 면의 위치 (화면 좌표, 0~1). 탐색 영역은 화면 가운데 SEARCH 비율 정사각형
  // 좌우 반전 화면이면 중심 x와 기울기 방향도 반전
  const inset = (1 - SEARCH) / 2;
  const box = live.box
    ? (() => {
        const w = live.box.size * SEARCH;
        const cx = inset + live.box.cx * SEARCH;
        const cy = inset + live.box.cy * SEARCH;
        return { cx: mirror ? 1 - cx : cx, cy, size: w, angle: mirror ? -live.box.angle : live.box.angle };
      })()
    : null;

  return (
    <>
      <div className="relative mx-auto aspect-square w-full max-w-[480px] overflow-hidden rounded-2xl bg-black">
        {error ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm leading-6 text-white">{error}</div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
              style={mirror ? { transform: "scaleX(-1)" } : undefined}
            />
            {/* 권장 위치 가이드 */}
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-dashed border-white/60"
              style={{ inset: `${((1 - GUIDE) / 2) * 100}%` }}
            />
            {/* 감지한 면 + 칸마다 찍힌 색 */}
            {box && (
              <div
                className={
                  "pointer-events-none absolute grid grid-cols-3 grid-rows-3 rounded-lg border-[3px] transition-all duration-100 " +
                  (live.status === "saved"
                    ? "border-emerald-400"
                    : live.status === "stable"
                      ? "border-amber-300"
                      : live.status === "duplicate"
                        ? "border-sky-300"
                        : "border-white/80")
                }
                style={{
                  left: `${(box.cx - box.size / 2) * 100}%`,
                  top: `${(box.cy - box.size / 2) * 100}%`,
                  width: `${box.size * 100}%`,
                  height: `${box.size * 100}%`,
                  transform: `rotate(${box.angle}rad)`,
                }}
              >
                {Array.from({ length: 9 }, (_, i) => {
                  // 화면을 좌우 반전해서 보여주면 칸 위치도 반전
                  const src = mirror ? Math.floor(i / 3) * 3 + (2 - (i % 3)) : i;
                  const rgb = live.rgbs?.[src];
                  return (
                    <div key={i} className="flex items-center justify-center">
                      {rgb && (
                        <span className="h-[36%] w-[36%] rounded-full border-2 border-white shadow" style={{ background: hexOf(rgb) }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/65 px-3 py-2 text-center text-sm font-medium text-white">
              {statusText[live.status]}
            </div>
          </>
        )}
      </div>

      <div className={`${card} p-3`}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">스캔한 면</span>
          <span className={muted}>{faces.length} / 6</span>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }, (_, i) => {
            const f = faces[i];
            return (
              <button
                key={i}
                disabled={!f}
                onClick={() => onRemove(i)}
                title={f ? "눌러서 이 면 지우고 다시 스캔" : undefined}
                className={
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] " +
                  (f ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "border-dashed border-zinc-300 dark:border-zinc-600")
                }
              >
                {f ? (
                  <>
                    <span className="h-5 w-5 rounded-md border border-black/15" style={{ background: hexOf(f.rgbs[4]) }} />
                    {colorNameKo(f.rgbs[4]).replace("색", "")}
                  </>
                ) : (
                  <span className={muted}>?</span>
                )}
              </button>
            );
          })}
        </div>
        <p className={`mt-2 text-xs ${muted}`}>
          가운데 칸의 실제 색으로 면을 구분해요. 표준 색이 아닌 큐브도 괜찮아요. 저장된 면을 누르면 지우고 다시 스캔해요.
        </p>
      </div>

      <ul className={`${card} flex flex-col gap-1 p-3 text-xs leading-5 ${muted}`}>
        <li>· 면을 네모 안에, 카메라와 평행하게 보여주세요. 면의 방향(위아래)과 순서는 상관없어요.</li>
        <li>· 밝은 곳에서, 스티커에 빛이 반사되지 않게 해 주세요. 비슷한 색(흰/노랑, 빨강/주황)은 조명이 고를수록 잘 구분돼요.</li>
        <li>· 손가락이 스티커를 가리지 않게 큐브 모서리를 잡아 주세요.</li>
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={stickerless} onChange={(e) => setStickerless(e.target.checked)} className="h-4 w-4" />
          스티커 없는(검은 테두리 없는) 큐브
        </label>
        <button className={btn.secondary + " ml-auto"} onClick={onManual}>
          직접 입력
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2단계: 결과 확인 · 수정

/** 전개도 배치 (4열 × 3행) */
const NET: (FaceName | null)[][] = [
  [null, "U", null, null],
  ["L", "F", "R", "B"],
  [null, "D", null, null],
];

interface ReviewStepProps {
  data: ReviewData;
  setData: (d: ReviewData) => void;
  canRescan: boolean;
  onRescanFace: (index: number) => void;
  onRescanAll: () => void;
  onImport: (state: string, colorOf: Color[]) => void;
}

function ReviewStep({ data, setData, canRescan, onRescanFace, onRescanAll, onImport }: ReviewStepProps) {
  const assembly = useMemo(() => assembleLabels(data.grids, data.means), [data.grids, data.means]);
  const counts = useMemo(() => {
    const c = new Array(6).fill(0);
    data.grids.forEach((g) => g.forEach((x) => x >= 0 && c[x]++));
    return c;
  }, [data.grids]);
  const unknown = data.grids.reduce((n, g) => n + g.filter((x) => x < 0).length, 0);

  /** 조립됐으면 전개도 위치(면 이름)마다 표시할 묶음 칸과 그 칸의 확신도 */
  const net = useMemo(() => {
    if (!assembly) return null;
    const out = {} as Record<FaceName, { label: number; cells: number[]; conf: number[] | null }>;
    FACE_NAMES.forEach((f, fi) => {
      const cells = [...assembly.state.slice(fi * 9, fi * 9 + 9)].map((c) => assembly.colorOf.indexOf(c as Color));
      const label = cells[4];
      let conf: number[] | null = null;
      if (data.confidence) {
        const k = [0, 1, 2, 3].find((k) => rotateGrid(data.grids[label], k).join(",") === cells.join(","));
        if (k !== undefined) conf = rotateGrid(data.confidence[label], k);
      }
      out[f] = { label, cells, conf };
    });
    return out;
  }, [assembly, data.grids, data.confidence]);

  const cycle = (label: number, i: number, shown: number[] | null) => {
    // 전개도에 보이는 방향 그대로 저장한 뒤 칸을 바꾼다 (다음 조립은 이 방향에서 시작)
    const grids = data.grids.map((g) => g.slice());
    const conf = data.confidence?.map((c) => c.slice()) ?? null;
    if (shown) {
      const k = [0, 1, 2, 3].find((k) => rotateGrid(data.grids[label], k).join(",") === shown.join(","));
      if (k !== undefined) {
        grids[label] = shown.slice();
        if (conf) conf[label] = rotateGrid(conf[label], k);
      }
    }
    grids[label][i] = (grids[label][i] + 1) % 6;
    if (conf) conf[label][i] = 1;
    setData({ ...data, grids, confidence: conf });
  };

  const renderFace = (label: number, cells: number[], conf: number[] | null, title: string, shown: number[] | null, key: string) => (
    <div key={key} className="flex flex-col gap-1">
      <div className="grid grid-cols-3 gap-[2px] rounded-md bg-zinc-900 p-[3px]">
        {cells.map((x, i) => (
          <button
            key={i}
            disabled={i === 4}
            onClick={() => cycle(label, i, shown)}
            aria-label={`${title} ${i + 1}번 칸: ${x < 0 ? "모름" : data.labelName[x]}. 눌러서 색 바꾸기`}
            className={"aspect-square rounded-[3px] " + (conf && conf[i] < 0.22 ? "ring-2 ring-amber-400" : "")}
            style={{ background: x < 0 ? "#52525b" : data.labelHex[x] }}
          >
            {x < 0 && <span className="text-xs font-bold text-white">?</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-1 text-[10px]">
        <span className={muted}>{title}</span>
        {canRescan && (
          <button className="rounded px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => onRescanFace(label)} title="이 면만 다시 스캔">
            📷
          </button>
        )}
      </div>
    </div>
  );

  const problems: string[] = [];
  if (unknown > 0) problems.push(`아직 정하지 않은 칸이 ${unknown}개 있어요.`);
  counts.forEach((n, g) => {
    if (n !== 9 && unknown === 0) problems.push(`${data.labelName[g]} 칸이 ${n}개예요 (9개여야 해요).`);
  });
  if (!assembly && problems.length === 0)
    problems.push("이 색 배치로는 실제 큐브를 만들 수 없어요. 노란 테두리(인식이 애매한 칸)부터 확인해 주세요.");

  return (
    <>
      <div className={`${card} p-3`}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={muted}>인식한 색</span>
          {data.labelHex.map((h, g) => (
            <span key={g} className="flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">
              <span className="h-3 w-3 rounded-sm border border-black/15" style={{ background: h }} />
              {data.labelName[g]}
              <span className={counts[g] === 9 ? muted : "font-semibold text-rose-600 dark:text-rose-400"}>{counts[g]}</span>
            </span>
          ))}
        </div>
        {net ? (
          <div className="grid grid-cols-4 gap-1.5">
            {NET.flatMap((row, r) =>
              row.map((f, c) =>
                f ? (
                  renderFace(net[f].label, net[f].cells, net[f].conf, `${f} ${FACE_LABEL[f]}`, net[f].cells, `${r}-${c}`)
                ) : (
                  <div key={`${r}-${c}`} />
                ),
              ),
            )}
          </div>
        ) : (
          // 아직 조립이 안 됐으면 면이 어디인지 모르므로 스캔한 순서대로
          <div className="grid grid-cols-3 gap-2">
            {data.grids.map((g, label) => renderFace(label, g, data.confidence?.[label] ?? null, `${label + 1}번째 면`, null, `f${label}`))}
          </div>
        )}
        <p className={`mt-3 text-xs leading-5 ${muted}`}>
          칸을 누르면 인식한 색 중 다음 색으로 바뀌어요. <span className="text-amber-600 dark:text-amber-400">노란 테두리</span> = 인식이 애매한 칸.
          {canRescan && " 📷 로 그 면만 다시 찍을 수 있어요."}
        </p>
      </div>

      <div className={`${card} p-3 text-sm`}>
        {assembly ? (
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">✓ 실제로 만들 수 있는 큐브예요. 면 배치도 찾았어요.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {problems.slice(0, 5).map((m) => (
              <li key={m} className="text-rose-600 dark:text-rose-400">
                · {m}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btn.secondary} onClick={onRescanAll}>
          처음부터 다시 스캔
        </button>
        <button className={btn.primary + " flex-1"} disabled={!assembly} onClick={() => assembly && onImport(assembly.state, assembly.colorOf)}>
          이 큐브 불러오기
        </button>
      </div>
    </>
  );
}
