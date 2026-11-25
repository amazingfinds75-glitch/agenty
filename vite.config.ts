import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mirrors the headers server/index.mjs sends, so production and preview behave alike.
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const baseHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
}

export default defineConfig({
  plugins: [react()],
  server: {
    // Reachable from a phone or tablet on the same Wi-Fi while developing.
    host: true,
    proxy: {
      '/api': 'http://localhost:8787',
    },
    // CSP is relaxed in dev because Vite injects the React refresh preamble inline.
    headers: baseHeaders,
  },
  preview: {
    headers: { ...baseHeaders, 'content-security-policy': CSP },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
