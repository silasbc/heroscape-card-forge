import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/** Dev-only: POST /__save?name=x.png writes the body to ./.dev-exports so renders can be inspected. */
function devSave(): Plugin {
  return {
    name: 'dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x')
        const name = (url.searchParams.get('name') ?? 'out.bin').replace(/[^a-z0-9._-]/gi, '_')
        const dir = path.resolve(process.cwd(), '.dev-exports')
        fs.mkdirSync(dir, { recursive: true })
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const file = path.join(dir, name)
          fs.writeFileSync(file, Buffer.concat(chunks))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, file, bytes: fs.statSync(file).size }))
        })
      })
    },
  }
}

// Deployed at https://silasbc.github.io/heroscape-card-forge/
export default defineConfig({
  plugins: [react(), devSave()],
  base: '/heroscape-card-forge/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
