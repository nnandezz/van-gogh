import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const { VITE_BASE_PATH } = loadEnv(mode, '.', 'VITE_')

  return {
    // Local development stays at '/', while GitHub Actions supplies the Pages path.
    base: VITE_BASE_PATH || '/',
    plugins: [react()],
  }
})
