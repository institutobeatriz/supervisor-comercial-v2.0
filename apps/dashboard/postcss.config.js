import { fileURLToPath } from 'url'
import path from 'path'

// Resolve tailwind config by absolute path from this file's location.
// This is necessary because the Vite dev server may be invoked from a
// different CWD (e.g. a git worktree), causing Tailwind's default config
// discovery (which uses process.cwd()) to fail.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tailwindConfigPath = path.join(__dirname, 'tailwind.config.js')

export default {
  plugins: {
    tailwindcss: { config: tailwindConfigPath },
    autoprefixer: {},
  },
}
