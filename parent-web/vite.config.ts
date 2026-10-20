/// <reference types="vitest/config" />
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';

// No React plugin on purpose (few dependencies): Vite compiles TSX itself with the automatic JSX runtime
// (tsconfig "jsx": "react-jsx"). The cost is a full page reload instead of hot refresh while developing.
export default defineConfig({
  server: {
    // A fixed port, so the origin the backend allows for CORS (and pairUrl in dev) stays the same.
    port: 5173,
    strictPort: true,
    // scripts/dev.sh serves this over https (a certificate for the Mac's Wi-Fi address), so a phone gets the
    // microphone and notifications; the backend's dev server is reached through it: /api/… and /realtime.
    https: process.env.DEV_HTTPS_CERT && process.env.DEV_HTTPS_KEY ? {cert: readFileSync(process.env.DEV_HTTPS_CERT), key: readFileSync(process.env.DEV_HTTPS_KEY)} : undefined,
    proxy: {
      '/api': {target: 'http://localhost:8787', rewrite: path => path.replace(/^\/api/, '')},
      '/realtime': {target: 'ws://localhost:8787', ws: true},
    },
  },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // React Router marks its modules "use client" (for React Server Components); meaningless in a plain SPA.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
