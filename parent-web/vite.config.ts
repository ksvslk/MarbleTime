/// <reference types="vitest/config" />
import {defineConfig} from 'vite';

// No React plugin on purpose (few dependencies): Vite compiles TSX itself with the automatic JSX runtime
// (tsconfig "jsx": "react-jsx"). The cost is a full page reload instead of hot refresh while developing.
export default defineConfig({
  server: {
    // A fixed port, so the origin the backend allows for CORS (and pairUrl in dev) stays the same.
    port: 5173,
    strictPort: true,
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
