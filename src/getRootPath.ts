import { existsSync } from 'fs'
import { dirname, join } from 'path'

export const getRootPath = (currentDir = process.cwd()): string => {
  return existsSync(join(currentDir, '.git')) ? currentDir : getRootPath(dirname(currentDir))
}
