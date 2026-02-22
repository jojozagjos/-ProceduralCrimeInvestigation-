import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  define: {
    'import.meta.env.VITE_PEXELS_KEY': JSON.stringify(process.env.VITE_PEXELS_KEY ?? ''),
    'import.meta.env.VITE_UNSPLASH_KEY': JSON.stringify(process.env.VITE_UNSPLASH_KEY ?? ''),
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL ?? 'ws://localhost:4000'),
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? 'http://localhost:4000'),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
