import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
          motion: ['framer-motion'],
          // NOTE: recharts and monaco are deliberately NOT listed here —
          // manualChunks would force them into the critical path of every
          // page. They are only imported from lazy routes, so Rollup emits
          // them as on-demand chunks (~410 KB + MBs of workers off the
          // initial load, big win on slow mobile connections).
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
