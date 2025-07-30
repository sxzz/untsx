import path from 'node:path'
import { createTsMacroProgram } from '@sxzz/test-utils'
import { MagicStringAST } from 'magic-string-ast'
import { format } from 'prettier'
import { createPlugin } from 'ts-macro'
import { expect, test } from 'vitest'
import { createUntsx, REGEX_TS } from '../src'

const { acorn, babel, espree, eslintTypescript, transform, prettier } =
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

const code = 'const x = throw 1'
const codeTS = 'const x: never = throw 1'

test('acorn', () => {
  const program = acorn(code, { ecmaVersion: 'latest' })
  const declaration = (program as any).body[0].declarations[0]

  expect(declaration.init).toMatchObject({
    type: 'UnaryExpression',
    operator: 'throw',
    prefix: true,
    argument: {
      type: 'Literal',
      value: 1,
      start: 16,
      end: 17,
      range: [16, 17],
    },
    start: 10,
    end: 17,
    range: [10, 17],
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
      type: 'NumericLiteral',
      value: 1,
      start: 16,
      end: 17,
    },
    start: 10,
    end: 17,
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
      type: 'NumericLiteral',
      value: 1,
      start: 23,
      end: 24,
      range: [23, 24],
    },
    start: 17,
    end: 24,
    range: [17, 24],
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
      type: 'Literal',
      value: 1,
      start: 16,
      end: 17,
      range: [16, 17],
    },
    start: 10,
    end: 17,
    range: [10, 17],
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
      type: 'Literal',
      value: 1,
      start: 16,
      end: 17,
      range: [16, 17],
    },
    start: 10,
    end: 17,
    range: [10, 17],
  })
})

test('magic-string', () => {
  let s = new MagicStringAST(code)
  transform(s.toString(), 'test.js', s)
  expect(s.toString()).toBe('const x = (function (e) { throw e })(1)')

  s = new MagicStringAST(codeTS)
  transform(s.toString(), 'test.ts', s)
  expect(s.toString()).toBe(
    'const x: never = (function (e): never { throw e })(1)',
  )
})

test('volar', () => {
  const fixtures = import.meta.glob('./fixtures/*.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  })

  const plugin = createPlugin(() => ({
    name: 'test-plugin',
    resolveVirtualCode({ codes, filePath, ast }) {
      transform(ast.text, filePath, codes)
    },
  }))

  const program = createTsMacroProgram(
    Object.keys(fixtures).map((id) => path.resolve(import.meta.dirname, id)),
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
