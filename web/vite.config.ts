import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Serves a normal `web/public/` directory. Data files (lvis-policies.json
// etc.) live at the repo root; web/public/ holds symlinks to them so they
// stay in one place during the migration. See web/README.md.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
