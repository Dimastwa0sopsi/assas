import { defineConfig } from 'vite';

// base: './' — относительные пути к ассетам, поэтому сайт работает и локально,
// и на GitHub Pages по адресу https://<user>.github.io/<repo>/ (не из корня домена).
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
