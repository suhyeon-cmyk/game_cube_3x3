"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { Axis, FACE_NAMES, FACE_NORMALS, POSITIONS, Position, SLOTS, Vec3, posKey, slotAt } from "@/lib/cube/geometry";
import { MOVE_DEFS, Move, MoveFace, quarterTurns } from "@/lib/cube/moves";
import { Color, CubeState, centerColor, findPiece } from "@/lib/cube/state";
import { MOVE_VIEW_NORMAL } from "@/lib/solver/hint";
import { BODY_HEX } from "@/lib/ui/palettes";
import { subscribeTheme } from "@/lib/ui/theme";
import { isBusy, moveDuration, planNextMove, useCubeStore } from "@/store/cubeStore";

// 강조하지 않는 조각은 배경 쪽 색으로 흐리게
const DIM = { light: new THREE.Color("#d4d4d8"), dark: new THREE.Color("#27272a") };
const DIM_AMOUNT = { light: 0.62, dark: 0.78 };
type Theme = "light" | "dark";
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
const useTheme = () => useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);

/** 기본 시점 방향과 거리 (화면 비율에 맞춰 거리를 늘린다) */
const VIEW_DIR = new THREE.Vector3(4.8, 4.4, 6.4).normalize();
const VIEW_DIST = 9.2;
const fitDistance = (aspect: number) => VIEW_DIST * Math.max(1, 1.08 / aspect);
const SPACING = 1.02;
const Z = new THREE.Vector3(0, 0, 1);

const quatFor = (n: Vec3) => new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(...n));
const SLOT_QUATS = SLOTS.map((s) => quatFor(s.normal));

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function inLayer(p: Position, m: Move): boolean {
  const def = MOVE_DEFS[m.face];
  return def.layer === null || p.pos[def.axis] === def.layer;
}

// ---------------------------------------------------------------------------

interface CubieProps {
  position: Position;
  cube: CubeState;
  dimmed: boolean;
  theme: Theme;
}

function Cubie({ position, cube, dimmed, theme }: CubieProps) {
  const palette = useCubeStore((s) => s.palette);
  const body = BODY_HEX[useCubeStore((s) => s.bodyColor)];
  const [x, y, z] = position.pos;
  return (
    <group position={[x * SPACING, y * SPACING, z * SPACING]}>
      <RoundedBox args={[0.98, 0.98, 0.98]} radius={0.08} smoothness={3}>
        <meshStandardMaterial color={dimmed ? (theme === "dark" ? body.dimmedDark : body.dimmedLight) : body.normal} roughness={0.6} />
      </RoundedBox>
      {position.slots.map((slot) => {
        const n = SLOTS[slot].normal;
        const color = new THREE.Color(palette[cube[slot] as Color]);
        if (dimmed) color.lerp(DIM[theme], DIM_AMOUNT[theme]);
        return (
          <mesh
            key={slot}
            position={[n[0] * 0.495, n[1] * 0.495, n[2] * 0.495]}
            quaternion={SLOT_QUATS[slot]}
          >
            <planeGeometry args={[0.84, 0.84]} />
            <meshStandardMaterial color={color} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------

/** 회전 방향 화살표: 돌릴 층을 둘러싸는 고리 */
function HintArrow({ move }: { move: Move }) {
  const def = MOVE_DEFS[move.face];
  const n = MOVE_VIEW_NORMAL[move.face];
  const cw = move.amount !== -1;
  const double = move.amount === 2;
  if (def.layer === null) {
    // 큐브 전체 회전: 큐브를 둘러싸는 보라색 고리
    return <Arc n={n} offset={0} radius={2.4} tube={0.05} head={0.2} cw={cw} double={double} color="#a855f7" />;
  }
  if (def.layer === 0) {
    // 가운데 층: 층을 둘러싸는 고리
    return <Arc n={n} offset={0} radius={2.15} tube={0.05} head={0.2} cw={cw} double={double} color="#f43f5e" />;
  }
  // 바깥 면: 항상 화살표 2개 — 면 위 화살표 + 돌아가는 층을 옆으로 둘러싼 고리
  // (어느 각도에서 봐도 둘 중 하나는 보이고, 옆 고리로 층이 어느 쪽으로 밀리는지 알 수 있다)
  return (
    <>
      <Arc n={n} offset={1.6} radius={0.95} tube={0.07} head={0.24} cw={cw} double={double} color="#f43f5e" />
      <Arc n={n} offset={SPACING} radius={2.15} tube={0.055} head={0.26} cw={cw} double={false} color="#f43f5e" />
    </>
  );
}

interface ArcProps {
  n: Vec3;
  offset: number;
  radius: number;
  tube: number;
  head: number;
  cw: boolean;
  double: boolean;
  color: string;
}

/** n 방향에서 봤을 때 cw 면 시계 방향으로 도는 원호 화살표 */
function Arc({ n, offset, radius, tube, head, cw, double, color }: ArcProps) {
  const arc = Math.PI * 1.5;
  // 화살촉은 끝에 1개. 180° 회전은 "×2" 표시로 구분한다
  const heads = [arc];
  const badgeAngle = arc / 2;
  return (
    <group position={[n[0] * offset, n[1] * offset, n[2] * offset]} quaternion={quatFor(n)}>
      <group scale={[1, cw ? -1 : 1, 1]} rotation={[0, 0, Math.PI / 4]}>
        <mesh>
          <torusGeometry args={[radius, tube, 8, 96, arc]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        {heads.map((a) => (
          <mesh key={a} position={[radius * Math.cos(a), radius * Math.sin(a), 0]} rotation={[0, 0, a]}>
            <coneGeometry args={[head * 0.75, head * 1.9, 16]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {double && (
          <Html position={[radius * Math.cos(badgeAngle), radius * Math.sin(badgeAngle), 0]} center zIndexRange={[20, 0]}>
            <span
              className="pointer-events-none rounded-full px-2 py-0.5 font-mono text-sm font-bold text-white shadow-md ring-2 ring-white"
              style={{ background: color }}
            >
              ×2
            </span>
          </Html>
        )}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------

function useHighlight(cube: CubeState): Set<string> | null {
  const mode = useCubeStore((s) => s.mode);
  const program = useCubeStore((s) => s.program);
  const plan = useCubeStore((s) => s.plan);
  const busy = useCubeStore(isBusy);
  return useMemo(() => {
    let targets: Color[][] | undefined;
    if (mode === "manual") targets = plan?.steps[0]?.targets;
    else if (busy && program) targets = program.steps[program.stepIndex]?.targets;
    if (!targets || targets.length === 0) return null;
    return new Set(targets.map((t) => posKey(findPiece(cube, t).pos)));
  }, [mode, program, plan, busy, cube]);
}

const DRAG_FACES: MoveFace[] = ["R", "L", "U", "D", "F", "B", "M", "E", "S"];

function CubeModel() {
  const cube = useCubeStore((s) => s.cube);
  const current = useCubeStore((s) => s.current);
  const mode = useCubeStore((s) => s.mode);
  const plan = useCubeStore((s) => s.plan);
  const busy = useCubeStore(isBusy);
  const highlight = useHighlight(cube);
  const rotRef = useRef<THREE.Group>(null);
  const anim = useRef({ id: -1, t: 0, done: false });
  const { camera, size, get } = useThree();
  const theme = useTheme();
  const viewResetToken = useCubeStore((s) => s.viewResetToken);

  // 시점 초기화 + 화면 비율에 맞춰 거리 조절 (세로로 긴 모바일 화면에서도 큐브가 잘리지 않게)
  useEffect(() => {
    camera.position.copy(VIEW_DIR).multiplyScalar(fitDistance(size.width / size.height));
    camera.lookAt(0, 0, 0);
    const c = get().controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (c) {
      c.target.set(0, 0, 0);
      c.update();
    }
  }, [viewResetToken, size.width, size.height, camera, get]);

  const setCursor = (c: string) => {
    get().gl.domElement.style.cursor = c;
  };
  const orbitControls = () => get().controls as unknown as { enabled: boolean } | null;
  const drag = useRef<{ slot: number; x: number; y: number; id: number; move: Move | null; far: boolean } | null>(null);
  const dragPreview = useCubeStore((s) => s.dragPreview);

  useFrame((_, dt) => {
    const store = useCubeStore.getState();
    const cur = store.current;
    if (!cur || !rotRef.current) return;
    const a = anim.current;
    if (a.id !== cur.id) Object.assign(a, { id: cur.id, t: 0, done: false });
    a.t = Math.min(1, a.t + dt / moveDuration(cur, store.speed));
    const angle = quarterTurns(cur.move) * (Math.PI / 2) * easeInOut(a.t);
    const axis = MOVE_DEFS[cur.move.face].axis;
    rotRef.current.rotation.set(axis === 0 ? angle : 0, axis === 1 ? angle : 0, axis === 2 ? angle : 0);
    if (a.t >= 1 && !a.done) {
      a.done = true;
      store.finishCurrent(cur.id);
    }
  });

  // 드래그로 면 돌리기
  // - 누르는 순간(캡처 단계, OrbitControls 보다 먼저) 큐브에 닿았는지 직접 판정해서 시점 회전을 막는다
  // - 움직이는 동안 "지금 놓으면 돌아갈 층"을 미리 보여주고, 손을 뗄 때 돌린다
  useEffect(() => {
    const canvas = get().gl.domElement;
    const store = () => useCubeStore.getState();
    const cancel = () => {
      if (!drag.current) return;
      drag.current = null;
      store().setDragPreview(null);
      setCursor("");
      const orbit = orbitControls();
      if (orbit) orbit.enabled = true;
    };
    const onDown = (e: PointerEvent) => {
      if (drag.current) {
        // 두 번째 손가락: 확대/축소 제스처로 보고 드래그 취소
        if (e.pointerId !== drag.current.id) cancel();
        return;
      }
      if (e.target !== canvas) return;
      const s = store();
      if (s.mode !== "manual" || isBusy(s)) return;
      const rect = canvas.getBoundingClientRect();
      const slot = pickSlot(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, camera);
      if (slot === null) return;
      const orbit = orbitControls();
      if (orbit) orbit.enabled = false;
      drag.current = { slot, x: e.clientX, y: e.clientY, id: e.pointerId, move: null, far: false };
      s.setDragPreview({ slot, move: null });
      setCursor("grabbing");
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) return;
      const rect = canvas.getBoundingClientRect();
      d.move = dragToMove(d.slot, dx, dy, camera, { width: rect.width, height: rect.height });
      d.far = dist >= 18;
      store().setDragPreview({ slot: d.slot, move: d.move });
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const m = d.far ? d.move : null;
      cancel();
      if (m) store().userMove(m);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  const canDrag = mode === "manual" && !busy;

  const moving: Position[] = [];
  const still: Position[] = [];
  for (const p of POSITIONS) (current && inLayer(p, current.move) ? moving : still).push(p);
  const render = (p: Position) => (
    <Cubie
      key={posKey(p.pos)}
      position={p}
      cube={cube}
      dimmed={highlight !== null && !highlight.has(posKey(p.pos))}
      theme={theme}
    />
  );

  const hint = mode === "manual" && !busy ? planNextMove(plan) : null;

  return (
    <>
      <group key={current?.id ?? "idle"} ref={rotRef}>
        {moving.map(render)}
      </group>
      <group
        onPointerOver={() => canDrag && !drag.current && setCursor("grab")}
        onPointerOut={() => !drag.current && setCursor("")}
      >
        {still.map(render)}
      </group>
      {hint && !dragPreview?.move && <HintArrow move={hint} />}
      {hint && !dragPreview && <TouchGuide move={hint} />}
      {dragPreview && <PressedSticker slot={dragPreview.slot} />}
      {dragPreview?.move && <LayerPreview move={dragPreview.move} />}
      <FaceLabels cube={cube} />
    </>
  );
}

const PICK_HALF = SPACING + 0.49;
const PICK_BOX = new THREE.Box3(
  new THREE.Vector3(-PICK_HALF, -PICK_HALF, -PICK_HALF),
  new THREE.Vector3(PICK_HALF, PICK_HALF, PICK_HALF),
);
const raycaster = new THREE.Raycaster();

/** 화면 좌표(캔버스 기준)에 있는 스티커 슬롯. 큐브 밖이면 null */
function pickSlot(x: number, y: number, w: number, h: number, camera: THREE.Camera): number | null {
  raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
  const hit = raycaster.ray.intersectBox(PICK_BOX, new THREE.Vector3());
  if (!hit) return null;
  const c = [hit.x, hit.y, hit.z];
  const abs = c.map(Math.abs);
  const nAxis = abs.indexOf(Math.max(...abs));
  const pos = c.map((v, i) =>
    i === nAxis ? Math.sign(v) : Math.max(-1, Math.min(1, Math.round(v / SPACING))),
  ) as unknown as Vec3;
  const normal = c.map((v, i) => (i === nAxis ? Math.sign(v) : 0)) as unknown as Vec3;
  return slotAt(pos, normal);
}

const stickerPoint = (slot: number) => {
  const s = SLOTS[slot];
  return new THREE.Vector3(...s.pos).multiplyScalar(SPACING).addScaledVector(new THREE.Vector3(...s.normal), 0.5);
};

/** 누르고 있는 스티커 표시 */
function PressedSticker({ slot }: { slot: number }) {
  const s = SLOTS[slot];
  const p = stickerPoint(slot).addScaledVector(new THREE.Vector3(...s.normal), 0.012);
  return (
    <mesh position={p} quaternion={SLOT_QUATS[slot]} renderOrder={3}>
      <ringGeometry args={[0.3, 0.42, 32]} />
      <meshBasicMaterial color="#f43f5e" transparent opacity={0.95} depthTest={false} />
    </mesh>
  );
}

/** 지금 손을 떼면 돌아갈 층: 반투명 판 + 테두리 */
function LayerPreview({ move }: { move: Move }) {
  const def = MOVE_DEFS[move.face];
  const size: [number, number, number] = [3.3, 3.3, 3.3];
  const center: [number, number, number] = [0, 0, 0];
  if (def.layer !== null) {
    size[def.axis] = 1.12;
    center[def.axis] = def.layer * SPACING;
  }
  return (
    <mesh position={center} renderOrder={2}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#f43f5e" transparent opacity={0.2} depthWrite={false} />
      <Edges color="#f43f5e" lineWidth={3} />
    </mesh>
  );
}

/**
 * 어디를 눌러서 어느 쪽으로 밀면 되는지 안내.
 * 돌릴 층에 속한 스티커 중 카메라를 가장 정면으로 향한 것에 점을 찍고, 미는 방향 화살표를 그린다.
 * 이 방향으로 밀면 dragToMove 가 정확히 안내한 수를 만든다.
 */
function TouchGuide({ move }: { move: Move }) {
  const def = MOVE_DEFS[move.face];
  const { camera, size } = useThree();
  const candidates = useMemo(() => {
    if (def.layer === null) return [];
    return SLOTS.filter((s) => {
      if (s.pos[def.axis] !== def.layer || s.normal[def.axis] !== 0) return false;
      const nAxis = s.normal.findIndex((v) => v !== 0);
      const third = 3 - def.axis - nAxis;
      return s.pos[third] === 0; // 그 면에서 층 띠의 가운데 스티커
    }).map((s) => s.index);
  }, [def.axis, def.layer]);
  const [slot, setSlot] = useState<number | null>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame(() => {
    tmp.cam.copy(camera.position).normalize();
    let best: number | null = null;
    let bestDot = 0.2;
    for (const i of candidates) {
      const n = SLOTS[i].normal;
      const dot = n[0] * tmp.cam.x + n[1] * tmp.cam.y + n[2] * tmp.cam.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    if (best !== slot) setSlot(best);
    if (best === null || !arrowRef.current) return;
    // 미는 방향 = 회전축 × 스티커 위치 (회전 방향 부호 반영) 을 화면에 투영
    const p = stickerPoint(best);
    const axis = new THREE.Vector3(def.axis === 0 ? 1 : 0, def.axis === 1 ? 1 : 0, def.axis === 2 ? 1 : 0);
    const t = axis.cross(p).multiplyScalar(Math.sign(quarterTurns(move)));
    tmp.a.copy(p).project(camera);
    tmp.b.copy(p).addScaledVector(t, 0.35).project(camera);
    const dx = (tmp.b.x - tmp.a.x) * size.width;
    const dy = -(tmp.b.y - tmp.a.y) * size.height;
    arrowRef.current.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  });

  if (slot === null) return null;
  return (
    <Html position={stickerPoint(slot)} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div className="pointer-events-none relative" data-touch-guide={slot}>
        <span className="absolute -left-6 -top-6 h-12 w-12 animate-ping rounded-full bg-rose-500/40" />
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-[3px] border-white bg-rose-500 shadow-lg" />
        <div ref={arrowRef} className="absolute left-0 top-0 h-0 w-0" style={{ transformOrigin: "0 0" }}>
          <svg width="84" height="24" viewBox="0 0 84 24" className="absolute -top-3 left-0 drop-shadow" aria-hidden>
            <path d="M16 12 H70" stroke="white" strokeWidth="7" strokeLinecap="round" />
            <path d="M16 12 H70" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
            <path d="M66 3 L82 12 L66 21 Z" fill="#f43f5e" stroke="white" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span className="animate-swipe absolute -top-2 left-3 h-4 w-4 rounded-full bg-white/90 shadow" />
        </div>
        {move.amount === 2 && (
          <span className="absolute left-4 top-3 whitespace-nowrap rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
            2번
          </span>
        )}
      </div>
    </Html>
  );
}

function dragToMove(
  slot: number,
  dx: number,
  dy: number,
  camera: THREE.Camera,
  size: { width: number; height: number },
): Move | null {
  const s = SLOTS[slot];
  const p = new THREE.Vector3(...s.pos).multiplyScalar(SPACING).addScaledVector(new THREE.Vector3(...s.normal), 0.5);
  const toScreen = (v: THREE.Vector3) => {
    const c = v.clone().project(camera);
    return new THREE.Vector2(((c.x + 1) / 2) * size.width, ((1 - c.y) / 2) * size.height);
  };
  const p0 = toScreen(p);
  const dragDir = new THREE.Vector2(dx, dy).normalize();
  let best: { axis: Axis; score: number } | null = null;
  for (const axis of [0, 1, 2] as Axis[]) {
    if (s.normal[axis] !== 0) continue;
    const e = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
    const t = e.clone().cross(p); // +축 회전 시 스티커가 움직이는 방향
    const sv = toScreen(p.clone().addScaledVector(t, 0.3)).sub(p0);
    if (sv.length() < 1e-6) continue;
    const score = dragDir.dot(sv.normalize());
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { axis, score };
  }
  if (!best || Math.abs(best.score) < 0.4) return null;
  const q = best.score > 0 ? 1 : -1;
  const layer = s.pos[best.axis];
  const face = DRAG_FACES.find((f) => MOVE_DEFS[f].axis === best.axis && MOVE_DEFS[f].layer === layer);
  if (!face) return null;
  return { face, amount: (q * MOVE_DEFS[face].sign) as 1 | -1 };
}

/** 면 기호 라벨 (U, F, R…). 카메라 쪽을 향한 면만 보인다 */
function FaceLabels({ cube }: { cube: CubeState }) {
  const palette = useCubeStore((s) => s.palette);
  const show = useCubeStore((s) => s.showLabels);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const camDir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!show) return;
    camDir.copy(camera.position).normalize();
    FACE_NAMES.forEach((f, i) => {
      const el = refs.current[i];
      if (!el) return;
      const n = FACE_NORMALS[f];
      const d = n[0] * camDir.x + n[1] * camDir.y + n[2] * camDir.z;
      el.style.opacity = d > 0.12 ? "1" : "0";
    });
  });
  if (!show) return null;
  return (
    <>
      {FACE_NAMES.map((f, i) => {
        const n = FACE_NORMALS[f];
        return (
          <Html key={f} position={[n[0] * 2.05, n[1] * 2.05, n[2] * 2.05]} center zIndexRange={[10, 0]}>
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="pointer-events-none flex items-center gap-1 rounded-full bg-zinc-900/85 px-2 py-0.5 font-mono text-xs font-bold text-white shadow transition-opacity dark:bg-white/90 dark:text-zinc-900"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm border border-white/40"
                style={{ background: palette[centerColor(cube, f)] }}
              />
              {f}
            </div>
          </Html>
        );
      })}
    </>
  );
}

export default function Cube3D() {
  return (
    <Canvas camera={{ position: [4.8, 4.4, 6.4], fov: 36 }} dpr={[1, 2]} style={{ touchAction: "none" }}>
      <ambientLight intensity={1.6} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, -4, -5]} intensity={0.6} />
      <CubeModel />
      <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={22} rotateSpeed={0.8} />
    </Canvas>
  );
}
