/**
 * ProceduralShapes
 *
 * Generates particle positions + colours for shapes that don't come from images:
 *  · generateScatter()        — random spherical scatter (3 flavours)
 *  · generateThreadHeart()    — Bezier thread + parametric heart + floating dust
 *
 * No Three.js dependency — pure math, runs on CPU once at startup.
 */

import type { ParticleData } from "../loaders/ImageParticleLoader";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Cubic Bezier scalar */
function bezier1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

/** Parametric heart curve — returns [x, y] in raw units */
function heartPoint(t: number): [number, number] {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y =
    13 * Math.cos(t) -
    5 * Math.cos(2 * t) -
    2 * Math.cos(3 * t) -
    Math.cos(4 * t);
  return [x, y]; // raw max ~16 wide, ~12 tall
}

// ── Scatter ───────────────────────────────────────────────────────────────────

export type ScatterFlavour = "radial" | "drift" | "swirl";

/**
 * Generate random scatter positions inside a spheroid.
 * Three distinct flavours to give each transition its own character.
 */
export function generateScatter(
  N: number,
  flavour: ScatterFlavour,
): ParticleData {
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);

  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number;

    switch (flavour) {
      case "radial": {
        // Uniform random on sphere surface * random radius — explosion
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r = 0.8 + Math.random() * 2.8;
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.sin(phi) * Math.sin(theta);
        z = r * Math.cos(phi) - 0.5;
        break;
      }
      case "drift": {
        // Disc-shaped drift — particles float sideways and fall
        const angle = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 2.5;
        x = r * Math.cos(angle);
        y = (Math.random() - 0.5) * 4.0;
        z = (Math.random() - 0.5) * 1.2;
        break;
      }
      case "swirl": {
        // Logarithmic spiral — swirling vortex feel.
        // Use triangular distribution (sum of 2 uniforms) so the center is
        // naturally populated — eliminates the dark void during transition.
        const t = Math.random() * Math.PI * 6;
        const r = (Math.random() + Math.random()) * 1.25; // triangular 0–2.5, peak 1.25
        const spin = t * 0.3;
        x = r * Math.cos(t + spin);
        y = r * Math.sin(t + spin) * 0.7;
        z = (Math.random() - 0.5) * 1.0;
        break;
      }
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // HDR colours so individual scatter sparkles bloom at the low per-particle alpha.
    // lum > 1.0 means: lum × alpha (0.12) > bloom threshold (0.15) → individual glow.
    const lum = 1.4 + Math.random() * 1.0; // 1.4 – 2.4 HDR
    colors[i * 3] = lum * 0.8;
    colors[i * 3 + 1] = lum * 0.76;
    colors[i * 3 + 2] = lum * 1.0;
  }

  return { positions, colors };
}

// ── Thread + Heart ────────────────────────────────────────────────────────────

/**
 * Section 3 — "The Red Thread of Fate"
 *
 * Particle layout:
 *   40% → cubic Bezier thread (left → right, curving through centre)
 *   35% → parametric heart (centred, scaled, offset above thread midpoint)
 *   25% → floating magical dust (random around the scene)
 *
 * All generated procedurally — no image assets.
 */
export function generateThreadHeart(N: number): ParticleData {
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);

  const threadCount = Math.floor(N * 0.4);
  const heartCount = Math.floor(N * 0.35);
  const dustCount = N - threadCount - heartCount;

  // ── Thread: cubic Bezier P0→P3 with two control points ─────────────────────
  // Bezier passes through -1.3 on left, +1.3 on right, bulging gently up/down
  const P = {
    x0: -1.3,
    y0: -0.1,
    x1: -0.5,
    y1: 0.55, // control 1 — bows upward left
    x2: 0.5,
    y2: -0.55, // control 2 — dips downward right
    x3: 1.3,
    y3: -0.1,
  };

  for (let i = 0; i < threadCount; i++) {
    const t = i / threadCount;
    const x = bezier1D(P.x0, P.x1, P.x2, P.x3, t);
    const y = bezier1D(P.y0, P.y1, P.y2, P.y3, t);
    // Slight Z undulation along the thread
    const z = Math.sin(t * Math.PI * 2) * 0.12 + (Math.random() - 0.5) * 0.04;
    const jx = (Math.random() - 0.5) * 0.018;
    const jy = (Math.random() - 0.5) * 0.018;

    positions[i * 3] = x + jx;
    positions[i * 3 + 1] = y + jy;
    positions[i * 3 + 2] = z;

    // HDR red — individual thread particles bloom as glowing red sparks
    colors[i * 3] = 2.2;
    colors[i * 3 + 1] = 0.06 + Math.random() * 0.08;
    colors[i * 3 + 2] = 0.12 + Math.random() * 0.1;
  }

  // ── Heart: parametric curve, centred between thread endpoints ───────────────
  // Raw heart spans ≈ 32 × 24 units; scale to scene scale ≈ 0.30 → 0.75 × 0.55
  const HEART_SCALE = 0.028;
  const HEART_CX = 0.0; // centred horizontally
  const HEART_CY = 0.45; // lifted above the thread

  for (let i = 0; i < heartCount; i++) {
    const t = (i / heartCount) * Math.PI * 2;
    const [hx, hy] = heartPoint(t);
    const jx = (Math.random() - 0.5) * 0.02;
    const jy = (Math.random() - 0.5) * 0.02;
    const z = (Math.random() - 0.5) * 0.08;

    positions[(threadCount + i) * 3] = hx * HEART_SCALE + HEART_CX + jx;
    positions[(threadCount + i) * 3 + 1] = hy * HEART_SCALE + HEART_CY + jy;
    positions[(threadCount + i) * 3 + 2] = z;

    // HDR pink — heart particles glow bright magenta-rose
    const edgeFactor = Math.random();
    colors[(threadCount + i) * 3] = 2.0;
    colors[(threadCount + i) * 3 + 1] = 0.4 + edgeFactor * 0.4;
    colors[(threadCount + i) * 3 + 2] = 0.7 + edgeFactor * 0.4;
  }

  // ── Magical floating dust ────────────────────────────────────────────────────
  // Split: 35 % fills the heart interior (eliminates the hollow void),
  //        65 % scatters around the scene as ambient sparkle.
  const dustStart = threadCount + heartCount;
  const heartFillCount = Math.floor(dustCount * 0.35);

  for (let i = 0; i < dustCount; i++) {
    let x: number, y: number, z: number;

    if (i < heartFillCount) {
      // ── Inner heart fill — random points inside the heart boundary ──────────
      // Polar coords centred on the heart, uniformly fill the interior.
      const angle = Math.random() * Math.PI * 2;
      const heartR = Math.pow(Math.random(), 0.5) * 0.34; // sqrt → uniform 2-D fill
      x = heartR * Math.cos(angle);
      y = HEART_CY + heartR * Math.sin(angle) * 0.75;
      z = (Math.random() - 0.5) * 0.06;
    } else {
      // ── Scene scatter ────────────────────────────────────────────────────────
      const angle = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.7) * 1.6;
      x = r * Math.cos(angle);
      y = (Math.random() - 0.5) * 2.2;
      z = (Math.random() - 0.5) * 0.6;
    }

    positions[(dustStart + i) * 3] = x;
    positions[(dustStart + i) * 3 + 1] = y;
    positions[(dustStart + i) * 3 + 2] = z;

    // HDR warm gold for inner fill, cool pink for outer dust
    const warm = i < heartFillCount;
    const lum = Math.random();
    colors[(dustStart + i) * 3] = warm ? 1.9 + lum * 0.4 : 1.4 + lum * 0.6;
    colors[(dustStart + i) * 3 + 1] = warm ? 0.7 + lum * 0.3 : 0.5 + lum * 0.4;
    colors[(dustStart + i) * 3 + 2] = warm ? 0.3 + lum * 0.2 : 0.7 + lum * 0.4;
  }

  return { positions, colors };
}

/**
 * Slightly expand couple positions for the glowing final keyframe.
 * Each particle drifts outward by a small factor — creates a breathing aura.
 */
export function expandPositions(
  src: Float32Array,
  factor = 1.04,
): Float32Array {
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    dst[i] = src[i] * factor;
    dst[i + 1] = src[i + 1] * factor;
    dst[i + 2] = src[i + 2];
  }
  return dst;
}

/**
 * Tint all particles in a colour array towards a given target colour.
 * @param mix 0 = original, 1 = full target colour
 */
export function tintColors(
  src: Float32Array,
  target: [number, number, number],
  mix: number,
): Float32Array {
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    dst[i] = src[i] + (target[0] - src[i]) * mix;
    dst[i + 1] = src[i + 1] + (target[1] - src[i + 1]) * mix;
    dst[i + 2] = src[i + 2] + (target[2] - src[i + 2]) * mix;
  }
  return dst;
}
