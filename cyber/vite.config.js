import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VERCEL ? '/' : (process.env.VITE_BASE_PATH || './'),
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      ignored: [
        '**/venv/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/staticfiles/**',
        '**/.git/**',
        '**/ml_models/saved_models/**',
      ],
    },
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
