// @ts-expect-error
import { parsers as prettierEspree } from 'prettier/plugins/acorn.mjs'
// @ts-expect-error
import { parsers as prettierBabel } from 'prettier/plugins/babel.mjs'
// @ts-expect-error
import { printers } from 'prettier/plugins/estree.mjs'
// @ts-expect-error
import { parsers as prettierTS } from 'prettier/plugins/typescript.mjs'
import { REGEX_JSX, type UntsxFactory, type UntsxInstance } from '.'
import type { ParserOptions } from '@babel/parser'
import type { Comment } from 'acorn'
import type { Parser, Plugin } from 'prettier'

const babelOptions: ParserOptions = {
  sourceType: 'module',
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowNewTargetOutsideFunction: true,
  allowSuperOutsideMethod: true,
  allowUndeclaredExports: true,
  errorRecovery: true,
  createParenthesizedExpressions: true,
  createImportExpressions: true,
  attachComment: false,
  plugins: [
    'doExpressions',
    'exportDefaultFrom',
    'functionBind',
    'functionSent',
    'throwExpressions',
    'partialApplication',
    'decorators',
    'moduleBlocks',
    'asyncDoExpressions',
    'destructuringPrivate',
    'decoratorAutoAccessors',
    'sourcePhaseImports',
    'deferredImportEvaluation',
    ['optionalChainingAssign', { version: '2023-07' }],
  ],
  tokens: false,
  ranges: false,
}

export function createPrettierPlugin(
  { shouldTransform, isTarget, getVisitorKeys, format }: UntsxFactory,
  acorn: UntsxInstance['acorn'],
  babel: UntsxInstance['babel'],
  espree: UntsxInstance['espree'], // TODO
  eslintTypescript: UntsxInstance['eslintTypescript'],
): Plugin {
  const acornParser: Parser = {
    ...prettierEspree.acorn,
    parse(text, options) {
      if (shouldTransform && !shouldTransform(text, options.filepath)) {
        return prettierEspree.acorn.parse(text, options)
      }

      const comments: Comment[] = []
      const ast = acorn(text, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        onComment: comments,
        allowReserved: true,
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true,
        allowImportExportEverywhere: true,
        checkPrivateFields: false,
        locations: false,
        ranges: true,
        preserveParens: true,
      })
      // @ts-expect-error -- expected
      ast.comments = comments
      return ast
    },
  }

  const babelParser: Parser = {
    ...prettierBabel.babel,
    parse(text, options) {
      if (shouldTransform && !shouldTransform(text, options.filepath)) {
        return prettierBabel.babel.parse(text, options)
      }

      return babel(text, babelOptions)
    },
  }
  const babelTsParser: Parser = {
    ...prettierBabel['babel-ts'],
    parse(text, options) {
      if (shouldTransform && !shouldTransform(text, options.filepath)) {
        return prettierBabel['babel-ts'].parse(text, options)
      }

      return babel(text, {
        ...babelOptions,
        plugins: [
          'typescript',
          ...(REGEX_JSX.test(options.filepath) ? ['jsx' as const] : []),
          ...(babelOptions.plugins || []),
        ],
      })
    },
  }

  const typescriptParser: Parser = {
    ...prettierTS.typescript,
    parse(text, options) {
      if (shouldTransform && !shouldTransform(text, options.filepath)) {
        return prettierTS.typescript.parse(text, options)
      }

      return eslintTypescript(text, {
        sourceType: 'module',
        loc: true,
        range: true,
        comment: true,
        tokens: false,
        loggerFn: false,
        project: false,
        jsDocParsingMode: 'none',
        suppressDeprecatedPropertyWarnings: true,
        filePath: options.filepath,
      })
    },
  }

  return {
    parsers: {
      acorn: acornParser,
      babel: babelParser,
      'babel-ts': babelTsParser,
      typescript: typescriptParser,
    },
    printers: {
      estree: {
        ...printers.estree,
        print(path, ...args) {
          if (isTarget(path.node)) {
            return format(path, ...args)
          }
          return printers.estree.print(path, ...args)
        },

        getVisitorKeys: getVisitorKeys
          ? (node, ...args) => {
              if (isTarget(node)) {
                return getVisitorKeys(node, ...args)
              }
              return printers.estree.getVisitorKeys(node, ...args)
            }
          : printers.estree.getVisitorKeys,
      },
    },
  }
}
