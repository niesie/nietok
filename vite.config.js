import { defineConfig } from 'vite'

// GitHub Pages serves project repos from a subpath (/nietok/), so asset URLs
// break without this. Switch to '/' if a custom domain is added later.
export default defineConfig({
  base: process.env.NIETOK_BASE ?? '/nietok/',
  server: { host: true }, // so `npm run dev` is reachable from the phone over LAN
  build: { target: 'es2022' },
})
