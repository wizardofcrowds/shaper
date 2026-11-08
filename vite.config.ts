import { defineConfig } from 'vite';
import { localFilesPlugin } from './server/plugin.ts';

export default defineConfig({
  plugins: [localFilesPlugin()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
