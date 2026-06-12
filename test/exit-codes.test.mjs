/**
 * Exit-code propagation tests.
 *
 * Envoke must forward the wrapped script's exit status to its caller —
 * a swallowed non-zero exit code turns failing test suites green in CI.
 * Runs the BUILT cli (dist/index.js) against fixture projects covering both
 * resolution branches: direct relative paths and tsconfig path mappings.
 */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'dist', 'index.js')

function runEnvoke(cwd, scriptArgument) {
  return spawnSync(process.execPath, [cli, scriptArgument], {
    cwd,
    stdio: 'pipe',
    env: process.env,
  })
}

const cases = [
  { name: 'direct path, passing script', cwd: 'direct', script: './pass.ts', expected: 0 },
  { name: 'direct path, failing script', cwd: 'direct', script: './fail.ts', expected: 7 },
  { name: 'mapped path, passing script', cwd: 'mapped', script: '@scripts/pass', expected: 0 },
  { name: 'mapped path, failing script', cwd: 'mapped', script: '@scripts/fail', expected: 5 },
  { name: 'missing script', cwd: 'direct', script: './does-not-exist.ts', expected: 1 },
]

let failures = 0
for (const testCase of cases) {
  const cwd = join(here, 'fixtures', testCase.cwd)
  const result = runEnvoke(cwd, testCase.script)
  try {
    assert.equal(
      result.status,
      testCase.expected,
      `${testCase.name}: expected exit ${testCase.expected}, got ${result.status}\n` +
        `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
    console.log(`PASS ${testCase.name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${error.message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log('\nAll exit-code tests passed')
