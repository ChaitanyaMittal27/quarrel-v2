import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep the stable runtime cacheable separately; new voice code otherwise offsets the
  // gallery/results lazy-load savings and leaves the app chunk above 500 kB.
  build: { rolldownOptions: { output: { codeSplitting: { groups: [
    { name: 'react-vendor', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ },
  ] } } } },
  server: {
    // In development the browser talks only to Vite (one origin); Vite forwards API and
    // WebSocket traffic to the API service, so there are no CORS or cookie-domain issues.
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
