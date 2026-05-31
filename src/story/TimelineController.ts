/**
 * TimelineController
 *
 * The central director of the experience.
 *
 * Architecture:
 *  - Eight keyframes define states at scroll progress 0, 0.125, 0.25 … 1.0
 *  - Seven segments connect adjacent keyframes
 *  - GSAP ScrollTrigger scrubs a 0→1 progress value
 *  - On each tick we find the active segment, upload its two position/colour
 *    buffers to the ParticleEngine ONLY when the segment changes (boundary
 *    crossing), then drive uProgress as a cheap uniform update every frame
 *
 * Keyframe timeline:
 *   0.000  Girl   (assembled)
 *   0.125  Scatter-radial
 *   0.250  Boy    (assembled)
 *   0.375  Scatter-drift
 *   0.500  Thread + Heart  (procedural)
 *   0.625  Scatter-swirl
 *   0.750  Couple (assembled)
 *   1.000  Couple — glow finale
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ParticleEngine } from "../core/ParticleEngine";
import type { Renderer } from "../core/Renderer";
import type { SceneManager } from "../core/SceneManager";
import type { ParticleData } from "../loaders/ImageParticleLoader";
import {
  expandPositions,
  generateScatter,
  generateThreadHeart,
  tintColors,
} from "../utils/ProceduralShapes";
import type { PortraitOverlay } from "./PortraitOverlay";
import type { SectionController } from "./SectionController";

gsap.registerPlugin(ScrollTrigger);

// ── Colour palettes ────────────────────────────────────────────────────────────
const C = {
  girl: [0.88, 0.88, 1.0] as [number, number, number],
  boy: [0.82, 0.9, 1.0] as [number, number, number],
  couple: [1.0, 0.96, 0.84] as [number, number, number],
  glow: [1.0, 0.98, 0.9] as [number, number, number],
};

interface Keyframe {
  time: number;
  positions: Float32Array;
  colors: Float32Array;
  noiseStrength: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  sectionIndex: number; // 0-3; -1 = transition
}

interface LoadedImages {
  girl: ParticleData;
  boy: ParticleData;
  couple: ParticleData;
}

export class TimelineController {
  private readonly engine: ParticleEngine;
  private readonly scene: SceneManager;
  private readonly renderer: Renderer;
  private readonly ui: SectionController;
  private readonly portraits: PortraitOverlay;

  private keyframes: Keyframe[] = [];
  private currentSegment = -1;

  constructor(
    engine: ParticleEngine,
    scene: SceneManager,
    renderer: Renderer,
    ui: SectionController,
    portraits: PortraitOverlay,
    images: LoadedImages,
    N: number,
  ) {
    this.engine = engine;
    this.scene = scene;
    this.renderer = renderer;
    this.ui = ui;
    this.portraits = portraits;

    this.buildKeyframes(images, N);
  }

  // ── Keyframe construction ──────────────────────────────────────────────────

  private buildKeyframes(images: LoadedImages, N: number): void {
    const scatter1 = generateScatter(N, "radial");
    const scatter2 = generateScatter(N, "drift");
    const scatter3 = generateScatter(N, "swirl");
    const thread = generateThreadHeart(N);

    const coupleGlowPos = expandPositions(images.couple.positions, 1.02);
    const coupleGlowColors = tintColors(images.couple.colors, C.glow, 0.08);

    this.keyframes = [
      // ── 0: Girl assembled ─────────────────────────────────────────────────
      {
        time: 0.0,
        positions: images.girl.positions,
        colors: images.girl.colors,
        noiseStrength: 0.004,
        bloomStrength: 0.22,
        bloomRadius: 0.18,
        bloomThreshold: 0.72,
        sectionIndex: 0,
      },
      // ── 1: Scatter (radial explosion) ─────────────────────────────────────
      {
        time: 0.125,
        positions: scatter1.positions,
        colors: scatter1.colors,
        noiseStrength: 0.08,
        bloomStrength: 0.75,
        bloomRadius: 0.4,
        bloomThreshold: 0.42,
        sectionIndex: -1,
      },
      // ── 2: Boy assembled ──────────────────────────────────────────────────
      {
        time: 0.25,
        positions: images.boy.positions,
        colors: images.boy.colors,
        noiseStrength: 0.004,
        bloomStrength: 0.22,
        bloomRadius: 0.18,
        bloomThreshold: 0.72,
        sectionIndex: 1,
      },
      // ── 3: Scatter (drift / falling) ──────────────────────────────────────
      {
        time: 0.375,
        positions: scatter2.positions,
        colors: scatter2.colors,
        noiseStrength: 0.08,
        bloomStrength: 0.75,
        bloomRadius: 0.4,
        bloomThreshold: 0.42,
        sectionIndex: -1,
      },
      // ── 4: Thread + Heart ─────────────────────────────────────────────────
      {
        time: 0.5,
        positions: thread.positions,
        colors: thread.colors,
        noiseStrength: 0.022,
        bloomStrength: 0.95,
        bloomRadius: 0.36,
        bloomThreshold: 0.34,
        sectionIndex: 2,
      },
      // ── 5: Scatter (swirling vortex) ──────────────────────────────────────
      {
        time: 0.625,
        positions: scatter3.positions,
        colors: scatter3.colors,
        noiseStrength: 0.09,
        bloomStrength: 0.8,
        bloomRadius: 0.42,
        bloomThreshold: 0.4,
        sectionIndex: -1,
      },
      // ── 6: Couple assembled ───────────────────────────────────────────────
      {
        time: 0.75,
        positions: images.couple.positions,
        colors: images.couple.colors,
        noiseStrength: 0.0035,
        bloomStrength: 0.24,
        bloomRadius: 0.2,
        bloomThreshold: 0.7,
        sectionIndex: 3,
      },
      // ── 7: Couple — glowing finale ────────────────────────────────────────
      {
        time: 1.0,
        positions: coupleGlowPos,
        colors: coupleGlowColors,
        noiseStrength: 0.003,
        bloomStrength: 0.38,
        bloomRadius: 0.22,
        bloomThreshold: 0.66,
        sectionIndex: 3,
      },
    ];
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  /** Set up initial state and GSAP ScrollTrigger. */
  initialize(): void {
    // Prime segment 0 so particles are visible immediately
    this.applySegment(0, 0);
    this.updatePortraitOverlays(0);

    ScrollTrigger.create({
      trigger: "#scroll-container",
      start: "top top",
      end: "bottom bottom",
      scrub: 1.8, // cinematic lag — scroll feels weighty
      onUpdate: (self) => this.onScrollUpdate(self.progress),
    });
  }

  // ── Scroll update (called every frame by ScrollTrigger) ────────────────────

  private onScrollUpdate(t: number): void {
    // Find which segment we're in
    const kf = this.keyframes;
    let segIdx = 0;
    for (let i = 0; i < kf.length - 2; i++) {
      if (t >= kf[i].time && t < kf[i + 1].time) {
        segIdx = i;
        break;
      }
    }
    if (t >= kf[kf.length - 2].time) {
      segIdx = kf.length - 2;
    }

    // Segment changed — upload new position / colour buffers
    if (segIdx !== this.currentSegment) {
      this.applySegment(segIdx, t);
    }

    // Progress within the segment (0→1)
    const kfA = kf[segIdx];
    const kfB = kf[segIdx + 1];
    const segLen = kfB.time - kfA.time;
    const local = segLen > 0 ? (t - kfA.time) / segLen : 0;

    this.engine.setProgress(local);

    // Interpolate bloom between segment endpoints
    const bloomStr =
      kfA.bloomStrength + (kfB.bloomStrength - kfA.bloomStrength) * local;
    const bloomRad =
      kfA.bloomRadius + (kfB.bloomRadius - kfA.bloomRadius) * local;
    const bloomThr =
      kfA.bloomThreshold + (kfB.bloomThreshold - kfA.bloomThreshold) * local;
    this.renderer.setBloomStrength(bloomStr);
    this.renderer.setBloomRadius(bloomRad);
    this.renderer.setBloomThreshold(bloomThr);

    // Camera scroll offset
    this.scene.setScrollProgress(t);
    this.updatePortraitOverlays(t);

    // Determine visible section for UI
    this.updateUI(segIdx, t, local);
  }

  /** Upload buffers for a new segment. */
  private applySegment(segIdx: number, _t: number): void {
    this.currentSegment = segIdx;
    const kfA = this.keyframes[segIdx];
    const kfB = this.keyframes[segIdx + 1];

    this.engine.setSegment(
      kfA.positions,
      kfA.colors,
      kfB.positions,
      kfB.colors,
      kfA.noiseStrength,
    );
  }

  /** Map scroll position to section index and fade UI accordingly. */
  private updateUI(segIdx: number, t: number, localProgress: number): void {
    const kfA = this.keyframes[segIdx];

    // During a scatter transition (sectionIndex -1) show neither section
    if (kfA.sectionIndex === -1) {
      const fade = 1 - localProgress;
      this.ui.setTextOpacity(fade * 0.5);
      return;
    }

    this.ui.setTextOpacity(1);
    this.ui.setSection(kfA.sectionIndex, t);
  }

  /** Blend in source photos on portrait beats so likeness stays recognisable. */
  private updatePortraitOverlays(t: number): void {
    const tri = (x: number, center: number, width: number): number => {
      const d = Math.abs(x - center);
      return Math.max(0, 1 - d / width);
    };

    const girl = tri(t, 0.0, 0.12) * 0.92;
    const boy = tri(t, 0.25, 0.12) * 0.92;

    const coupleBeat = tri(t, 0.75, 0.14);
    const coupleFinale = tri(t, 1.0, 0.3) * 0.9;
    const couple = Math.max(coupleBeat, coupleFinale) * 0.88;

    this.portraits.setOpacities(girl, boy, couple);
  }
}
