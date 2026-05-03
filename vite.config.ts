import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'node:path';

function isMainProcessExternal(id: string): boolean {
  if (!id || id.startsWith('\0')) return false;
  if (id.startsWith('.') || id.startsWith('/') || /^[A-Za-z]:[\\/]/.test(id)) return false;
  if (id.startsWith('@/') || id.startsWith('@electron/')) return false;
  return true;
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron([
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
        /**
         * 不要在此处写顶层 `entry`：vite-plugin-electron 会 merge 出 lib.formats: ['es']（type:module），
         * 再与下方 formats: ['cjs'] 数组合并成 ['es','cjs']，Rollup 会输出两段内容进同一 index.cjs → SyntaxError。
         * 仅通过 vite.build.lib 声明入口与单一 cjs 格式即可避免与默认 lib 合并 formats。
         */
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
                /** 父级 package.json 为 type:module 时，.js 会被当作 ESM，require(preload) 必失败 */
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@electron': resolve(__dirname, 'electron'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
