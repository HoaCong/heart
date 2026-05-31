// ─── Simplex 3-D noise (Stefan Gustavson, public domain) ────────────────────
vec3 _mod289v3(vec3 x)  { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 _mod289v4(vec4 x)  { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 _permute(vec4 x)   { return _mod289v4(((x * 34.0) + 1.0) * x); }
vec4 _taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = _mod289v3(i);
  vec4 p = _permute(_permute(_permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = _taylorInvSqrt(vec4(
    dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(
    0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m,
    vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// ─────────────────────────────────────────────────────────────────────────────

// Custom particle attributes
attribute vec3  aPositionB;   // morph target "to" position
attribute float aRandom;      // per-particle seed (0..1)
attribute float aSize;        // base point size
attribute vec3  aColorA;      // color at position A
attribute vec3  aColorB;      // color at position B

// Uniforms driven by GSAP + animation loop
uniform float uProgress;      // morph factor 0=A, 1=B
uniform float uTime;          // elapsed seconds
uniform float uNoiseStrength; // noise displacement magnitude
uniform float uPixelRatio;    // device pixel ratio for crisp points

// Varyings to fragment shader
varying vec3  vColor;
varying float vAlpha;

// Smooth hermite ease so motion has ease-in/ease-out
float hermite(float t) {
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  // ── Morph between A (built-in position) and B ──────────────────────────────
  float p   = clamp(uProgress, 0.0, 1.0);
  float ep  = hermite(p);                       // eased progress
  vec3  pos = mix(position, aPositionB, ep);

  // ── Organic noise displacement ─────────────────────────────────────────────
  float t   = uTime * 0.18;
  float ns  = uNoiseStrength;

  // Three independent noise channels → XYZ jitter
  float nx = snoise(vec3(pos.x * 1.8 + t,       pos.y * 1.8,       aRandom * 6.3));
  float ny = snoise(vec3(pos.x * 1.8,       pos.y * 1.8 + t + 1.9, aRandom * 6.3));
  float nz = snoise(vec3(aRandom * 6.3 + t * 0.7, pos.z * 2.0,     pos.x));

  pos.x += nx * ns;
  pos.y += ny * ns;
  pos.z += nz * ns * 0.6;

  // ── Idle breathing — very subtle vertical oscillation ─────────────────────
  float breathe = sin(uTime * 0.4 + aRandom * 6.28318) * 0.006 * (1.0 - abs(ep - 0.5) * 2.0);
  pos.y += breathe;

  // ── Color interpolation ───────────────────────────────────────────────────
  vColor = mix(aColorA, aColorB, ep);

  // ── Alpha: fade near Z extremes for depth cue ────────────────────────────
  float depthFade = 1.0 - clamp(abs(pos.z) * 0.45, 0.0, 0.6);
  vAlpha = depthFade;

  // ── Project + point size with perspective divide ──────────────────────────
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float dist  = -mvPos.z;                        // positive depth

  // Correct perspective sizing: aSize is desired px at 1 unit distance
  // Factor 4.0 tuned so particles are 1.5-6 px at the default camera depth
  gl_PointSize = clamp(aSize * uPixelRatio * (4.0 / dist), 0.8, 8.0);
  gl_Position  = projectionMatrix * mvPos;
}
