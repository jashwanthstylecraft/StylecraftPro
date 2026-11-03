import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // These load lazily (scanner screens). Listing them makes the dev server prepare them at startup;
  // otherwise it finds them late, re-bundles, and the first scanner visit fails with a 504.
  optimizeDeps: { include: ['tesseract.js', '@zxing/library', 'jsqr', '@mediapipe/tasks-vision'] },
})
