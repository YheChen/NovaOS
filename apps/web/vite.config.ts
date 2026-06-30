import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NovaOS workspace SPA. Fully client-side; no server tier.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
});
