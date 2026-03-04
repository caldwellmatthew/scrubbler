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
    proxy: {
      '/auth': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/history': 'http://127.0.0.1:3000',
      '/now-playing': 'http://127.0.0.1:3000',
      '/poll': 'http://127.0.0.1:3000',
      '/lastfm': 'http://127.0.0.1:3000',
      '/explorer': 'http://127.0.0.1:3000',
    },
  },
});
