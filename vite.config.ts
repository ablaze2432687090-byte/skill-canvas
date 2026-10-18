import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: { ignored: ['**/Skill Canvas Data/**', '**/.tmp/**', '**/.skill-canvas/**', '**/work/**', '**/test-results/**', '**/playwright-report/**', '**/docs/screenshots*/**', '**/release/**', '**/desktop-dist/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/Skill Canvas Data/**', '**/.tmp/**', '**/.skill-canvas/**', '**/work/**', '**/release/**'] },
  },
});
