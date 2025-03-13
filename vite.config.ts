import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get environment mode
const mode = process.env.NODE_ENV || 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  mode,
  define: {
    // Use import.meta.env for Vite environment variables
    'process.env': {
      NODE_ENV: JSON.stringify(mode),
      VITE_API_URL: JSON.stringify(process.env.VITE_API_URL),
      VITE_SUPABASE_URL: JSON.stringify(process.env.VITE_SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
      JUPITER_API_KEY: JSON.stringify(process.env.JUPITER_API_KEY)
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    // Ensure index.html is copied
    copyPublicDir: true,
    // Add CSS handling
    cssCodeSplit: true,
    cssMinify: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        format: 'es',
        // Improve chunking strategy
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split('.').at(1);
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            return 'assets/images/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
        manualChunks: {
          vendor: ['react', 'react-dom', '@tanstack/react-query'],
          icons: ['lucide-react'],
          supabase: ['@supabase/supabase-js'],
          charts: ['lightweight-charts'],
          technical: ['technicalindicators']
        }
      }
    },
    emptyOutDir: true
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: true
  },
  preview: {
    port: parseInt(process.env.PORT || '3000'),
    host: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    },
    // Add extensions to improve module resolution
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
  }
});