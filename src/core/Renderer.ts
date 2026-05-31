/**
 * Renderer
 *
 * Owns: WebGLRenderer + EffectComposer (UnrealBloom → OutputPass).
 * The bloom pass transforms light-dust particles into luminous glowing orbs.
 * Strength is exposed so TimelineController can intensify it for the
 * "Together" finale.
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  constructor() {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // off — particle systems don't benefit
      alpha: false,
      powerPreference: "high-performance",
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── Post-processing chain: RenderPass → UnrealBloom → OutputPass ─────────
    this.composer = new EffectComposer(this.renderer);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.45, // strength
      0.28, // radius
      0.55, // threshold
    );

    window.addEventListener("resize", this.onResize.bind(this), {
      passive: true,
    });
  }

  /** Must be called after SceneManager creates the scene + camera. */
  initComposer(scene: THREE.Scene, camera: THREE.Camera): void {
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  setBloomStrength(v: number): void {
    this.bloomPass.strength = v;
  }

  setBloomRadius(v: number): void {
    this.bloomPass.radius = v;
  }

  setBloomThreshold(v: number): void {
    this.bloomPass.threshold = v;
  }

  onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }
}
