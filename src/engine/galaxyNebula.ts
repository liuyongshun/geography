/**
 * 银河系旋臂星云：fBm + Worley 程序化气体（Additive），无贴图依赖。
 * 思路参考开源 galaxy-explorer（MIT）的 spiral nebula 着色，教学简化。
 */
import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uIntensity;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return v;
}

float worley(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(i + g), hash(i + g + 19.7));
      vec2 r = g + o - f;
      d = min(d, dot(r, r));
    }
  }
  return 1.0 - clamp(d * 1.8, 0.0, 1.0);
}

/** 对数螺线臂密度（盘面局部坐标 ∈ [-1,1]） */
float armDensity(vec2 p) {
  float r = length(p) + 1e-4;
  float theta = atan(p.y, p.x);
  float dens = 0.0;
  // 四主臂 + 本臂相位
  float phases[5];
  phases[0] = 0.2;
  phases[1] = 1.75;
  phases[2] = 3.3;
  phases[3] = 4.85;
  phases[4] = 2.55;
  float pitch = 0.28;
  for (int i = 0; i < 5; i++) {
    float armTheta = theta - log(r * 3.2) / pitch - phases[i];
    armTheta = mod(armTheta + 3.14159265, 6.2831853) - 3.14159265;
    float w = i == 4 ? 0.16 : 0.11;
    dens += exp(-armTheta * armTheta / (w * w)) * (i == 4 ? 0.65 : 1.0);
  }
  float disk = smoothstep(1.05, 0.15, r) * smoothstep(0.02, 0.12, r);
  float bar = exp(-pow(abs(p.x * 0.55 + p.y * 0.35), 2.0) * 18.0) * exp(-p.y * p.y * 9.0) * 0.85;
  return (dens * 0.55 + bar) * disk;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.05) discard;

  float t = uTime * 0.04;
  vec2 q = p;
  // 域扭曲：气体沿旋臂流动感
  q += 0.08 * vec2(fbm(q * 2.5 + t), fbm(q * 2.5 - t + 3.1));

  float arms = armDensity(q);
  float gas = fbm(q * 4.5 + vec2(t * 0.3, -t * 0.2));
  float clumps = worley(q * 6.0 + t * 0.15);
  float dust = smoothstep(0.35, 0.75, fbm(q * 7.0 - t));

  float dens = arms * (0.45 + 0.55 * gas) * (0.55 + 0.45 * clumps);
  dens *= 1.0 - dust * 0.45 * arms;
  dens *= uIntensity;

  // 核球偏乳白，勿整盘染成金黄
  float core = exp(-r * r * 18.0);
  // 外臂冷青 / HII 淡粉 / 核球微暖白 / 尘带暗褐
  vec3 colCore = vec3(1.0, 0.94, 0.88);
  vec3 colHii = vec3(0.95, 0.45, 0.78);
  vec3 colBlue = vec3(0.55, 0.78, 1.0);
  vec3 colDust = vec3(0.1, 0.08, 0.14);
  vec3 colArm = vec3(0.78, 0.86, 1.0);

  float hiiMask = arms * clumps * smoothstep(0.18, 0.6, r) * (0.35 + 0.55 * gas);
  vec3 col = mix(colBlue, colArm, clamp(arms * 0.65, 0.0, 1.0));
  col = mix(col, colHii, hiiMask * 0.85);
  col = mix(col, colCore, core * 0.55);
  col = mix(col, colDust, dust * 0.4 * (1.0 - core));

  float alpha = clamp(dens * 0.7 + core * 0.28, 0.0, 1.0);
  alpha *= smoothstep(1.05, 0.72, r);

  // 轻微脉动
  alpha *= 0.88 + 0.12 * sin(uTime * 0.7 + r * 6.0);

  gl_FragColor = vec4(col * alpha, alpha);
}
`

export function createGalaxyNebulaMaterial(intensity = 1.15) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

/** 光谱型近似：0=热蓝，0.5=白，1=冷橙红 */
export function spectralRgb(temp: number, bright: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, temp))
  let r: number
  let g: number
  let b: number
  if (t < 0.35) {
    const u = t / 0.35
    r = 0.55 + 0.35 * u
    g = 0.72 + 0.2 * u
    b = 1.0
  } else if (t < 0.55) {
    const u = (t - 0.35) / 0.2
    r = 0.9 + 0.1 * u
    g = 0.92 + 0.05 * u
    b = 1.0 - 0.12 * u
  } else if (t < 0.75) {
    const u = (t - 0.55) / 0.2
    r = 1.0
    g = 0.95 - 0.2 * u
    b = 0.88 - 0.35 * u
  } else {
    const u = (t - 0.75) / 0.25
    r = 1.0
    g = 0.75 - 0.35 * u
    b = 0.53 - 0.25 * u
  }
  const k = Math.min(1.5, bright)
  return [r * k, g * k, b * k]
}

/** HII 区洋红 */
export function hiiRgb(bright: number): [number, number, number] {
  const k = Math.min(1.4, bright)
  return [1.0 * k, 0.38 * k, 0.78 * k]
}
