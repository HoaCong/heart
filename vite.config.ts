import { defineConfig } from 'vite';

export default defineConfig({
  // './' so relative asset paths work on GitHub Pages subdirectory deploys
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      output: {
        manualChunks: {
          three: ['three'],
          gsap:  ['gsap'],
        },
      },
    },
  },
  // Expose assets outside src/ so Vite copies them into the build
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.glsl'],
});
