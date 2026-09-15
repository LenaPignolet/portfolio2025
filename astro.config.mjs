// @ts-check
import { defineConfig } from 'astro/config';
import vue from "@astrojs/vue";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  base: '/',
  integrations: [vue()]
});
