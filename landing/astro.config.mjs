// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@docs': path.resolve(import.meta.dirname, '../docs')
      }
    },
    server: {
      fs: { allow: ['..'] }
    }
  }
});