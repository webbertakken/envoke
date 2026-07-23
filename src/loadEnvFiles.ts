import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'dotenv'

export interface LoadEnvOptions {
  rootPath: string
  cwd: string
  nodeEnv?: string
}

export interface LoadEnvResult {
  env: Record<string, string>
  loadedFiles: string[]
}

/**
 * The `.env*` layers applied within a single directory, lowest precedence
 * first. Mode-specific layers are only considered when the mode is known.
 */
const fileLayers = (nodeEnv?: string): string[] => {
  const layers = ['.env', '.env.local']
  if (nodeEnv) layers.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`)
  return layers
}

/**
 * Reads `.env*` files from the repo root and the cwd (deduplicated when they
 * are the same directory) and merges them so that cwd beats root, and within a
 * directory `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`.
 * Missing files are silently skipped. Values are not applied to real
 * `process.env` here — the caller composes the final child environment.
 */
export const loadEnvFiles = ({ rootPath, cwd, nodeEnv }: LoadEnvOptions): LoadEnvResult => {
  const directories = rootPath === cwd ? [cwd] : [rootPath, cwd]
  const env: Record<string, string> = {}
  const loadedFiles: string[] = []

  for (const directory of directories) {
    for (const layer of fileLayers(nodeEnv)) {
      const file = join(directory, layer)
      if (!existsSync(file)) continue
      Object.assign(env, parse(readFileSync(file)))
      loadedFiles.push(file)
    }
  }

  return { env, loadedFiles }
}
