#!/usr/bin/env node

import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// import.meta.dirname is unavailable before Node 20.11; derive it from the URL
// so envoke runs on every supported Node version (engines: >=18).
const here = dirname(fileURLToPath(import.meta.url))

// Resolve tsx binary using Node's module resolution
const require = createRequire(import.meta.url)
const tsxPackageJson = require.resolve('tsx/package.json')
const tsxBin = join(dirname(tsxPackageJson), 'dist', 'cli.mjs')

const result = spawnSync(process.execPath, [tsxBin, join(here, 'execute.js'), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error('Failed to spawn tsx:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
