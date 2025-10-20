#!/usr/bin/env node

import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { join, dirname } from 'path'

// Resolve tsx binary using Node's module resolution
const require = createRequire(import.meta.url)
const tsxPackageJson = require.resolve('tsx/package.json')
const tsxBin = join(dirname(tsxPackageJson), 'dist', 'cli.mjs')

const result = spawnSync(process.execPath, [tsxBin, `${import.meta.dirname}/execute.js`, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  console.error('Failed to spawn tsx:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
