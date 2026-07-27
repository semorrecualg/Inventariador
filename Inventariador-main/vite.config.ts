
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: '/',
  plugins: [
    {
      name: 'wasm-mime-type',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0];
          if (url?.endsWith('.wasm')) {
            console.log(`[WASM Middleware] Serving ${url} with application/wasm`);
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          }
          next();
        });
      }
    },
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: '.'
        },
        {
          src: 'node_modules/sql.js/dist/sql-wasm.js',
          dest: '.'
        },
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: 'assets'
        },
        {
          src: 'node_modules/sql.js/dist/sql-wasm.js',
          dest: 'assets'
        }
      ]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'GBR Auditoria Patrimonial',
        short_name: 'GBR Auditor',
        description: 'Sistema de Inventário e Auditoria de Ativo Imobilizado',
        theme_color: '#0a0f1e',
        background_color: '#0a0f1e',
        display: 'standalone',
        start_url: './index.html',
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        dontCacheBustURLsMatching: /\.wasm$/,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  define: {
    'process.env.APP_URL': JSON.stringify(process.env.APP_URL || ''),
    'process.env.SHARED_APP_URL': JSON.stringify(process.env.SHARED_APP_URL || '')
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: false,
    allowedHosts: 'all',
    fs: {
      allow: ['..']
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*',
    }
  },
  optimizeDeps: {
    exclude: ['sql.js', 'jeep-sqlite', '@capacitor-community/sqlite']
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1600,
  }
});
