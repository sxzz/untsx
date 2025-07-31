import * as tsEsParser from '@typescript-eslint/parser'
import * as espree from 'espree'
import type { UntsxInstance } from '.'
import type { Linter } from 'eslint'

export function createESLintParser(
  espreeParse: UntsxInstance['espree'],
  eslintTypescriptParser: UntsxInstance['eslintTypescriptParser'],
): {
  jsParser: Linter.Parser
  tsParser: Linter.Parser
} {
  const jsParser: typeof espree = {
    ...espree,
    parse: espreeParse,
  }

  const tsParser: typeof tsEsParser = {
    ...tsEsParser,
    parseForESLint: eslintTypescriptParser,
  }
  ;(tsParser as any).parse = undefined

  return { jsParser, tsParser }
}
