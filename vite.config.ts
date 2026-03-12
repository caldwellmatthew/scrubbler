import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'src/client',
  plugins: [preact()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/auth', '/health', '/history', '/now-playing', '/poll', '/lastfm', '/explorer'].map(
        (path) => [path, { target: 'http://127.0.0.1:3000', changeOrigin: true }],
      ),
    ),
  },
});
