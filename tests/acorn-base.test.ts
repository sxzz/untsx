import path from 'node:path'
import { createTsMacroProgram } from '@sxzz/test-utils'
import { ESLint } from 'eslint'
import { MagicStringAST } from 'magic-string-ast'
import { format } from 'prettier'
import { tryOperatorPlugin } from 'tc39-try/acorn'
import { createPlugin } from 'ts-macro'
import { expect, test } from 'vitest'
import { createUntsx } from '../src'
import fixture from './fixtures/try?url'

const { acorn, babel, espree, eslintTypescript, transform, prettier, eslint } =
  createUntsx({
    baseParser: {
      name: 'acorn',
      customParser(parser) {
        return parser.extend(tryOperatorPlugin())
      },
    },
    isTarget: (node) =>
      node.type === 'UnaryExpression' && node.operator === 'try',
    build(parserName, start, end, valid) {
      return {
        type: 'UnaryExpression',
        operator: 'try',
        prefix: true,
        argument: valid,

        start,
        end,
        range: [start, end],
      }
    },
    transform(code, id, s, node) {
      const argumentStart = node.argument.start

      s.replaceRange(node.start, argumentStart, `() => (`)
      s.replaceRange(node.argument.end, node.end, ')')

      return true
    },
    format(path, options, print) {
      return ['try ', path.call(print, 'argument')]
    },
  })

const code = 'const x = try fn()'
const codeTS = 'const x: any = try fn()'

test('acorn', () => {
  const program = acorn(code, { ecmaVersion: 'latest' })
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'try',
    prefix: true,
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'fn',
        start: 14,
        end: 16,
      },
      arguments: [],
    },
    start: 10,
    end: 18,
  })
})

test('babel', () => {
  const program = babel(code)
  const declaration = (program as any).program.body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'try',
    prefix: true,
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'fn',
        start: 14,
        end: 16,
      },
      arguments: [],
    },
    start: 10,
    end: 18,
  })
})

test('babel with options', () => {
  const program = babel(codeTS, { ranges: true, plugins: ['typescript'] })
  const declaration = (program as any).program.body[0].declarations[0]

  expect(declaration.id).toMatchObject({
    type: 'Identifier',
    name: 'x',
    start: 6,
    end: 12,
    range: [6, 12],
    typeAnnotation: {
      type: 'TSTypeAnnotation',
      typeAnnotation: {
        type: 'TSAnyKeyword',
        start: 9,
        end: 12,
        range: [9, 12],
      },
      start: 7,
      end: 12,
      range: [7, 12],
    },
  })
  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'try',
    prefix: true,
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'fn',
        start: 19,
        end: 21,
        range: [19, 21],
      },
      start: 19,
      end: 23,
      range: [19, 23],
    },
    start: 15,
    end: 23,
    range: [15, 23],
  })
})

test('espree', () => {
  const program = espree(code, { ecmaVersion: 'latest' })
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'try',
    prefix: true,
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'fn',
        start: 14,
        end: 16,
      },
      arguments: [],
    },
    start: 10,
    end: 18,
  })
})

test('typescript-eslint', () => {
  const program = eslintTypescript(code)
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'try',
    prefix: true,
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'fn',
        range: [14, 16],
      },
      arguments: [],
    },
    range: [10, 18],
  })
})

test('magic-string', () => {
  let s = new MagicStringAST(code)
  transform(s.toString(), 'test.js', s)
  expect(s.toString()).toBe('const x = () => (fn())')

  s = new MagicStringAST(codeTS)
  transform(s.toString(), 'test.ts', s)
  expect(s.toString()).toBe('const x: any = () => (fn())')
})

test('volar', () => {
  const plugin = createPlugin(() => ({
    name: 'test-plugin',
    resolveVirtualCode({ codes, filePath, ast }) {
      transform(ast.text, filePath, codes)
    },
  }))

  const program = createTsMacroProgram([path.resolve(`.${fixture}`)], [plugin])
  const files = program
    .getSourceFiles()
    .filter((file) => !file.fileName.includes('node_modules'))
  for (const file of files) {
    expect(file.text.trim()).matchSnapshot()
  }
})

test.each(['acorn', 'babel', 'babel-ts', 'typescript'])(
  'prettier: parser %s',
  async (parser) => {
    const isTS = parser === 'babel-ts' || parser === 'typescript'
    const code = isTS ? 'const  x:never  =  try  1;' : 'const  x  =  try 1;'
    const result = await format(code, {
      parser,
      plugins: [prettier],
      semi: false,
    })
    const formatted = isTS ? 'const x: never = try 1' : 'const x = try 1'
    expect(result).toBe(`${formatted}\n`)
  },
)

test('eslint', async () => {
  const linter = new ESLint({
    overrideConfigFile: true,
    baseConfig: [
      {
        files: ['**/*.js'],
        languageOptions: { parser: eslint.jsParser },
      },
      {
        files: ['**/*.ts'],
        languageOptions: { parser: eslint.tsParser },
      },
    ],
  })
  {
    const results = await linter.lintText(code, { filePath: 'test.js' })
    expect(results[0].messages).toHaveLength(0)
  }
  {
    const results = await linter.lintText(codeTS, { filePath: 'test.ts' })
    expect(results[0].messages).toHaveLength(0)
  }
})
