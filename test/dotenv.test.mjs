/**
 * .env-loading tests.
 *
 * Envoke loads `.env*` files (via dotenv) from the repo root and the cwd before
 * running the wrapped script. Precedence (highest wins): real environment >
 * flag/ambient NODE_ENV > cwd files > root files; within a directory
 * `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`. Real
 * environment variables are never overwritten by files. Mode files load only
 * when NODE_ENV is known. Runs the BUILT cli against throwaway temp fixtures.
 */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'dist', 'index.js')

const PRINT_SCRIPT = `const keys = process.argv.slice(2)
for (const key of keys) console.log(\`\${key}=\${process.env[key] ?? ''}\`)
`

const created = []

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'envoke-dotenv-'))
  created.push(dir)
  mkdirSync(join(dir, '.git'))
  return dir
}

function write(dir, name, content) {
  writeFileSync(join(dir, name), content)
}

function runEnvoke(cwd, args, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides }
  delete env.NODE_ENV
  if (envOverrides.NODE_ENV !== undefined) env.NODE_ENV = envOverrides.NODE_ENV
  return spawnSync(process.execPath, [cli, ...args], { cwd, stdio: 'pipe', env })
}

function parseOutput(result) {
  const map = {}
  for (const line of result.stdout.toString().split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1)
  }
  return map
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

check('.env in cwd is loaded', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'FROM_ENV=cwd-env\n')
  const r = runEnvoke(dir, ['./print-env.ts', 'FROM_ENV'])
  assert.equal(r.status, 0, r.stderr.toString())
  assert.equal(parseOutput(r).FROM_ENV, 'cwd-env')
})

check('.env.local overrides .env for the same key', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'KEY=base\n')
  write(dir, '.env.local', 'KEY=local\n')
  const r = runEnvoke(dir, ['./print-env.ts', 'KEY'])
  assert.equal(parseOutput(r).KEY, 'local')
})

check('--production loads .env.production over base/local', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'KEY=base\n')
  write(dir, '.env.local', 'KEY=local\n')
  write(dir, '.env.production', 'KEY=prod\n')
  const r = runEnvoke(dir, ['./print-env.ts', '--production', 'KEY'])
  assert.equal(parseOutput(r).KEY, 'prod')
})

check('.env.production.local overrides .env.production', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env.production', 'KEY=prod\n')
  write(dir, '.env.production.local', 'KEY=prod-local\n')
  const r = runEnvoke(dir, ['./print-env.ts', '--production', 'KEY'])
  assert.equal(parseOutput(r).KEY, 'prod-local')
})

check('mode files are not loaded without NODE_ENV', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'KEY=base\n')
  write(dir, '.env.production', 'KEY=prod\n')
  const r = runEnvoke(dir, ['./print-env.ts', 'KEY'])
  assert.equal(parseOutput(r).KEY, 'base')
})

check('real environment wins over .env files', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'KEY=file\n')
  const r = runEnvoke(dir, ['./print-env.ts', 'KEY'], { KEY: 'real' })
  assert.equal(parseOutput(r).KEY, 'real')
})

check('monorepo: cwd .env wins for shared keys, root-only keys visible', () => {
  const root = makeRoot()
  const app = join(root, 'packages', 'app')
  mkdirSync(app, { recursive: true })
  write(root, '.env', 'SHARED=root\nROOT_ONLY=root-only\n')
  write(app, 'print-env.ts', PRINT_SCRIPT)
  write(app, '.env', 'SHARED=cwd\n')
  const r = runEnvoke(app, ['./print-env.ts', 'SHARED', 'ROOT_ONLY'])
  const out = parseOutput(r)
  assert.equal(out.SHARED, 'cwd')
  assert.equal(out.ROOT_ONLY, 'root-only')
})

check('no .env files at all still runs fine', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  const r = runEnvoke(dir, ['./print-env.ts', 'KEY'])
  assert.equal(r.status, 0, r.stderr.toString())
  assert.equal(parseOutput(r).KEY, '')
})

check('malformed .env line is skipped, script still runs', () => {
  const dir = makeRoot()
  write(dir, 'print-env.ts', PRINT_SCRIPT)
  write(dir, '.env', 'THIS IS NOT VALID\nGOOD=yes\n')
  const r = runEnvoke(dir, ['./print-env.ts', 'GOOD'])
  assert.equal(r.status, 0, r.stderr.toString())
  assert.equal(parseOutput(r).GOOD, 'yes')
})

for (const dir of created) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
}

if (failures > 0) {
  console.error(`\n${failures} dotenv test(s) failed`)
  process.exit(1)
}
console.log('\nAll dotenv tests passed')
