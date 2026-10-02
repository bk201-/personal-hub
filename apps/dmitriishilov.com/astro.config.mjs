import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://dmitriishilov.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
