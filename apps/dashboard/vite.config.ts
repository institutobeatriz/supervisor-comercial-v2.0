import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin Rollup para resolver imports de core-js vindos do canvg (dependência do jspdf)
// canvg foi compilado com @babel/plugin-transform-runtime e referencia polyfills
// de core-js que são desnecessários em browsers modernos (build de produção)
const stubCoreJs = {
  name: 'stub-core-js',
  resolveId(source: string) {
    if (source.startsWith('core-js/')) {
      return '\0virtual:core-js-stub'
    }
  },
  load(id: string) {
    if (id === '\0virtual:core-js-stub') {
      return 'export default undefined; export {};'
    }
  },
}

// Plugin esbuild equivalente para o optimizeDeps (dev mode)
const esbuildStubCoreJs = {
  name: 'esbuild-stub-core-js',
  setup(build: any) {
    build.onResolve({ filter: /^core-js\// }, () => ({
      path: 'stub-core-js-ns',
      namespace: 'stub-core-js-ns',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub-core-js-ns' }, () => ({
      contents: 'export default undefined;',
      loader: 'js',
    }))
  },
}

export default defineConfig({
  plugins: [react(), stubCoreJs],
  build: {
    // exceljs e jspdf ficam em chunks lazy carregados somente na tela de relatorios.
    // Aumenta limite de warning para evitar falso positivo no build principal.
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [esbuildStubCoreJs],
    },
  },
  server: {
    port: 3001,
    proxy: {
      // Rota SSE: desabilita buffering para suportar stream em tempo real
      '/api/alerts/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Necessário para SSE: desabilita compressão e buffering
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, _req, res) => {
            res.setHeader('X-Accel-Buffering', 'no')
          })
        },
      },
      // Demais rotas /api
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
