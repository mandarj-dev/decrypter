import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  preview: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
});
