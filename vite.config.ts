import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { createUiDevWatchOptions } from './src/paperclip/lib/vite-watch';

function isMainProcessExternal(id: string): boolean {
  if (!id || id.startsWith('\0')) return false;
  if (id.startsWith('.') || id.startsWith('/') || /^[A-Za-z]:[\\/]/.test(id)) return false;
  if (id.startsWith('@/') || id.startsWith('@electron/') || id.startsWith('@shell/')) return false;
  return true;
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), electron([
    {
      entry: 'electron/main/index.ts',
      onstart(options) {
        options.startup();
      },
      vite: {
        build: {
          outDir: 'dist-electron/main',
          rollupOptions: {
            external: isMainProcessExternal,
          },
        },
      },
    },
    {
      onstart(options) {
        options.reload();
      },
      vite: {
        build: {
          outDir: 'dist-electron/preload',
          lib: {
            entry: 'electron/preload/index.ts',
            formats: ['cjs'],
          },
          rollupOptions: {
            external: ['electron'],
            output: {
              inlineDynamicImports: true,
              entryFileNames: 'index.cjs',
            },
          },
        },
      },
    },
  ])],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/paperclip'),
      '@shell': resolve(__dirname, 'src/shell'),
      '@electron': resolve(__dirname, 'electron'),
      lexical: resolve(__dirname, 'node_modules/lexical/Lexical.mjs'),
    },
  },
  esbuild:
    mode === 'production'
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
  server: {
    /** 与 Electron 开发态 `devServerUrlForElectron` 对齐，避免 Windows 上 localhost→::1 与监听栈不一致导致白屏 */
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    watch: createUiDevWatchOptions(process.cwd()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
  },
}));
