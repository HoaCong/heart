/**
 * ParticleEngine
 *
 * Manages a single fixed-size GPU particle system.
 * All morphing is GPU-side: we update two position/colour buffers
 * (positionA = "from", aPositionB = "to") and drive uProgress via GSAP.
 * Segment transitions only update CPU→GPU data at keyframe boundaries,
 * so there are zero per-frame CPU allocations.
 */

import * as THREE from "three";
import fragmentShader from "../shaders/fragment.glsl?raw";
import vertexShader from "../shaders/vertex.glsl?raw";

export class ParticleEngine {
  static readonly PARTICLE_COUNT = 26_000;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  // CPU-side typed arrays — reused across segment changes, no new allocations
  private readonly positionAData: Float32Array;
  private readonly positionBData: Float32Array;
  private readonly randomData: Float32Array;
  private readonly sizeData: Float32Array;
  private readonly colorAData: Float32Array;
  private readonly colorBData: Float32Array;

  // GPU attribute handles
  private readonly positionAAttr: THREE.BufferAttribute;
  private readonly positionBAttr: THREE.BufferAttribute;
  private readonly colorAAttr: THREE.BufferAttribute;
  private readonly colorBAttr: THREE.BufferAttribute;

  // Uniforms — mutated directly by TimelineController / animation loop
  readonly uniforms: {
    uProgress: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
    uNoiseStrength: THREE.IUniform<number>;
    uPixelRatio: THREE.IUniform<number>;
  };

  constructor(scene: THREE.Scene) {
    const N = ParticleEngine.PARTICLE_COUNT;

    // ── Allocate all CPU buffers once ────────────────────────────────────────
    this.positionAData = new Float32Array(N * 3);
    this.positionBData = new Float32Array(N * 3);
    this.randomData = new Float32Array(N);
    this.sizeData = new Float32Array(N);
    this.colorAData = new Float32Array(N * 3);
    this.colorBData = new Float32Array(N * 3);

    // ── Per-particle constants (randomness + size variation) ─────────────────
    for (let i = 0; i < N; i++) {
      this.randomData[i] = Math.random();
      // Size in world-space pixels at 1-unit distance (maps to ~1.5-5px on screen)
      const r = Math.random();
      this.sizeData[i] = 1.5 + r * r * 2.0; // 1.5–3.5, skewed toward small
    }

    // ── GPU geometry ─────────────────────────────────────────────────────────
    this.geometry = new THREE.BufferGeometry();

    // THREE.js built-in "position" attr → our "positionA" in the vertex shader
    this.positionAAttr = new THREE.BufferAttribute(this.positionAData, 3);
    this.positionBAttr = new THREE.BufferAttribute(this.positionBData, 3);
    const randomAttr = new THREE.BufferAttribute(this.randomData, 1);
    const sizeAttr = new THREE.BufferAttribute(this.sizeData, 1);
    this.colorAAttr = new THREE.BufferAttribute(this.colorAData, 3);
    this.colorBAttr = new THREE.BufferAttribute(this.colorBData, 3);

    // Mark dynamic — GPU can optimise for frequent CPU→GPU updates
    this.positionAAttr.usage = THREE.DynamicDrawUsage;
    this.positionBAttr.usage = THREE.DynamicDrawUsage;
    this.colorAAttr.usage = THREE.DynamicDrawUsage;
    this.colorBAttr.usage = THREE.DynamicDrawUsage;

    this.geometry.setAttribute("position", this.positionAAttr);
    this.geometry.setAttribute("aPositionB", this.positionBAttr);
    this.geometry.setAttribute("aRandom", randomAttr);
    this.geometry.setAttribute("aSize", sizeAttr);
    this.geometry.setAttribute("aColorA", this.colorAAttr);
    this.geometry.setAttribute("aColorB", this.colorBAttr);

    // Disable frustum culling: our custom attributes control visibility
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

    // ── Uniforms ─────────────────────────────────────────────────────────────
    this.uniforms = {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uNoiseStrength: { value: 0.02 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };

    // ── Shader material ───────────────────────────────────────────────────────
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    // ── Points object ─────────────────────────────────────────────────────────
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Set which two keyframe states are being interpolated.
   * Called only at segment boundaries — NOT every frame.
   */
  setSegment(
    posA: Float32Array,
    colorA: Float32Array,
    posB: Float32Array,
    colorB: Float32Array,
    noiseStrength = 0.02,
  ): void {
    this.positionAData.set(posA);
    this.positionBData.set(posB);
    this.colorAData.set(colorA);
    this.colorBData.set(colorB);

    this.positionAAttr.needsUpdate = true;
    this.positionBAttr.needsUpdate = true;
    this.colorAAttr.needsUpdate = true;
    this.colorBAttr.needsUpdate = true;

    this.uniforms.uNoiseStrength.value = noiseStrength;
  }

  /** Drive morph progress 0→1 between the two segment keyframes. */
  setProgress(p: number): void {
    this.uniforms.uProgress.value = p;
  }

  /** Called every animation frame with elapsed time in seconds. */
  update(elapsed: number): void {
    this.uniforms.uTime.value = elapsed;
  }

  getPoints(): THREE.Points {
    return this.points;
  }
}
