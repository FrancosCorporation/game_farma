import { defineConfig } from 'vite';

// Dev: o jogo chama a API OpenAI-compatible do llama.cpp direto
// (CORS aberto no llama-server). Sem proxy necessário para o básico.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    // three.js num chunk próprio: o app (pequeno) pode ser cacheado/atualizado sem
    // rebaixar a engine 3D de novo, e o primeiro load no celular fica previsível.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});