#!/usr/bin/env tsx

import { spawnSync } from 'child_process'

spawnSync('tsx', [`${import.meta.dirname}/execute.js`, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
})
