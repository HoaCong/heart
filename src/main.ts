/**
 * main.ts — Application entry point
 *
 * Boot order:
 *  1. Construct Renderer + SceneManager (synchronous, no assets)
 *  2. Initialise EffectComposer (needs scene + camera)
 *  3. Load three PNG images in parallel
 *  4. Create ParticleEngine + TimelineController
 *  5. Start the animation loop
 */

import "./style.css";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";

import { ParticleEngine } from "./core/ParticleEngine";
import { Renderer } from "./core/Renderer";
import { SceneManager } from "./core/SceneManager";
import { ImageParticleLoader } from "./loaders/ImageParticleLoader";
import { PortraitOverlay } from "./story/PortraitOverlay";
import { SectionController } from "./story/SectionController";
import { TimelineController } from "./story/TimelineController";

gsap.registerPlugin(ScrollTrigger);

// ── Asset URLs resolved by Vite at build time ─────────────────────────────────
const GIRL_URL = new URL("../assets/img_placeholder/girl.png", import.meta.url)
  .href;
const BOY_URL = new URL("../assets/img_placeholder/boy.png", import.meta.url)
  .href;
const COUPLE_URL = new URL(
  "../assets/img_placeholder/couple.png",
  import.meta.url,
).href;

const GIRL_SCALE_Y = 1.4;
const BOY_SCALE_Y = 1.4;
const COUPLE_SCALE_Y = 1.1;

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function loadPortraitTexture(url: string): Promise<THREE.Texture> {
  const img = await loadImageElement(url);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error(`Could not create 2D canvas for: ${url}`);

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imgData.data;

  const w2 = canvas.width,
    h2 = canvas.height;
  for (let row = 0; row < h2; row++) {
    for (let col = 0; col < w2; col++) {
      const i = (row * w2 + col) * 4;
      const r = px[i],
        g = px[i + 1],
        b = px[i + 2],
        a = px[i + 3];
      if (a === 0) continue;

      // --- Saturation-aware white-background removal ---
      // Low-saturation bright pixels (studio bg) are removed aggressively.
      // Pixels with real colour (skin, hair, clothes) survive.
      const dW = Math.sqrt((r - 255) ** 2 + (g - 255) ** 2 + (b - 255) ** 2);
      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      const sat = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh;

      // Expand the transparent zone for low-saturation near-white pixels (bg halo).
      // Bright, colourless pixels (sat < 0.18, brightness > 60%) get a tighter matte.
      const brightness = (r + g + b) / (3 * 255);
      const isBgLike = brightness > 0.6 && sat < 0.18;
      const lo = isBgLike ? 30 : 48;
      const hi = isBgLike ? 72 : 95;
      const t = Math.max(0, Math.min(1, (dW - lo) / (hi - lo)));
      let alpha = t * t * (3 - 2 * t); // smoothstep

      // --- Bottom fade: last 22 % of height fades to zero (avoids hard bottom edge) ---
      const yNorm = row / (h2 - 1); // 0 = top, 1 = bottom
      if (yNorm > 0.78) {
        const fade = 1 - (yNorm - 0.78) / 0.22;
        alpha *= Math.max(0, fade);
      }

      // --- Top fade: first 4 % (avoids sharp top boundary) ---
      if (yNorm < 0.04) alpha *= yNorm / 0.04;

      // --- Side fades: outermost 5 % on each side ---
      const xNorm = col / (w2 - 1);
      if (xNorm < 0.05) alpha *= xNorm / 0.05;
      else if (xNorm > 0.95) alpha *= (1 - xNorm) / 0.05;

      px[i + 3] = Math.round(a * alpha);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  const N = ParticleEngine.PARTICLE_COUNT;

  // 1. Core systems
  const sceneManager = new SceneManager();
  const renderer = new Renderer();
  renderer.initComposer(sceneManager.scene, sceneManager.camera);

  const ui = new SectionController();

  // 2. Load images in parallel
  const [
    girlData,
    boyData,
    coupleData,
    girlTexture,
    boyTexture,
    coupleTexture,
  ] = await Promise.all([
    ImageParticleLoader.load(GIRL_URL, N, GIRL_SCALE_Y),
    ImageParticleLoader.load(BOY_URL, N, BOY_SCALE_Y),
    ImageParticleLoader.load(COUPLE_URL, N, COUPLE_SCALE_Y),
    loadPortraitTexture(GIRL_URL),
    loadPortraitTexture(BOY_URL),
    loadPortraitTexture(COUPLE_URL),
  ]);

  const portraitOverlay = new PortraitOverlay(sceneManager.scene, {
    girl: { texture: girlTexture, scaleY: GIRL_SCALE_Y },
    boy: { texture: boyTexture, scaleY: BOY_SCALE_Y },
    couple: { texture: coupleTexture, scaleY: COUPLE_SCALE_Y },
  });

  // 3. Particle engine
  const engine = new ParticleEngine(sceneManager.scene);

  // 4. Timeline (builds keyframes + registers ScrollTrigger)
  const timeline = new TimelineController(
    engine,
    sceneManager,
    renderer,
    ui,
    portraitOverlay,
    { girl: girlData, boy: boyData, couple: coupleData },
    N,
  );
  timeline.initialize();

  // 5. Hide loading screen
  ui.hideLoader();

  // 6. Resize handler — both systems respond independently
  window.addEventListener(
    "resize",
    () => {
      renderer.onResize();
      sceneManager.onResize();
      engine.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    },
    { passive: true },
  );

  // 7. Render loop — no allocations, no conditionals on hot path
  let lastTime = 0;

  function frame(now: number) {
    requestAnimationFrame(frame);

    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap delta at 50 ms
    const elapsed = now / 1000;
    lastTime = now;

    engine.update(elapsed);
    sceneManager.update(ScrollTrigger.getAll()[0]?.progress ?? 0, dt);
    renderer.render();
  }

  requestAnimationFrame(frame);
}

init().catch((err) => {
  console.error("[heart-story] Fatal error during init:", err);
  const loaderText = document.getElementById("loader-text");
  if (loaderText) {
    loaderText.textContent = "Could not load the story. Please refresh.";
  }
});
