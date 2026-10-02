"use client";

import { memo, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/branding";
import { LOGO_COLORS, LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/brand-logo";
import {
  DELIVERY_ANIMATION_MS,
  FAR_COLORS,
  NEAR_COLORS,
  RIDER_TRANSFORM,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  SCROLL_SPAN,
  animationElapsedMs,
  clearAnimationStart,
  getAnimationStart,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
  type Pt,
} from "@/lib/delivery-animation";

type Phase = "playing" | "finishing" | "delivered" | "failed";

// Start time per order for this app session, so reopening mid-animation resumes.
const animationStarts = new Map<string, number>();

// How long the "Delivered!" card stays up before closing itself.
const AUTO_CLOSE_MS = 3000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function Limb({ p, q, w1, w2, fill, opacity = 1 }: { p: Pt; q: Pt; w1: number; w2: number; fill: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      <polygon points={limbPolygon(p, q, w1, w2)} />
      <circle cx={p[0]} cy={p[1]} r={w1 / 2} />
      <circle cx={q[0]} cy={q[1]} r={w2 / 2} />
    </g>
  );
}

const FAR_BUILDINGS = skyline(5, 60, 130, FAR_COLORS.length, SCENE_WIDTH, false);
const NEAR_BUILDINGS = skyline(23, 70, 120, NEAR_COLORS.length, SCENE_WIDTH, true);

const Buildings = memo(function Buildings({ far }: { far: boolean }) {
  const list = far ? FAR_BUILDINGS : NEAR_BUILDINGS;
  const colors = far ? FAR_COLORS : NEAR_COLORS;
  return (
    <g filter={far ? "url(#fq-blur)" : undefined}>
      {list.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.width} height={b.height} fill={colors[b.colorIndex]} />
          <rect x={b.x} y={b.y} width={b.width} height={3} fill="rgba(255,255,255,.35)" />
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={7} height={9} fill={w.lit ? "#FFE6A8" : "rgba(40,60,90,.35)"} />
          ))}
        </g>
      ))}
    </g>
  );
});

const Trees = memo(function Trees() {
  return (
    <g>
      {[20, 130, 240, 350, 460].map((x) => (
        <g key={x} transform={`translate(${x},0)`}>
          <rect x={-3} y={178} width={6} height={38} fill="#5A4330" />
          <circle cx={0} cy={168} r={24} fill="#2F7A3B" />
          <circle cx={-12} cy={176} r={16} fill="#3A8F47" />
          <circle cx={13} cy={174} r={17} fill="#276A33" />
        </g>
      ))}
    </g>
  );
});

const Clouds = memo(function Clouds() {
  return (
    <g opacity={0.8}>
      {([[60, 44, 1.2], [250, 74, 0.9], [410, 36, 1.1]] as const).map(([x, y, s]) => (
        <g key={x} transform={`translate(${x},${y}) scale(${s})`}>
          <ellipse cx={0} cy={0} rx={30} ry={10} fill="#fff" />
          <ellipse cx={16} cy={-8} rx={18} ry={10} fill="#fff" />
          <ellipse cx={-14} cy={-5} rx={14} ry={8} fill="#fff" />
        </g>
      ))}
    </g>
  );
});

const RoadMarks = memo(function RoadMarks() {
  const dashes = Array.from({ length: 8 }, (_, i) => i * 70);
  const lines = Array.from({ length: 20 }, (_, i) => i * 28);
  return (
    <g>
      {dashes.map((x) => <rect key={x} x={x} y={268} width={38} height={4} rx={2} fill="#E9E6DF" opacity={0.85} />)}
      {lines.map((x) => <rect key={x} x={x} y={241} width={14} height={1.5} fill="#fff" opacity={0.12} />)}
    </g>
  );
});

// One scrolling layer = two copies side by side so it loops seamlessly.
function Layer({ offset, children }: { offset: number; children: React.ReactNode }) {
  return (
    <g transform={`translate(${offset.toFixed(1)} 0)`}>
      {children}
      <g transform={`translate(${SCROLL_SPAN} 0)`}>{children}</g>
    </g>
  );
}

const Spokes = memo(function Spokes({ cx }: { cx: number }) {
  return (
    <g>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return (
          <line key={i} x1={cx + 4 * Math.cos(a)} y1={100 + 4 * Math.sin(a)} x2={cx + 30 * Math.cos(a)} y2={100 + 30 * Math.sin(a)} stroke="#AEB6C4" strokeWidth={0.8} opacity={0.85} />
        );
      })}
    </g>
  );
});

function WheelRim({ cx }: { cx: number }) {
  return (
    <>
      <circle cx={cx} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
      <circle cx={cx} cy={100} r={31} fill="none" stroke="#B9C1CF" strokeWidth={1.8} />
    </>
  );
}

function Shoe({ foot, pedalAngleHint }: { foot: Pt; pedalAngleHint: number }) {
  return (
    <g transform={`translate(${foot[0].toFixed(1)} ${foot[1].toFixed(1)}) rotate(${(Math.sin(pedalAngleHint) * 10).toFixed(0)})`}>
      <path d="M-8 -3 Q-8 -6 -3 -6 L6 -5 Q13 -3 13 2 L-8 3 Z" fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.4} />
      <rect x={-8} y={2} width={21} height={2} fill="#0B1D3A" />
    </g>
  );
}

export function DeliveryAnimationDialog({
  orderId,
  post,
  onDelivered,
  onClose,
}: {
  orderId: string;
  post: () => Promise<number>;
  onDelivered: () => void;
  onClose: () => void;
}) {
  const [ms, setMs] = useState(() => animationElapsedMs(getAnimationStart(animationStarts, orderId, Date.now()), Date.now()));
  const [phase, setPhase] = useState<Phase>("playing");
  const postRef = useRef(post);
  const onDeliveredRef = useRef(onDelivered);
  const onCloseRef = useRef(onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    postRef.current = post;
    onDeliveredRef.current = onDelivered;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const startedAt = getAnimationStart(animationStarts, orderId, Date.now());
    const t0 = performance.now() - animationElapsedMs(startedAt, Date.now());
    let raf = 0;
    let cancelled = false;
    const tick = (now: number) => {
      const elapsed = Math.min(now - t0, DELIVERY_ANIMATION_MS);
      setMs(elapsed);
      if (elapsed < DELIVERY_ANIMATION_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setPhase("finishing");
      runCompletion(() => postRef.current(), sleep).then((result) => {
        if (cancelled) return;
        if (result === "delivered") {
          clearAnimationStart(animationStarts, orderId);
          setPhase("delivered");
          onDeliveredRef.current();
        } else {
          setPhase("failed");
        }
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [orderId]);

  useEffect(() => {
    if (phase === "failed") closeRef.current?.focus();
    if (phase !== "delivered") return;
    const timer = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Always animated, even with prefers-reduced-motion: the ride is the delivery confirmation (Vishal's call, 2026-10-02).
  const pose = riderPose(ms);
  const secondsLeft = Math.max(0, Math.ceil((DELIVERY_ANIMATION_MS - ms) / 1000));
  const nearFoot = pose.legNear.foot;
  const farFoot = pose.legFar.foot;
  const R = RIDER_TRANSFORM;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/60 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-anim-title"
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-brand-surface shadow-2xl outline-none"
      >
        <div className="px-5 pb-2 pt-4">
          <h2 id="delivery-anim-title" className="font-heading text-xl text-brand-ink">
            {phase === "delivered" ? "Delivered!" : "Your order is on the way!"}
          </h2>
          <p className="mt-1 text-sm text-brand-ink-muted" aria-live="polite">
            {phase === "delivered"
              ? "Enjoy your meal."
              : phase === "failed"
                ? "We couldn't confirm delivery just yet — your order will be marked delivered shortly."
                : phase === "finishing"
                  ? "Confirming delivery…"
                  : `Your ${BRAND.name} rider is heading to you.`}
          </p>
        </div>

        <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} className="block h-auto w-full" role="img" aria-label={`${BRAND.name} rider cycling to deliver your order`}>
          <defs>
            <linearGradient id="fq-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9CC3E8" /><stop offset=".55" stopColor="#F6D9B4" /><stop offset="1" stopColor="#FBE9D0" />
            </linearGradient>
            <linearGradient id="fq-road" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4A4F5C" /><stop offset="1" stopColor="#2B2E37" />
            </linearGradient>
            <linearGradient id="fq-walk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CFC8BC" /><stop offset="1" stopColor="#B2AA9C" />
            </linearGradient>
            <linearGradient id="fq-jersey" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FF9A3E" /><stop offset="1" stopColor="#D96A0C" />
            </linearGradient>
            <linearGradient id="fq-shorts" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1A2F57" /><stop offset="1" stopColor="#0A1830" />
            </linearGradient>
            <linearGradient id="fq-skin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#E2B18A" /><stop offset="1" stopColor="#B98258" />
            </linearGradient>
            <linearGradient id="fq-helmet" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#C9D2DE" />
            </linearGradient>
            <linearGradient id="fq-box" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FF9238" /><stop offset=".55" stopColor={BRAND.theme.primary} /><stop offset="1" stopColor="#C95F08" />
            </linearGradient>
            <radialGradient id="fq-sun" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#FFF6DC" stopOpacity=".95" /><stop offset="1" stopColor="#FFE0A8" stopOpacity="0" />
            </radialGradient>
            <filter id="fq-blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6" /></filter>
            <filter id="fq-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>

          <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#fq-sky)" />
          <circle cx={450} cy={70} r={90} fill="url(#fq-sun)" />
          <Layer offset={pose.scroll.clouds}><Clouds /></Layer>
          <Layer offset={pose.scroll.far}><Buildings far /></Layer>
          <Layer offset={pose.scroll.near}><Buildings far={false} /></Layer>
          <Layer offset={pose.scroll.trees}><Trees /></Layer>
          <rect y={214} width={SCENE_WIDTH} height={14} fill="url(#fq-walk)" />
          <rect y={226} width={SCENE_WIDTH} height={4} fill="#8F877A" />
          <rect y={228} width={SCENE_WIDTH} height={72} fill="url(#fq-road)" />
          <Layer offset={pose.scroll.marks}><RoadMarks /></Layer>
          <ellipse cx={236} cy={288} rx={118} ry={8} fill="#000" opacity={0.4} filter="url(#fq-soft)" />

          <g transform={`translate(${R.x},${R.y}) scale(${R.scale})`}>
            <g transform={`translate(0 ${pose.bobY.toFixed(2)})`}>
              <Limb p={pose.hip} q={pose.legFar.knee} w1={17} w2={13} fill="url(#fq-shorts)" opacity={0.78} />
              <Limb p={pose.legFar.knee} q={farFoot} w1={11} w2={7} fill="url(#fq-skin)" opacity={0.78} />
              <Limb p={pose.shoulder} q={pose.armFar.elbow} w1={10} w2={8} fill="url(#fq-skin)" opacity={0.8} />
              <Limb p={pose.armFar.elbow} q={pose.armFar.hand} w1={8} w2={6} fill="url(#fq-skin)" opacity={0.8} />

              <g transform={`rotate(${pose.wheelDeg.toFixed(1)} 60 100)`}><Spokes cx={60} /></g>
              <g transform={`rotate(${pose.wheelDeg.toFixed(1)} 171 100)`}><Spokes cx={171} /></g>
              <WheelRim cx={60} />
              <WheelRim cx={171} />

              <circle cx={105} cy={100} r={13} fill="none" stroke="#9AA3B2" strokeWidth={3} />
              <line x1={105} y1={87} x2={60} y2={96} stroke="#222" strokeWidth={1.6} />
              <line x1={105} y1={113} x2={60} y2={104} stroke="#222" strokeWidth={1.6} />
              <line x1={105} y1={100} x2={pose.pedalNear[0]} y2={pose.pedalNear[1]} stroke="#7C8697" strokeWidth={4} strokeLinecap="round" />
              <line x1={105} y1={100} x2={pose.pedalFar[0]} y2={pose.pedalFar[1]} stroke="#5E6777" strokeWidth={4} strokeLinecap="round" />

              <g stroke="#0B1D3A" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
                <polyline points="60,100 94,54 146,54" />
                <line x1={60} y1={100} x2={105} y2={100} />
                <line x1={94} y1={54} x2={105} y2={100} />
                <line x1={146} y1={54} x2={105} y2={100} />
                <line x1={146} y1={54} x2={171} y2={100} />
                <line x1={94} y1={54} x2={68} y2={86} />
                <line x1={146} y1={54} x2={154} y2={38} strokeWidth={5} />
                <line x1={149} y1={38} x2={164} y2={38} strokeWidth={5} />
              </g>
              <path d="M80 47 Q94 41 106 46 Q100 51 88 51 Z" fill="#1c1c1c" />
              <rect x={160} y={30} width={7} height={6} rx={2} fill="#FFF3C4" />
              <polygon points="167,31 220,16 220,50 167,35" fill="#FFF3C4" opacity={0.18} />

              <line x1={22} y1={66} x2={86} y2={66} stroke="#0B1D3A" strokeWidth={3.5} strokeLinecap="round" />
              <g>
                <rect x={20} y={8} width={70} height={58} rx={7} fill="url(#fq-box)" />
                <rect x={20} y={8} width={70} height={10} rx={5} fill="#FFB267" opacity={0.85} />
                <rect x={20} y={56} width={70} height={10} rx={5} fill="#B24F05" opacity={0.55} />
                <g transform={`translate(24,22) scale(${26 / LOGO_VIEWBOX})`}>
                  <circle cx={LOGO_PATHS.disc.cx} cy={LOGO_PATHS.disc.cy} r={LOGO_PATHS.disc.r} fill={LOGO_COLORS.disc} />
                  <path d={LOGO_PATHS.bolt} fill={LOGO_COLORS.bolt} />
                  <path d={LOGO_PATHS.leaf} fill={LOGO_COLORS.leaf} />
                </g>
                {BRAND.name.split(" & ").map((part, i) => (
                  <text key={part} x={46} y={31 + i * 10} fontFamily="Poppins, Arial, sans-serif" fontWeight={700} fontSize={8} fill="#fff">
                    {i === 0 ? part : `& ${part}`}
                  </text>
                ))}
                <text x={28} y={58} fontFamily="Inter, Arial, sans-serif" fontWeight={600} fontSize={5.5} fill="#FFE9D2" letterSpacing={0.6}>FOOD DELIVERY</text>
              </g>

              <Limb p={[pose.hip[0] + 1, pose.hip[1] - 4]} q={pose.torsoTop} w1={22} w2={20} fill="url(#fq-jersey)" />
              <Limb p={pose.hip} q={pose.legNear.knee} w1={17} w2={13} fill="url(#fq-shorts)" />
              <Limb p={pose.legNear.knee} q={nearFoot} w1={11} w2={7} fill="url(#fq-skin)" />
              <Shoe foot={nearFoot} pedalAngleHint={nearFoot[1] - 100} />
              <Shoe foot={farFoot} pedalAngleHint={farFoot[1] - 100} />
              <Limb p={pose.shoulder} q={pose.armNear.elbow} w1={12} w2={9} fill="url(#fq-jersey)" />
              <Limb p={pose.armNear.elbow} q={pose.armNear.hand} w1={8} w2={6} fill="url(#fq-skin)" />
              <circle cx={pose.armNear.hand[0]} cy={pose.armNear.hand[1]} r={4.5} fill="#1A1A1A" />

              <g transform={`translate(${(pose.lean * 0.6).toFixed(2)} 0)`}>
                <rect x={132} y={2} width={9} height={14} rx={4} fill="url(#fq-skin)" />
                <circle cx={141} cy={-9} r={10} fill="url(#fq-skin)" />
                <path d="M129 -10 Q130 -26 144 -24 Q155 -22 153 -10 L146 -12 L132 -9 Z" fill="url(#fq-helmet)" />
                <path d="M129 -10 Q131 -26 144 -24" fill="none" stroke={LOGO_COLORS.leaf} strokeWidth={2} />
                <rect x={144} y={-10} width={11} height={4.5} rx={2.2} fill="#10151F" />
              </g>
            </g>
          </g>
        </svg>

        <div className="px-5 pb-5 pt-3">
          {phase === "delivered" ? null : phase === "failed" ? (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white"
            >
              Close
            </button>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-brand-primary-tint">
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: `${(ms / DELIVERY_ANIMATION_MS) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-brand-ink-muted">
                {phase === "finishing" ? "Confirming delivery…" : <>Arriving in <b className="text-brand-ink">{secondsLeft}</b>s</>}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
