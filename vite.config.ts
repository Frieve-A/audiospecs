import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  publicDir: 'public',
  appType: 'spa',
  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
});
