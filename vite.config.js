import { defineConfig } from 'vite';
import path from 'node:path';
import { copyProductionPublicAssets } from './scripts/public_build_assets.mjs';

function productionPublicAssetsPlugin() {
  let resolvedConfig;
  return {
    name: 'farmacheck-production-public-assets',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    async closeBundle() {
      const result = await copyProductionPublicAssets({
        root: resolvedConfig.root,
        publicDir: resolvedConfig.publicDir,
        outDir: path.resolve(resolvedConfig.root, resolvedConfig.build.outDir),
      });
      const excludedMb = (result.candidateBytesExcluded / 1024 / 1024).toFixed(1);
      console.info('[public assets] copied ' + result.copiedFiles + ' files; kept '
        + result.candidateFilesCopied + ' runtime/review candidate models; filtered '
        + result.candidateFilesExcluded + ' source-only files (' + excludedMb + ' MiB).');
    },
  };
}

// Dev: o llama.cpp continua sendo chamado localmente. O fallback NVIDIA passa
// pelo servidor do game para manter a chave fora do bundle e do navegador.
export default defineConfig({
  base: './',
  plugins: [productionPublicAssetsPlugin()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api/llm/fallback': {
        target: process.env.FARMA_API_PROXY_TARGET || 'http://127.0.0.1:4174',
        changeOrigin: true,
        timeout: 16000,
        proxyTimeout: 16000,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    copyPublicDir: false,
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
