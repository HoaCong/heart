/**
 * SceneManager
 *
 * Owns: Three.js Scene + PerspectiveCamera.
 * Handles: cinematic camera drift (mouse parallax + scroll offset).
 * Everything is lerp-based — no sudden jumps.
 */

import * as THREE from "three";

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  // Target camera offsets driven by mouse & scroll
  private mouseTargetX = 0;
  private mouseTargetY = 0;
  private scrollCameraY = 0;

  // Smooth camera current position
  private camSmoothX = 0;
  private camSmoothY = 0;

  // Locked base Z — never changes to avoid dizzying zoom
  private readonly BASE_Z = 3.8;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      100,
    );
    this.camera.position.set(0, 0, this.BASE_Z);

    // Listen for mouse parallax
    window.addEventListener("mousemove", this.onMouseMove.bind(this), {
      passive: true,
    });
  }

  private onMouseMove(e: MouseEvent): void {
    // Normalise to -1 … +1
    this.mouseTargetX = (e.clientX / window.innerWidth - 0.5) * 2;
    this.mouseTargetY = -(e.clientY / window.innerHeight - 0.5) * 2;
  }

  /**
   * Update camera with smooth interpolation.
   * @param scrollProgress 0-1 overall scroll progress
   * @param dt             delta-time in seconds
   */
  update(scrollProgress: number, dt: number): void {
    // Subtle parallax limits — too much is distracting
    const maxX = 0.12;
    const maxY = 0.08;

    const targetX = this.mouseTargetX * maxX;
    const targetY = this.mouseTargetY * maxY + this.scrollCameraY;

    const smoothFactor = 1 - Math.pow(0.02, dt); // frame-rate independent lerp

    this.camSmoothX += (targetX - this.camSmoothX) * smoothFactor;
    this.camSmoothY += (targetY - this.camSmoothY) * smoothFactor;

    this.camera.position.x = this.camSmoothX;
    this.camera.position.y = this.camSmoothY;
    this.camera.position.z = this.BASE_Z;

    // Keep looking at scene origin
    this.camera.lookAt(0, 0, 0);
  }

  /** Called by TimelineController when scroll progress changes. */
  setScrollProgress(p: number): void {
    // Gentle vertical drift across the story (0 → −0.15 offset)
    this.scrollCameraY = -p * 0.15;
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
