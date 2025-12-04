import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Bind to all interfaces - accessible via localhost and 127.0.0.1
    port: 5173,
    strictPort: false, // Allow fallback ports in case 5173 is in use
    proxy: {
      // Proxy API requests to backend in development
      // In production, VITE_API_URL must be set to full backend URL
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    // Ensure environment variables are replaced at build time
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  },
  // Define environment variable prefix (Vite automatically includes VITE_* vars)
  envPrefix: 'VITE_'
})
