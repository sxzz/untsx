import path from 'node:path'
import { createTsMacroProgram } from '@sxzz/test-utils'
import { ESLint } from 'eslint'
import { MagicStringAST } from 'magic-string-ast'
import { format } from 'prettier'
import { createPlugin } from 'ts-macro'
import { expect, test } from 'vitest'
import { createUntsx, REGEX_TS } from '../src'
import fixture from './fixtures/throw?url'

const { acorn, babel, espree, eslintTypescript, transform, prettier, eslint } =
  createUntsx({
    baseParser: {
      name: 'babel',
      parserOptions: {
        plugins: ['throwExpressions'],
      },
    },
    isTarget: (node) =>
      node.type === 'UnaryExpression' && node.operator === 'throw',
    build(parserName, start, end, valid) {
      return {
        type: 'UnaryExpression',
        operator: 'throw',
        prefix: true,
        argument: valid,

        start,
        end,
        range: [start, end],
      }
    },
    shouldTransform: (code) => /\bthrow\b/.test(code),
    transform(code, id, s, node) {
      const argumentStart = node.argument.start

      s.replaceRange(
        node.start,
        argumentStart,
        `(function (e)${REGEX_TS.test(id) ? ': never' : ''} { throw e })(`,
      )
      s.replaceRange(node.argument.end, node.end, ')')

      return true
    },
    format(path, options, print) {
      return ['throw ', path.call(print, 'argument')]
    },
  })

const code = 'const x = throw !1'
const codeTS = 'const x: never = throw !1'

test('acorn', () => {
  const program = acorn(code, { ecmaVersion: 'latest' })
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      start: 16,
      end: 18,
      argument: {
        type: 'Literal',
        value: 1,
        start: 17,
        end: 18,
      },
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
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      start: 16,
      end: 18,
      argument: {
        type: 'NumericLiteral',
        value: 1,
        start: 17,
        end: 18,
      },
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
    end: 14,
    range: [6, 14],
    typeAnnotation: {
      type: 'TSTypeAnnotation',
      typeAnnotation: {
        type: 'TSNeverKeyword',
        start: 9,
        end: 14,
        range: [9, 14],
      },
      start: 7,
      end: 14,
      range: [7, 14],
    },
  })
  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      start: 23,
      end: 25,
      range: [23, 25],
      argument: {
        type: 'NumericLiteral',
        value: 1,
        start: 24,
        end: 25,
        range: [24, 25],
      },
    },
    start: 17,
    end: 25,
    range: [17, 25],
  })
})

test('espree', () => {
  const program = espree(code, { ecmaVersion: 'latest' })
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      start: 16,
      end: 18,
      argument: {
        type: 'Literal',
        value: 1,
        start: 17,
        end: 18,
      },
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
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      range: [16, 18],
      argument: {
        type: 'Literal',
        value: 1,
        range: [17, 18],
      },
    },
    range: [10, 18],
  })
})

test('magic-string', () => {
  let s = new MagicStringAST(code)
  transform(s.toString(), 'test.js', s)
  expect(s.toString()).toBe('const x = (function (e) { throw e })(!1)')

  s = new MagicStringAST(codeTS)
  transform(s.toString(), 'test.ts', s)
  expect(s.toString()).toBe(
    'const x: never = (function (e): never { throw e })(!1)',
  )
})

test('volar', async () => {
  const plugin = createPlugin(() => ({
    name: 'test-plugin',
    resolveVirtualCode({ codes, filePath, ast }) {
      transform(ast.text, filePath, codes)
    },
  }))

  const program = await createTsMacroProgram(
    [path.resolve(`.${fixture}`)],
    [plugin],
  )
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
    const code = isTS ? 'const  x:never  =  throw  1;' : 'const  x  =  throw 1;'
    const result = await format(code, {
      parser,
      plugins: [prettier],
      semi: false,
    })
    const formatted = isTS ? 'const x: never = throw 1' : 'const x = throw 1'
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
