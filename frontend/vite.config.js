import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy: chamadas pra /api no dev server são repassadas pro FastAPI.
// Assim o frontend usa fetch('/api/...') sem se preocupar com CORS/porta.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
