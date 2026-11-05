/* eslint-disable react/no-unknown-property -- three.js JSX props (args, uniforms, shaders) */
import { Canvas, useFrame } from "@react-three/fiber/native";
import { useMemo, useRef, type RefObject } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Color, type ShaderMaterial } from "three";
import type { VoiceState } from "@/lib/voice/live-client";
import { color } from "@/ui/theme";

type Levels = RefObject<{ mic: number; out: number }>;

const LIVE: VoiceState[] = ["connecting", "listening", "thinking", "speaking"];

// One sphere, displaced in the vertex shader: cheap enough to run every frame on mid-range phones.
const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec3 vNormal;
varying vec3 vView;
varying float vDisp;
float wave(vec3 p) {
  return sin(p.x * 3.1 + uTime * 1.3) * sin(p.y * 2.7 + uTime * 1.1) * sin(p.z * 3.3 + uTime * 0.9);
}
void main() {
  float d = wave(normal * 1.6) * (0.03 + uAmp * 0.24) + wave(normal * 3.4 + 1.7) * uAmp * 0.06;
  vDisp = d;
  vec4 mv = modelViewMatrix * vec4(position + normal * d, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
precision mediump float;
uniform vec3 uCore;
uniform vec3 uRim;
varying vec3 vNormal;
varying vec3 vView;
varying float vDisp;
void main() {
  float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
  float rim = pow(1.0 - facing, 2.0);
  vec3 col = mix(uCore, uRim, clamp(rim + vDisp * 2.5, 0.0, 1.0));
  col += vec3(1.0) * pow(facing, 12.0) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`;

function Blob({ state, levels, tint }: { state: VoiceState; levels: Levels; tint: string }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uCore: { value: new Color(color.primary) },
      uRim: { value: new Color(color.lavender) },
    }),
    [],
  );

  const material = useRef<ShaderMaterial>(null);
  const target = useMemo(() => new Color(tint), [tint]);

  useFrame(({ clock }, dt) => {
    const u = material.current?.uniforms;
    if (!u) return;
    const t = clock.elapsedTime;
    // Handoff: the core eases to the new agent's colour instead of snapping.
    u.uCore.value.lerp(target, Math.min(1, dt * 4));
    const l = levels.current;
    const amp =
      state === "listening" ? l.mic : state === "speaking" ? 0.25 + l.out : state === "thinking" ? 0.12 + 0.08 * Math.sin(t * 2) : 0.05;
    // Ease toward the target so per-chunk loudness jumps read as motion, not flicker.
    u.uAmp.value += (Math.min(amp, 1) - u.uAmp.value) * Math.min(1, dt * 8);
    u.uTime.value += dt * (state === "thinking" ? 0.5 : 1);
  });

  return (
    <mesh>
      <icosahedronGeometry args={[1, 16]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
}

/** Animated orb that follows the voice, tinted to the speaking agent; a static ring under reduced motion. */
export function VoiceOrb({
  state,
  levels,
  size,
  reduced,
  tint = color.primary,
}: {
  state: VoiceState;
  levels: Levels;
  size: number;
  reduced: boolean;
  tint?: string;
}) {
  if (reduced) return <StaticRing state={state} size={size} tint={tint} />;
  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Canvas
        style={{ flex: 1 }}
        // Rendered only while a session is live; otherwise the last frame stays on screen.
        frameloop={LIVE.includes(state) ? "always" : "demand"}
        camera={{ position: [0, 0, 3.3], fov: 40 }}
      >
        <Blob state={state} levels={levels} tint={tint} />
      </Canvas>
    </View>
  );
}

function StaticRing({ state, size, tint }: { state: VoiceState; size: number; tint: string }) {
  const c = size / 2;
  const stroke = state === "error" ? color.danger : LIVE.includes(state) ? tint : color.borderInput;
  return (
    <Svg width={size} height={size} accessible={false}>
      <Circle cx={c} cy={c} r={c * 0.82} fill={color.primarySubtle} />
      <Circle cx={c} cy={c} r={c * 0.82} stroke={stroke} strokeWidth={6} fill="none" />
      <Circle cx={c} cy={c} r={c * 0.5} fill={stroke} opacity={0.18} />
    </Svg>
  );
}
