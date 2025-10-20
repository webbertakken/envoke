import { existsSync } from 'node:fs'
import { spawnSync } from 'child_process'
import boxen from 'boxen'
import { dirname, join } from 'node:path'
import { getRootPath } from './getRootPath'
import chalk from 'chalk'
import { createRequire } from 'module'

// Resolve tsx binary using Node's module resolution
const require = createRequire(import.meta.url)
const tsxPackageJson = require.resolve('tsx/package.json')
const tsxBin = join(dirname(tsxPackageJson), 'dist', 'cli.mjs')

const currentPath = process.cwd()
const rootPath = getRootPath()
const isMonorepo = currentPath !== rootPath
const unfilteredArgs = process.argv.slice(2)
const isVerbose =
  unfilteredArgs.includes('--verbose') || unfilteredArgs.some((e) => Boolean(e.match(/^-v+/)))

const args = unfilteredArgs.filter((arg) => arg !== '--verbose' && !arg.match(/^-v+/))

const info = (message: string, ...data: any[]) => {
  console.log(chalk.magenta('[Envoke] ') + chalk.blue('Info') + `: ${message}`, ...data)
}
const error = (message: string, ...data: any[]) => {
  console.error(chalk.magenta('[Envoke] ') + chalk.red('Error') + `: ${message}`, ...data)
}
const debug = (message: string, ...data: any[]): void => {
  if (isVerbose) console.log(chalk.magenta('[Envoke] ') + chalk.gray(`Debug: ${message}`), ...data)
}

// Check if the first argument resolves to a file that exists
if (args.length > 0) {
  // Check that path is given

  const script = args[0]
  if (!script) {
    error('No path provided.')
    process.exit(1)
  }

  // Announce envoke is called successfully
  if (isVerbose)
    console.log(
      boxen(`Envoke - Running script: ${script}`, {
        padding: 1,
        margin: 1,
        borderStyle: 'single',
        borderColor: 'blue',
      }),
    )

  // Resolve path natively
  const path = join(currentPath, script)
  if (existsSync(path)) {
    debug('File exists:', path)
    spawnSync(process.execPath, [tsxBin, path, ...args.slice(1)], {
      cwd: currentPath,
      stdio: 'inherit',
      env: process.env,
    })
    process.exit(0)
  }

  // Read tsconfig to get path mappings
  // Resolve tsc from the user's project
  let tscBin: string
  try {
    const userRequire = createRequire(join(currentPath, 'package.json'))
    const typescriptPackageJson = userRequire.resolve('typescript/package.json')
    tscBin = join(dirname(typescriptPackageJson), 'bin', 'tsc')
  } catch {
    error('Failed to find TypeScript in project. Is TypeScript installed?')
    process.exit(1)
  }

  const runTsConfig = spawnSync(process.execPath, [tscBin, '--showConfig'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    cwd: currentPath,
  })
  if (runTsConfig.status !== 0) {
    error('Failed to run tsc --showConfig.')
    process.exit(1)
  }
  const tsConfigString = runTsConfig.stdout?.toString()
  if (!tsConfigString) {
    error('Failed to read tsconfig.json')
    process.exit(1)
  }
  const tsConfig = JSON.parse(tsConfigString)
  if (!tsConfig) {
    error('Failed to parse tsconfig.json')
    process.exit(1)
  }

  // Get paths
  const jsonConfig = JSON.parse(tsConfigString)
  const paths = jsonConfig?.compilerOptions?.paths
  if (!paths) {
    info('No paths found in tsconfig.json')
    if (isMonorepo) info(`You are in a monorepo, did you forget to extend the root tsconfig.json?`)
    error('Script file does not exist.')
    process.exit(1)
  }

  // Path keys: longest first for matching
  const pathKeys = Object.keys(paths).sort((a, b) => b.localeCompare(a))
  debug(`Paths found:\n - ${pathKeys.join('\n - ')}`)

  // Find matching path
  let resolvedPath: string | null = null
  for (const key of pathKeys) {
    const cleanKey = key.replace(/\*$/, '')
    if (script.startsWith(cleanKey)) {
      const cleanReplacement = paths[key][0].replace(/\*$/, '')
      const replacedPath = script.replace(cleanKey, cleanReplacement)
      const fullPath = join(rootPath, replacedPath)

      if (existsSync(fullPath)) {
        debug(`Resolved path: ${fullPath}`)
        resolvedPath = fullPath
        break
      }

      if (existsSync(fullPath + `.ts`)) {
        debug(`Resolved path: ${fullPath}.ts`)
        resolvedPath = fullPath + `.ts`
        break
      }

      debug(
        `Matched path, but did not find file.\nPath: ${key}\nFile: ${fullPath} (also checked .ts)`,
      )
    }
  }

  if (!resolvedPath) {
    error(`Script not found. ${script}`)
    process.exit(1)
  }

  spawnSync(process.execPath, [tsxBin, resolvedPath, ...args.slice(1)], {
    cwd: currentPath,
    stdio: 'inherit',
    env: process.env,
  })
}
