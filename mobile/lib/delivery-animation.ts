// Shared by the web customer order page and the mobile Customer order screen.
// Pure: no imports, no DOM, no React. A byte-identical copy lives in
// mobile/lib/ (tests/mobile-parity.test.mjs guards drift).
// All coordinates are in the animation scene's SVG space (viewBox 0 0 560 300).

export const DELIVERY_ANIMATION_MS = 15000;
// Server rejects completion earlier than DELIVERY_ANIMATION_MS - EARLY_TOLERANCE_MS
// after picked_up_at, to absorb client/server clock skew.
export const EARLY_TOLERANCE_MS = 1000;
export const RETRY_AFTER_EARLY_MS = 1500;

export type Pt = [number, number];

export const SCENE_WIDTH = 560;
export const SCENE_HEIGHT = 300;
export const SCROLL_SPAN = 560;
export const RIDER_TRANSFORM = { x: 130, y: 112, scale: 1.28 } as const;

// The animation always plays a FULL 15 s from the moment the dialog first appears.
// Progress is measured only on the client's own clock (start and now are both
// Date.now() on the same device), so it is immune to client/server clock skew and
// independent of picked_up_at. The server's 14 s rule (EARLY_TOLERANCE_MS) still
// holds because the dialog can only appear after the pickup, so it can never
// finish earlier than pickup + 15 s.
export function animationElapsedMs(startedAtMs: number | null, nowMs: number): number {
  if (startedAtMs === null || Number.isNaN(startedAtMs)) return 0;
  return Math.min(Math.max(nowMs - startedAtMs, 0), DELIVERY_ANIMATION_MS);
}

// Per-order start times kept in memory so closing and reopening the dialog
// mid-animation resumes instead of restarting.
export function getAnimationStart(starts: Map<string, number>, orderId: string, nowMs: number): number {
  const existing = starts.get(orderId);
  if (existing !== undefined) return existing;
  starts.set(orderId, nowMs);
  return nowMs;
}

export function clearAnimationStart(starts: Map<string, number>, orderId: string): void {
  starts.delete(orderId);
}

// ---- rider geometry (bike-local coordinates; origin placed by RIDER_TRANSFORM) ----
const HIP: Pt = [93, 42];
const CRANK: Pt = [105, 100];
const PEDAL_RADIUS = 17;
const THIGH = 44;
const SHIN = 46;
const ARM_SEGMENT = 30;
const SHOULDER: Pt = [126, 6];
const HAND_NEAR: Pt = [158, 37];
const HAND_FAR: Pt = [155, 36];
const CADENCE_HZ = 1.15;
const WHEEL_DEG_PER_SEC = 520;
const SCROLL_SPEED = { far: 14, near: 40, trees: 95, clouds: 6, marks: 230 } as const;

// Two-bone IK in screen coordinates. sign -1 bends the joint forward/up (knee),
// +1 bends it down/back (elbow).
function ik(a: Pt, b: Pt, l1: number, l2: number, sign: 1 | -1): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5);
  const angle = Math.atan2(dy, dx);
  const cos = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const k = Math.acos(cos);
  return [a[0] + l1 * Math.cos(angle + sign * k), a[1] + l1 * Math.sin(angle + sign * k)];
}

export type RiderPose = {
  hip: Pt;
  crank: Pt;
  shoulder: Pt;
  torsoTop: Pt;
  lean: number;
  bobY: number;
  wheelDeg: number;
  pedalNear: Pt;
  pedalFar: Pt;
  legNear: { knee: Pt; foot: Pt };
  legFar: { knee: Pt; foot: Pt };
  armNear: { elbow: Pt; hand: Pt };
  armFar: { elbow: Pt; hand: Pt };
  scroll: { far: number; near: number; trees: number; clouds: number; marks: number };
};

function scrollOffset(sec: number, speed: number): number {
  return -((sec * speed) % SCROLL_SPAN);
}

export function riderPose(ms: number): RiderPose {
  const sec = ms / 1000;
  const pedal = sec * Math.PI * 2 * CADENCE_HZ;
  const lean = Math.sin(pedal) * 1.2;
  const footAt = (angle: number): Pt => [
    CRANK[0] + PEDAL_RADIUS * Math.cos(angle),
    CRANK[1] + PEDAL_RADIUS * Math.sin(angle),
  ];
  const pedalNear = footAt(pedal);
  const pedalFar = footAt(pedal + Math.PI);
  const leg = (foot: Pt) => ({ knee: ik(HIP, foot, THIGH, SHIN, -1), foot });
  const arm = (hand: Pt) => ({ elbow: ik(SHOULDER, hand, ARM_SEGMENT, ARM_SEGMENT, 1), hand });
  return {
    hip: HIP,
    crank: CRANK,
    shoulder: SHOULDER,
    torsoTop: [124 + lean, 6],
    lean,
    bobY: Math.sin(pedal * 2) * 1.1,
    wheelDeg: sec * WHEEL_DEG_PER_SEC,
    pedalNear,
    pedalFar,
    legNear: leg(pedalNear),
    legFar: leg(pedalFar),
    armNear: arm(HAND_NEAR),
    armFar: arm(HAND_FAR),
    scroll: {
      far: scrollOffset(sec, SCROLL_SPEED.far),
      near: scrollOffset(sec, SCROLL_SPEED.near),
      trees: scrollOffset(sec, SCROLL_SPEED.trees),
      clouds: scrollOffset(sec, SCROLL_SPEED.clouds),
      marks: scrollOffset(sec, SCROLL_SPEED.marks),
    },
  };
}

// Tapered limb as an SVG polygon "points" string; draw round joints separately.
export function limbPolygon(p: Pt, q: Pt, w1: number, w2: number): string {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Pt[] = [
    [p[0] + (nx * w1) / 2, p[1] + (ny * w1) / 2],
    [q[0] + (nx * w2) / 2, q[1] + (ny * w2) / 2],
    [q[0] - (nx * w2) / 2, q[1] - (ny * w2) / 2],
    [p[0] - (nx * w1) / 2, p[1] - (ny * w1) / 2],
  ];
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// ---- scenery ----
export const FAR_COLORS = ["#B7AFA9", "#A9A39F", "#BDB5AA"] as const;
export const NEAR_COLORS = ["#9C8B79", "#8E7E6C", "#A39382", "#7E7366"] as const;

export type SkylineBuilding = {
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
  windows: { x: number; y: number; lit: boolean }[];
};

// Deterministic (seeded) row of buildings standing on the pavement line (y=214).
export function skyline(
  seed: number,
  minH: number,
  maxH: number,
  colorCount: number,
  total: number,
  withWindows: boolean
): SkylineBuilding[] {
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out: SkylineBuilding[] = [];
  let x = 0;
  while (x < total) {
    const width = 40 + rnd() * 40;
    const height = minH + rnd() * (maxH - minH);
    const colorIndex = Math.floor(rnd() * colorCount);
    const top = 214 - height;
    const windows: SkylineBuilding["windows"] = [];
    if (withWindows) {
      for (let wy = top + 12; wy < 198; wy += 17) {
        for (let wx = x + 8; wx < x + width - 10; wx += 15) {
          windows.push({ x: wx, y: wy, lit: rnd() > 0.75 });
        }
      }
    }
    out.push({ x, y: top, width, height, colorIndex, windows });
    x += width + 3;
  }
  return out;
}

// ---- completion call with retries ----
export type CompletionResult = "delivered" | "failed";

// `post` performs the HTTP call and returns the status code (0 = network error);
// it must not throw. 200 = delivered (also returned for an already-delivered
// order). 425 = server says the animation window has not elapsed yet. 401/404/409
// are terminal. Anything else (0, 5xx) backs off and retries.
export async function runCompletion(
  post: () => Promise<number>,
  sleep: (ms: number) => Promise<void>,
  maxAttempts = 8
): Promise<CompletionResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await post();
    if (status === 200) return "delivered";
    if (status === 401 || status === 404 || status === 409) return "failed";
    if (attempt === maxAttempts) break;
    await sleep(status === 425 ? RETRY_AFTER_EARLY_MS : 1000 * attempt);
  }
  return "failed";
}
