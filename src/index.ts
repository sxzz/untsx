import {
  parse as babelParse,
  parseExpression as babelParseExpression,
  type ParserOptions as BabelOptions,
  type ParseResult,
} from '@babel/parser'
import {
  parseForESLint,
  type ParserOptions as TSESParserOptions,
} from '@typescript-eslint/parser'
import {
  parse as tsEslintParse,
  type TSESTree,
  type TSESTreeOptions,
} from '@typescript-eslint/typescript-estree'
import {
  Parser,
  type Options as AcornOptions,
  type Program as AcornProgram,
} from 'acorn'
import acornJsx from 'acorn-jsx'
import { tsPlugin as acornTS } from 'acorn-typescript'
import { parse as espreeParse, type Options as EspreeOptions } from 'espree'
import { walk } from 'estree-walker'
import { createESLintParser } from './eslint'
import { createPrettierPlugin } from './prettier'
import { replace } from './replace'
import { patchLocOffset } from './utils'
import type { File } from '@babel/types'
import type { Linter } from 'eslint'
import type { MagicStringAST } from 'magic-string-ast'
import type { Plugin as PrettierPlugin, Printer } from 'prettier'
import type { Codes } from 'ts-macro'
import type { SourceFile } from 'typescript'

export type IsTargetFn = (node: any) => boolean
export type CustomAcornParser = (
  parser: typeof Parser,
) => typeof Parser | null | undefined

export const REGEX_TS: RegExp = /\.[cm]?tsx?$/
export const REGEX_JSX: RegExp = /\.[jt]sx$/

export { createESLintParser, createPrettierPlugin, replace }

export interface UntsxFactory<T = any> {
  baseParser:
    | {
        name: 'acorn'
        customParser?: CustomAcornParser
      }
    | {
        name: 'babel'
        parserOptions: BabelOptions
      }
  isTarget: IsTargetFn
  build: (parserName: string, start: number, end: number, valid: any) => T
  shouldTransform?: (code: string, id?: string) => boolean
  transform: (
    code: string,
    id: string,
    s: MagicStringAST | Codes,
    node: T,
    parent: any,
    key: PropertyKey | null | undefined,
    index: number | null | undefined,
    isVolar: boolean,
  ) => boolean
  format?: Printer['print']
  getVisitorKeys?: Printer['getVisitorKeys']
}

export interface UntsxInstance {
  baseParse: (code: string, isTS?: boolean, isJSX?: boolean) => any
  acorn: (
    code: string,
    options: AcornOptions,
    isTS?: boolean,
    isJSX?: boolean,
    parser?: typeof Parser,
  ) => AcornProgram
  babel: (code: string, options?: BabelOptions) => ParseResult<File>
  espree: (code: string, options?: EspreeOptions) => AcornProgram
  eslintTypescript: (
    code: string,
    options?: TSESTreeOptions,
  ) => TSESTree.Program
  eslintTypescriptParser: (
    src: string | SourceFile,
    options?: TSESParserOptions | null,
  ) => ReturnType<typeof parseForESLint>

  transform: (code: string, id: string, s: MagicStringAST | Codes) => boolean
  prettier: PrettierPlugin
  eslint: { jsParser: Linter.Parser; tsParser: Linter.Parser }
}

export function createUntsx(factory: UntsxFactory): UntsxInstance {
  function baseParse(code: string, isTS?: boolean, isJSX?: boolean): any {
    if (factory.baseParser.name === 'acorn') {
      const parser = buildAcornParser(
        Parser,
        factory.baseParser.customParser,
        isTS,
        isJSX,
      )
      const ast = parser.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReserved: true,
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true,
      })
      return ast
    }

    return babelParse(code, {
      sourceType: 'module',
      errorRecovery: true,

      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowNewTargetOutsideFunction: true,
      allowReturnOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
      allowYieldOutsideFunction: true,

      ...factory.baseParser.parserOptions,
      plugins: [
        ...(isTS ? (['typescript'] as const) : []),
        ...(isJSX ? (['jsx'] as const) : []),
        ...(factory.baseParser.parserOptions.plugins || []),
      ],
    }).program
  }

  function acorn(
    code: string,
    options: AcornOptions,
    isTS?: boolean,
    isJSX?: boolean,
    parser: typeof Parser = Parser,
  ): AcornProgram {
    if (factory.shouldTransform && !factory.shouldTransform(code)) {
      return parser.parse(code, options)
    }

    if (factory.baseParser.name === 'acorn') {
      parser = buildAcornParser(
        parser,
        factory.baseParser.customParser,
        isTS,
        isJSX,
      )
      return parser.parse(code, options)
    }

    return replace<AcornProgram>(
      code,
      'acorn',
      (code) => baseParse(code, isTS, isJSX),
      (code, isExpression, offset) =>
        isExpression
          ? patchLocOffset(parser.parseExpressionAt(code, 0, options), offset)
          : parser.parse(code, options),
      factory.build.bind(null, 'acorn'),
      factory.isTarget,
    )
  }

  function babel(code: string, options?: BabelOptions): ParseResult<File> {
    if (factory.shouldTransform && !factory.shouldTransform(code)) {
      return babelParse(code, options)
    }

    if (factory.baseParser.name === 'babel') {
      const { parserOptions } = factory.baseParser
      return babelParse(code, {
        ...parserOptions,
        ...options,
        plugins: [
          ...(parserOptions.plugins || []),
          ...(options?.plugins || []),
        ],
      })
    }

    function hasPlugin(plugin: string): boolean {
      if (!options?.plugins) return false
      return options.plugins.some((p) => p === plugin || p[0] === plugin)
    }

    return replace<ParseResult<File>>(
      code,
      'babel',
      (code) => baseParse(code, hasPlugin('typescript'), hasPlugin('jsx')),
      (code, isExpression, offset) =>
        (isExpression ? babelParseExpression : babelParse)(code, {
          allowAwaitOutsideFunction: isExpression,
          allowImportExportEverywhere: isExpression,
          allowNewTargetOutsideFunction: isExpression,
          allowReturnOutsideFunction: isExpression,
          allowSuperOutsideMethod: isExpression,
          allowUndeclaredExports: isExpression,
          allowYieldOutsideFunction: isExpression,
          ...options,
          startIndex: offset,
        }),
      factory.build.bind(null, 'babel'),
      factory.isTarget,
    )
  }

  function espree(code: string, options?: EspreeOptions): AcornProgram {
    if (factory.shouldTransform && !factory.shouldTransform(code)) {
      return espreeParse(code, options)
    }

    return replace<AcornProgram>(
      code,
      'espree',
      () => baseParse(code, false, !!options?.ecmaFeatures?.jsx),
      (code, isExpression, offset) => {
        let ast = espreeParse(isExpression ? `(${code})` : code, options)
        if (isExpression) {
          // @ts-expect-error
          ast = ast.body[0].expression
          ast = patchLocOffset(ast, offset! - 1)
        }
        return ast
      },
      factory.build.bind(null, 'espree'),
      factory.isTarget,
    )
  }

  function eslintTypescript(code: string, options?: TSESTreeOptions) {
    if (factory.shouldTransform && !factory.shouldTransform(code)) {
      return tsEslintParse(code, options)
    }

    return replace<TSESTree.Program>(
      code,
      'eslint-typescript',
      (code) => baseParse(code, true, !!options?.jsx),
      (code, isExpression, offset) => {
        let ast = tsEslintParse(isExpression ? `(${code})` : code, {
          ...options,
          range: true,
        })

        if (isExpression) {
          // @ts-expect-error
          ast = ast.body[0].expression
          ast = patchLocOffset(ast, offset! - 1)
        }

        return ast
      },
      factory.build.bind(null, 'eslint-typescript'),
      factory.isTarget,
    )
  }

  function eslintTypescriptParser(
    src: string | SourceFile,
    options?: TSESParserOptions | null,
  ) {
    const code = typeof src === 'string' ? src : src.text
    if (factory.shouldTransform && !factory.shouldTransform(code)) {
      return parseForESLint(code, options)
    }

    return replace<ReturnType<typeof parseForESLint>>(
      code,
      'eslint-typescript-parser',
      (code) => baseParse(code, true, !!options?.ecmaFeatures?.jsx),
      (src, isExpression, offset) => {
        let ast = parseForESLint(isExpression ? `(${src})` : src, options)

        if (isExpression) {
          // @ts-expect-error
          ast = ast.ast.body[0].expression
          ast = patchLocOffset(ast, offset! - 1)
        }

        return ast
      },
      factory.build.bind(null, 'eslint-typescript-parser'),
      factory.isTarget,
    )
  }

  function transform(
    code: string,
    id: string,
    s: MagicStringAST | Codes,
  ): boolean {
    if (factory.shouldTransform && !factory.shouldTransform(code, id)) {
      return false
    }

    const isVolar = Array.isArray(s)
    const ast = baseParse(code, REGEX_TS.test(id), id.endsWith('.jsx'))

    let changed = false
    walk(ast as any, {
      enter(
        node: any,
        parent: any,
        key: PropertyKey | null | undefined,
        index: number | null | undefined,
      ) {
        if (factory.isTarget(node)) {
          const _changed = factory.transform(
            code,
            id,
            s,
            node,
            parent,
            key,
            index,
            isVolar,
          )
          changed ||= _changed
        }
      },
    })

    return changed
  }

  const prettier = createPrettierPlugin(
    factory,
    acorn,
    babel,
    espree,
    eslintTypescript,
  )
  const eslint = createESLintParser(espree, eslintTypescriptParser)

  return {
    baseParse,
    acorn,
    babel,
    espree,
    eslintTypescript,
    eslintTypescriptParser,
    transform,
    prettier,
    eslint,
  }
}

function buildAcornParser(
  parser: typeof Parser,
  customParser?: CustomAcornParser,
  isTS?: boolean,
  isJSX?: boolean,
) {
  if (isTS) {
    parser = parser.extend(acornTS() as any)
  } else if (isJSX) {
    parser = parser.extend(acornJsx())
  }
  parser = customParser?.(parser) || parser
  return parser
}
