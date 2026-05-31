/**
 * ImageParticleLoader
 *
 * Loads a PNG, draws it to an offscreen canvas, then creates particle data
 * from actual image pixels.
 *
 * Goals:
 *  1. Keep true per-pixel RGB (no monochrome tint override)
 *  2. Remove white background while preserving skin tones
 *  3. Prioritise high-detail regions (eyes, lips, hair contours, jawline)
 *     using edge-aware weighted sampling
 */

export interface ParticleData {
  positions: Float32Array; // [x,y,z …] length = N*3
  colors: Float32Array; // [r,g,b …] length = N*3
}

interface VisiblePixel {
  px: number;
  py: number;
  r: number;
  g: number;
  b: number;
  brightness: number;
  saturation: number;
  edge: number;
  isSkin: boolean;
  focus: number;
  weight: number;
}

export class ImageParticleLoader {
  /**
   * @param url            Image URL (use `new URL(…, import.meta.url).href`)
   * @param particleCount  Target number of particles
   * @param scaleY         Half-height of particle field in scene units
   */
  static load(
    url: string,
    particleCount: number,
    scaleY = 1.0,
  ): Promise<ParticleData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const W = img.naturalWidth;
        const H = img.naturalHeight;

        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("ImageParticleLoader: no 2D context"));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, W, H);

        // ── Pass 1: collect eligible pixels from subject area ───────────────
        // White backgrounds in these PNGs are often fully opaque, so we cannot
        // rely only on alpha. We remove near-white + low-saturation background,
        // but keep bright skin highlights by considering saturation and edges.
        const WHITE_CHANNEL_CUTOFF = 242;
        const BRIGHT_BG_CUTOFF = 222;
        const isWideComposition = W / H > 1.2;

        const isLikelySkin = (r: number, g: number, b: number): boolean => {
          // Simple YCbCr skin range check (works for natural portrait photos).
          const y = 0.299 * r + 0.587 * g + 0.114 * b;
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          return y > 55 && cb > 77 && cb < 135 && cr > 132 && cr < 183;
        };

        const edgeStrengthAt = (
          px: number,
          py: number,
          idx: number,
          r: number,
          g: number,
          b: number,
        ): number => {
          let diffRight = 0;
          let diffDown = 0;

          if (px + 1 < W) {
            const ri = idx + 4;
            diffRight =
              (Math.abs(r - data[ri]) +
                Math.abs(g - data[ri + 1]) +
                Math.abs(b - data[ri + 2])) /
              3;
          }

          if (py + 1 < H) {
            const di = idx + W * 4;
            diffDown =
              (Math.abs(r - data[di]) +
                Math.abs(g - data[di + 1]) +
                Math.abs(b - data[di + 2])) /
              3;
          }

          const edgeRaw = (diffRight + diffDown) * 0.5; // 0..255
          return Math.min(1, edgeRaw / 96);
        };

        const collectPixels = (
          looseBackgroundReject: boolean,
        ): VisiblePixel[] => {
          const list: VisiblePixel[] = [];

          for (let py = 0; py < H; py++) {
            for (let px = 0; px < W; px++) {
              const idx = (py * W + px) * 4;
              const r = data[idx],
                g = data[idx + 1],
                b = data[idx + 2],
                a = data[idx + 3];

              if (a <= 64) continue;

              const brightness = (r + g + b) / 3;

              const maxCh = Math.max(r, g, b);
              const minCh = Math.min(r, g, b);
              const saturation = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh;

              const isNearWhite =
                r >= WHITE_CHANNEL_CUTOFF &&
                g >= WHITE_CHANNEL_CUTOFF &&
                b >= WHITE_CHANNEL_CUTOFF;

              const isBrightLowSat =
                brightness >= BRIGHT_BG_CUTOFF && saturation < 0.16;

              if (!looseBackgroundReject && (isNearWhite || isBrightLowSat)) {
                continue;
              }
              if (looseBackgroundReject && isNearWhite && saturation < 0.03) {
                continue;
              }

              const edge = edgeStrengthAt(px, py, idx, r, g, b);
              const darkness = 1.0 - brightness / 255;
              const isSkin = isLikelySkin(r, g, b);

              const nx = px / W;
              const ny = py / H;
              const headBand = Math.max(0, Math.min(1, (0.72 - ny) / 0.72));

              const centerSingle = Math.exp(-((nx - 0.5) * (nx - 0.5)) / 0.05);
              const centerDual = Math.max(
                Math.exp(-((nx - 0.35) * (nx - 0.35)) / 0.045),
                Math.exp(-((nx - 0.65) * (nx - 0.65)) / 0.045),
              );
              const centerFocus = isWideComposition ? centerDual : centerSingle;
              const focus = headBand * (0.45 + centerFocus * 0.55);

              // Weighted sampling: emphasise detail-rich areas while still
              // keeping enough smooth skin regions for a natural face.
              const detailWeight = 0.35 + edge * 2.2;
              const chromaWeight = 0.2 + saturation * 1.85;
              const shadeWeight = 0.45 + darkness * 0.75;

              const brightLowSatPenalty =
                brightness > 204 && saturation < 0.2
                  ? isSkin
                    ? 0.9
                    : ny > 0.55
                      ? 0.16
                      : 0.45
                  : 1.0;

              const torsoPenalty =
                ny > 0.58 && saturation < 0.14 && brightness > 170 ? 0.55 : 1.0;

              const skinBoost = isSkin ? 1.7 : 1.0;
              const faceFocusWeight = 1.0 + focus * 1.6;

              const weight =
                (detailWeight + chromaWeight + shadeWeight) *
                brightLowSatPenalty *
                torsoPenalty *
                skinBoost *
                faceFocusWeight;

              list.push({
                px,
                py,
                r,
                g,
                b,
                brightness,
                saturation,
                edge,
                isSkin,
                focus,
                weight,
              });
            }
          }

          return list;
        };

        let visible = collectPixels(false);

        // Fallback: if the mask is too strict for a given image, keep a looser
        // background rejection so facial highlights and bright clothes survive.
        if (visible.length < particleCount / 3) {
          visible = collectPixels(true);
        }

        if (visible.length === 0) {
          reject(
            new Error(`ImageParticleLoader: no visible pixels in "${url}"`),
          );
          return;
        }

        // ── Pass 2: build particle arrays ────────────────────────────────────
        const N = particleCount;
        const positions = new Float32Array(N * 3);
        const colors = new Float32Array(N * 3);
        const aspect = W / H;
        const scaleX = scaleY * aspect;
        const depthRange = 0.1;
        const vLen = visible.length;

        // Build cumulative weights for O(log N) weighted random sampling.
        const cumulative = new Float32Array(vLen);
        let totalWeight = 0;
        for (let i = 0; i < vLen; i++) {
          totalWeight += visible[i].weight;
          cumulative[i] = totalWeight;
        }

        const sampleVisiblePixel = (): VisiblePixel => {
          const target = Math.random() * totalWeight;
          let lo = 0;
          let hi = vLen - 1;

          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cumulative[mid] < target) {
              lo = mid + 1;
            } else {
              hi = mid;
            }
          }

          return visible[lo];
        };

        for (let n = 0; n < N; n++) {
          const src = sampleVisiblePixel();

          // Normalise image coords -> scene space
          const nx = (src.px / W - 0.5) * 2.0 * scaleX;
          const ny = -(src.py / H - 0.5) * 2.0 * scaleY; // flip Y
          const localDepthRange = depthRange * (1.0 - src.focus * 0.7);
          const nz = (Math.random() - 0.5) * localDepthRange;

          positions[n * 3] = nx;
          positions[n * 3 + 1] = ny;
          positions[n * 3 + 2] = nz;

          // Preserve source RGB, then lightly lift contrast/edges so the face
          // reads clearly at particle scale without collapsing into white.
          const baseR = src.r / 255;
          const baseG = src.g / 255;
          const baseB = src.b / 255;

          const mean = (baseR + baseG + baseB) / 3;
          const vibrance = 1.1 + src.saturation * 1.2 + src.focus * 0.15;

          const satR = mean + (baseR - mean) * vibrance;
          const satG = mean + (baseG - mean) * vibrance;
          const satB = mean + (baseB - mean) * vibrance;

          const brightnessNorm = src.brightness / 255;
          const shadowLift = 1.0 + (1.0 - brightnessNorm) * 0.28;
          const edgeLift = 1.0 + src.edge * 0.34;
          const focusLift = 1.0 + src.focus * 0.22 + (src.isSkin ? 0.08 : 0);
          const intensity = shadowLift * edgeLift * focusLift;

          colors[n * 3] = Math.min(1.35, Math.max(0, satR * intensity));
          colors[n * 3 + 1] = Math.min(1.35, Math.max(0, satG * intensity));
          colors[n * 3 + 2] = Math.min(1.35, Math.max(0, satB * intensity));
        }

        resolve({ positions, colors });
      };

      img.onerror = () =>
        reject(new Error(`ImageParticleLoader: failed to load "${url}"`));

      img.src = url;
    });
  }
}
