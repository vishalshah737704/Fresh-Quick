import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { BRAND } from "../theme";
import { LOGO_COLORS, LOGO_PATHS } from "../lib/brand-logo";
import {
  DELIVERY_ANIMATION_MS,
  FAR_COLORS,
  NEAR_COLORS,
  RIDER_TRANSFORM,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  SCROLL_SPAN,
  animationOffsetMs,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
  type Pt,
} from "../lib/delivery-animation";

type Phase = "playing" | "finishing" | "delivered" | "failed";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const FAR = skyline(5, 60, 130, FAR_COLORS.length, SCENE_WIDTH, false);
const NEAR = skyline(23, 70, 120, NEAR_COLORS.length, SCENE_WIDTH, true);

function Limb({ p, q, w1, w2, fill, opacity = 1 }: { p: Pt; q: Pt; w1: number; w2: number; fill: string; opacity?: number }) {
  return (
    <G fill={fill} opacity={opacity}>
      <Polygon points={limbPolygon(p, q, w1, w2)} />
      <Circle cx={p[0]} cy={p[1]} r={w1 / 2} />
      <Circle cx={q[0]} cy={q[1]} r={w2 / 2} />
    </G>
  );
}

const Buildings = memo(function Buildings({ far }: { far: boolean }) {
  const list = far ? FAR : NEAR;
  const colors = far ? FAR_COLORS : NEAR_COLORS;
  return (
    <G>
      {list.map((b, i) => (
        <G key={i}>
          <Rect x={b.x} y={b.y} width={b.width} height={b.height} fill={colors[b.colorIndex]} />
          {b.windows.map((w, j) => (
            <Rect key={j} x={w.x} y={w.y} width={7} height={9} fill={w.lit ? "#FFE6A8" : "rgba(40,60,90,0.35)"} />
          ))}
        </G>
      ))}
    </G>
  );
});

const Trees = memo(function Trees() {
  return (
    <G>
      {[20, 130, 240, 350, 460].map((x) => (
        <G key={x} translate={`${x}, 0`}>
          <Rect x={-3} y={178} width={6} height={38} fill="#5A4330" />
          <Circle cx={0} cy={168} r={24} fill="#2F7A3B" />
          <Circle cx={-12} cy={176} r={16} fill="#3A8F47" />
          <Circle cx={13} cy={174} r={17} fill="#276A33" />
        </G>
      ))}
    </G>
  );
});

const Spokes = memo(function Spokes({ cx }: { cx: number }) {
  return (
    <G>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <Line key={i} x1={cx} y1={100} x2={cx + 30 * Math.cos(a)} y2={100 + 30 * Math.sin(a)} stroke="#AEB6C4" strokeWidth={1} />;
      })}
    </G>
  );
});

function Layer({ offset, children }: { offset: number; children: React.ReactNode }) {
  return (
    <G translate={`${offset.toFixed(1)}, 0`}>
      {children}
      <G translate={`${SCROLL_SPAN}, 0`}>{children}</G>
    </G>
  );
}

export function DeliveryAnimation({
  visible,
  pickedUpAt,
  post,
  onDelivered,
  onClose,
}: {
  visible: boolean;
  pickedUpAt: string | null;
  post: () => Promise<number>;
  onDelivered: () => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [ms, setMs] = useState(() => animationOffsetMs(pickedUpAt, Date.now()));
  const [phase, setPhase] = useState<Phase>("playing");
  const [reduced, setReduced] = useState(false);
  const postRef = useRef(post);
  const onDeliveredRef = useRef(onDelivered);

  useEffect(() => {
    postRef.current = post;
    onDeliveredRef.current = onDelivered;
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t0 = Date.now() - animationOffsetMs(pickedUpAt, Date.now());
    let cancelled = false;
    let finished = false;
    const timer = setInterval(() => {
      const elapsed = Math.min(Date.now() - t0, DELIVERY_ANIMATION_MS);
      setMs(elapsed);
      if (elapsed < DELIVERY_ANIMATION_MS || finished) return;
      finished = true;
      clearInterval(timer);
      setPhase("finishing");
      runCompletion(() => postRef.current(), sleep).then((result) => {
        if (cancelled) return;
        if (result === "delivered") {
          setPhase("delivered");
          onDeliveredRef.current();
        } else {
          setPhase("failed");
        }
      });
    }, 33);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, pickedUpAt]);

  const pose = riderPose(reduced ? 0 : ms);
  const secondsLeft = Math.max(0, Math.ceil((DELIVERY_ANIMATION_MS - ms) / 1000));
  const cardWidth = Math.min(width - 32, 520);
  const R = RIDER_TRANSFORM;
  const nameParts = BRAND.name.split(" & ");

  return (
    // onRequestClose is a no-op on purpose: the Android back button must not dismiss it.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{phase === "delivered" ? "Delivered!" : "Your order is on the way!"}</Text>
            <Text style={styles.sub}>
              {phase === "delivered"
                ? "Enjoy your meal."
                : phase === "failed"
                  ? "We couldn't confirm delivery just yet — your order will be marked delivered shortly."
                  : phase === "finishing"
                    ? "Confirming delivery…"
                    : `Your ${BRAND.name} rider is heading to you.`}
            </Text>
          </View>

          <Svg width={cardWidth} height={(cardWidth * SCENE_HEIGHT) / SCENE_WIDTH} viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}>
            <Rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="#F6D9B4" />
            <Rect width={SCENE_WIDTH} height={120} fill="#9CC3E8" />
            <Layer offset={pose.scroll.far}><Buildings far /></Layer>
            <Layer offset={pose.scroll.near}><Buildings far={false} /></Layer>
            <Layer offset={pose.scroll.trees}><Trees /></Layer>
            <Rect y={214} width={SCENE_WIDTH} height={14} fill="#C7C0B3" />
            <Rect y={228} width={SCENE_WIDTH} height={72} fill="#3A3E48" />
            <Layer offset={pose.scroll.marks}>
              <G>
                {Array.from({ length: 8 }, (_, i) => (
                  <Rect key={i} x={i * 70} y={268} width={38} height={4} rx={2} fill="#E9E6DF" />
                ))}
              </G>
            </Layer>

            <G translate={`${R.x}, ${R.y + pose.bobY}`} scale={R.scale}>
              <Limb p={pose.hip} q={pose.legFar.knee} w1={17} w2={13} fill="#0F2244" opacity={0.78} />
              <Limb p={pose.legFar.knee} q={pose.legFar.foot} w1={11} w2={7} fill="#D9A57B" opacity={0.78} />
              <Limb p={pose.shoulder} q={pose.armFar.elbow} w1={10} w2={8} fill="#D9A57B" opacity={0.8} />
              <Limb p={pose.armFar.elbow} q={pose.armFar.hand} w1={8} w2={6} fill="#D9A57B" opacity={0.8} />

              <G rotation={pose.wheelDeg} origin="60, 100"><Spokes cx={60} /></G>
              <G rotation={pose.wheelDeg} origin="171, 100"><Spokes cx={171} /></G>
              <Circle cx={60} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
              <Circle cx={171} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
              <Line x1={105} y1={100} x2={pose.pedalNear[0]} y2={pose.pedalNear[1]} stroke="#7C8697" strokeWidth={4} strokeLinecap="round" />
              <Line x1={105} y1={100} x2={pose.pedalFar[0]} y2={pose.pedalFar[1]} stroke="#5E6777" strokeWidth={4} strokeLinecap="round" />

              <G stroke="#0B1D3A" strokeWidth={4.5} strokeLinecap="round" fill="none">
                <Path d="M60 100 L94 54 L146 54" />
                <Line x1={60} y1={100} x2={105} y2={100} />
                <Line x1={94} y1={54} x2={105} y2={100} />
                <Line x1={146} y1={54} x2={105} y2={100} />
                <Line x1={146} y1={54} x2={171} y2={100} />
                <Line x1={146} y1={54} x2={154} y2={38} />
                <Line x1={149} y1={38} x2={164} y2={38} />
              </G>

              <Rect x={20} y={8} width={70} height={58} rx={7} fill={BRAND.colors.primary} />
              <Rect x={20} y={8} width={70} height={10} rx={5} fill="#FFB267" />
              <G translate="24, 22" scale={0.325}>
                <Circle cx={LOGO_PATHS.disc.cx} cy={LOGO_PATHS.disc.cy} r={LOGO_PATHS.disc.r} fill={LOGO_COLORS.disc} />
                <Path d={LOGO_PATHS.bolt} fill={LOGO_COLORS.bolt} />
                <Path d={LOGO_PATHS.leaf} fill={LOGO_COLORS.leaf} />
              </G>
              {nameParts.map((part, i) => (
                <SvgText key={part} x={46} y={31 + i * 10} fontSize={8} fontWeight="bold" fill="#FFFFFF">
                  {i === 0 ? part : `& ${part}`}
                </SvgText>
              ))}

              <Limb p={[pose.hip[0] + 1, pose.hip[1] - 4]} q={pose.torsoTop} w1={22} w2={20} fill={BRAND.colors.primary} />
              <Limb p={pose.hip} q={pose.legNear.knee} w1={17} w2={13} fill="#0F2244" />
              <Limb p={pose.legNear.knee} q={pose.legNear.foot} w1={11} w2={7} fill="#D9A57B" />
              <Rect x={pose.legNear.foot[0] - 8} y={pose.legNear.foot[1] - 5} width={21} height={8} rx={3} fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.2} />
              <Rect x={pose.legFar.foot[0] - 8} y={pose.legFar.foot[1] - 5} width={21} height={8} rx={3} fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.2} />
              <Limb p={pose.shoulder} q={pose.armNear.elbow} w1={12} w2={9} fill={BRAND.colors.primary} />
              <Limb p={pose.armNear.elbow} q={pose.armNear.hand} w1={8} w2={6} fill="#D9A57B" />
              <Circle cx={pose.armNear.hand[0]} cy={pose.armNear.hand[1]} r={4.5} fill="#1A1A1A" />
              <G translate={`${(pose.lean * 0.6).toFixed(2)}, 0`}>
                <Circle cx={141} cy={-9} r={10} fill="#D9A57B" />
                <Path d="M129 -10 Q130 -26 144 -24 Q155 -22 153 -10 L146 -12 L132 -9 Z" fill="#F2F5FA" />
                <Rect x={144} y={-10} width={11} height={4.5} rx={2.2} fill="#10151F" />
              </G>
            </G>
          </Svg>

          <View style={styles.foot}>
            {phase === "delivered" || phase === "failed" ? (
              <Pressable style={styles.button} onPress={onClose}>
                <Text style={styles.buttonText}>{phase === "delivered" ? "Done" : "Close"}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(ms / DELIVERY_ANIMATION_MS) * 100}%` }]} />
                </View>
                <Text style={styles.sub}>{phase === "finishing" ? "Confirming delivery…" : `Arriving in ${secondsLeft}s`}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,29,58,0.6)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 24, overflow: "hidden" },
  head: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 4 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 20, color: BRAND.colors.ink },
  sub: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.inkMuted },
  foot: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, gap: 8 },
  track: { height: 8, borderRadius: 999, backgroundColor: BRAND.colors.primary + "22", overflow: "hidden" },
  fill: { height: 8, borderRadius: 999, backgroundColor: BRAND.colors.primary },
  button: { alignSelf: "flex-start", backgroundColor: BRAND.colors.ink, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, color: "#FFFFFF" },
});
