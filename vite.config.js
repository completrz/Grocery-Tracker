import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import legalPages from './vite-legal.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), legalPages()],
})
