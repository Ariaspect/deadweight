import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/deadweight/' : '/',
  build: { target: 'es2022', sourcemap: false },
}));
