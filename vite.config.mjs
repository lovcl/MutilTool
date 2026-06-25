import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webview',
        },
      },
    }),
    {
      name: 'electron-html',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
    modulePreload: false,
  },
});
