import {
  parse as babelParse,
  parseExpression as babelParseExpression,
  type ParserOptions as BabelOptions,
  type ParseResult,
} from '@babel/parser'
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
import acornTS from 'acorn-typescript'
import { parse as espreeParse, type Options as EspreeOptions } from 'espree'
import { walk } from 'estree-walker'
import { createPrettierPlugin } from './prettier'
import { replace } from './replace'
import type { File } from '@babel/types'
import type { MagicStringAST } from 'magic-string-ast'
import type { Plugin as PrettierPlugin, Printer } from 'prettier'
import type { Codes } from 'ts-macro'

export type IsTargetFn = (node: any) => boolean
export type CustomAcornParser = (
  parser: typeof Parser,
) => typeof Parser | null | undefined

export const REGEX_TS: RegExp = /\.[cm]?tsx?$/
export const REGEX_JSX: RegExp = /\.[jt]sx$/

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
  shouldTransform?: (code: string, id: string) => boolean
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
  format: Printer['print']
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

  transform: (code: string, id: string, s: MagicStringAST | Codes) => boolean
  prettier: PrettierPlugin
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
      (code, isExpression) =>
        isExpression
          ? parser.parseExpressionAt(code, 0, options)
          : parser.parse(code, options),
      factory.build.bind(null, 'acorn'),
      factory.isTarget,
    )
  }

  function babel(code: string, options?: BabelOptions): ParseResult<File> {
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
      (code, isExpression) =>
        (isExpression ? babelParseExpression : babelParse)(code, options),
      factory.build.bind(null, 'babel'),
      factory.isTarget,
    )
  }

  function espree(code: string, options?: EspreeOptions): AcornProgram {
    return replace<AcornProgram>(
      code,
      'espree',
      () => baseParse(code, false, !!options?.ecmaFeatures?.jsx),
      (code, isExpression) => {
        const ast = espreeParse(isExpression ? `(${code})` : code, options)
        if (isExpression) {
          // @ts-expect-error
          return ast.body[0].expression
        }
        return ast
      },
      factory.build.bind(null, 'espree'),
      factory.isTarget,
    )
  }

  function eslintTypescript(code: string, options?: TSESTreeOptions) {
    return replace<TSESTree.Program>(
      code,
      'eslint-typescript',
      (code) => baseParse(code, true, !!options?.jsx),
      (code, isExpression) => {
        let ast = tsEslintParse(isExpression ? `(${code})` : code, {
          ...options,
          range: true,
        })

        // @ts-expect-error
        if (isExpression) ast = ast.body[0].expression

        return ast
      },
      // buildTryOperator,
      factory.build.bind(null, 'eslint-typescript'),
      factory.isTarget,
    )
  }

  function transform(
    code: string,
    id: string,
    s: MagicStringAST | Codes,
  ): boolean {
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
          changed ||= factory.transform(
            code,
            id,
            s,
            node,
            parent,
            key,
            index,
            isVolar,
          )
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

  return {
    baseParse,
    acorn,
    babel,
    espree,
    eslintTypescript,
    transform,
    prettier,
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
  parser = customParser?.(Parser) || parser
  return parser
}
