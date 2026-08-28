export interface ParsedArgs {
  script: string | undefined
  scriptArgs: string[]
  verbose: boolean
  nodeEnv: 'production' | 'development' | undefined
}

export class ArgsError extends Error {}

const isVerboseFlag = (arg: string): boolean => arg === '--verbose' || /^-v+/.test(arg)

/**
 * Splits argv into the wrapped script, its arguments, and envoke's own flags.
 * Envoke flags (`--verbose`/`-v`, `--production`, `--development`) are honoured
 * anywhere before a literal `--` separator; everything after `--` is passed to
 * the wrapped script verbatim. Passing both mode flags is rejected.
 */
export const parseArgs = (argv: string[]): ParsedArgs => {
  const separatorIndex = argv.indexOf('--')
  const before = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex)
  const after = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1)

  let verbose = false
  let production = false
  let development = false
  const positional: string[] = []

  for (const arg of before) {
    if (isVerboseFlag(arg)) verbose = true
    else if (arg === '--production') production = true
    else if (arg === '--development') development = true
    else positional.push(arg)
  }

  if (production && development) {
    throw new ArgsError('Cannot use both --production and --development.')
  }

  const nodeEnv = production ? 'production' : development ? 'development' : undefined
  const [script, ...positionalArgs] = positional

  return { script, scriptArgs: [...positionalArgs, ...after], verbose, nodeEnv }
}
