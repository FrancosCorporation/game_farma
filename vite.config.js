import { defineConfig } from 'vite';

// Dev: o jogo chama a API OpenAI-compatible do llama.cpp direto
// (CORS aberto no llama-server). Sem proxy necessário para o básico.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'assets' },
});