import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NovaOS workspace SPA. Fully client-side; no server tier.
// `VITE_BASE` lets a deploy serve the app under a subpath (e.g. /NovaOS/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
