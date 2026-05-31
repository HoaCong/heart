// Soft-particle glow — no square points, pure light-dust appearance.
//
// Alpha under normal blending is set high enough for facial readability while
// still preserving a soft point-cloud look.
// Scatter particles use HDR colors (>1.0) so they bloom individually.

varying vec3  vColor;
varying float vAlpha;

void main() {
  // UV relative to point centre  (-0.5 .. +0.5)
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv);

  // Hard clip — clean circle
  if (dist > 0.5) discard;

  // ── Core: tight bright centre ─────────────────────────────────────────────
  float core = 1.0 - smoothstep(0.0, 0.28, dist);

  // ── Halo: wide soft glow ──────────────────────────────────────────────────
  float halo = exp(-dist * dist * 7.0);

  // ── Base alpha for readable portraits with soft edges ────────────────────
  float alpha = (core * 0.32 + halo * 0.14) * vAlpha;

  // Slightly boost colour at core centre for that sparkle micro-glow
  vec3 finalColor = vColor + vColor * core * 0.35;

  gl_FragColor = vec4(finalColor, alpha);
}
