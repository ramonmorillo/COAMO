import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ruta base de publicación. Por defecto '/' (desarrollo local o dominio propio).
// GitHub Pages sin dominio propio (https://ramonmorillo.github.io/COAMO/): COAMO_BASE_PATH=/COAMO/
// (lo fija el workflow de despliegue).
const basePath = process.env.COAMO_BASE_PATH?.trim() || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
});
