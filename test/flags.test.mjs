/**
 * Flag-parsing tests.
 *
 * Envoke recognises `--production` / `--development` (setting NODE_ENV for the
 * child), `--verbose`/`-v`, and a `--` separator after which everything is
 * passed to the wrapped script verbatim. Envoke flags are never forwarded to
 * the wrapped script. Runs the BUILT cli (dist/index.js) against a fixture
 * that prints NODE_ENV and its argv.
 */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'dist', 'index.js')
const cwd = join(here, 'fixtures', 'direct')

function runEnvoke(args, envOverrides = {}) {
  const env = { ...process.env, ...envOverrides }
  delete env.NODE_ENV
  if (envOverrides.NODE_ENV !== undefined) env.NODE_ENV = envOverrides.NODE_ENV
  return spawnSync(process.execPath, [cli, ...args], { cwd, stdio: 'pipe', env })
}

function childNodeEnv(result) {
  const line = result.stdout.toString().split('\n').find((l) => l.startsWith('NODE_ENV='))
  return line ? line.slice('NODE_ENV='.length) : null
}

function childArgv(result) {
  const line = result.stdout.toString().split('\n').find((l) => l.startsWith('ARGV='))
  return line ? JSON.parse(line.slice('ARGV='.length)) : null
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

check('--production sets NODE_ENV=production, exit 0', () => {
  const r = runEnvoke(['./print-node-env.ts', '--production'])
  assert.equal(r.status, 0)
  assert.equal(childNodeEnv(r), 'production')
})

check('--development sets NODE_ENV=development', () => {
  const r = runEnvoke(['./print-node-env.ts', '--development'])
  assert.equal(r.status, 0)
  assert.equal(childNodeEnv(r), 'development')
})

check('both flags is an error (exit 1, conflict on stderr)', () => {
  const r = runEnvoke(['./print-node-env.ts', '--production', '--development'])
  assert.equal(r.status, 1)
  assert.match(r.stderr.toString().toLowerCase(), /both|conflict|cannot/)
})

check('ambient NODE_ENV passes through unchanged', () => {
  const r = runEnvoke(['./print-node-env.ts'], { NODE_ENV: 'staging' })
  assert.equal(r.status, 0)
  assert.equal(childNodeEnv(r), 'staging')
})

check('flag beats ambient NODE_ENV', () => {
  const r = runEnvoke(['./print-node-env.ts', '--production'], { NODE_ENV: 'development' })
  assert.equal(r.status, 0)
  assert.equal(childNodeEnv(r), 'production')
})

check('envoke flags are not forwarded to the script', () => {
  const r = runEnvoke(['./print-node-env.ts', '--production'])
  assert.deepEqual(childArgv(r), [])
})

check('-- separator forwards args verbatim, NODE_ENV untouched', () => {
  const r = runEnvoke(['./print-node-env.ts', '--', '--production'])
  assert.equal(r.status, 0)
  assert.deepEqual(childArgv(r), ['--production'])
  assert.equal(childNodeEnv(r), '')
})

check('--verbose still works and is filtered from script args', () => {
  const r = runEnvoke(['./print-node-env.ts', '--verbose'])
  assert.equal(r.status, 0)
  assert.deepEqual(childArgv(r), [])
})

if (failures > 0) {
  console.error(`\n${failures} flag test(s) failed`)
  process.exit(1)
}
console.log('\nAll flag tests passed')
