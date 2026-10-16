import { build } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = 'node_modules/.tmp/cloud-save-tests'
await build({
  root,
  configFile: false,
  publicDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  build: {
    ssr: 'scripts/test-cloud-save.ts',
    outDir: output,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'test-cloud-save.mjs' } }
  }
})
await import(new URL(`../${output}/test-cloud-save.mjs`, import.meta.url).href)
