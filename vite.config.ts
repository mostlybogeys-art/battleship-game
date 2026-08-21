// defineConfig comes from vitest/config rather than vite so the `test` key is
// typed; it re-exports Vite's own config type.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/battleship-game/',
  test: {
    // The suite covers pure logic (rules, AI, score data), none of which needs a
    // DOM, so the default node environment is both correct and fast.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})