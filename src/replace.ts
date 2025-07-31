import { walk } from 'estree-walker'
import { getNodeRange } from './utils'
import type { IsTargetFn } from '.'

export type NodeInfo = [
  code: string,
  start: number,
  end: number,
  validStart: number,
  validEnd: number,
]

export type ParseFn = (
  src: string,
  isExpression: boolean,
  offset?: number,
) => any
export type BuildFn = (start: number, end: number, valid: any) => any

export function replace<T>(
  code: string,
  framework: string,
  baseParse: (code: string) => any,
  parse: ParseFn,
  build: BuildFn,
  isTargetNode: IsTargetFn,
): T {
  const ast = baseParse(code)

  let replacedSource = code
  const sources: NodeInfo[] = []

  walk(ast as any, {
    enter(node: any) {
      if (isTargetNode(node)) {
        if (framework === 'eslint-typescript-parser') {
          replacedSource =
            replacedSource.slice(0, node.start) +
            ' '.repeat(node.argument.start - node.start) +
            replacedSource.slice(node.argument.start, node.argument.end) +
            ' '.repeat(node.end - node.argument.end) +
            replacedSource.slice(node.end)
          return
        }

        const valid = code.slice(node.argument.start, node.argument.end)
        sources.push([
          valid,
          node.start,
          node.end,
          node.argument.start,
          node.argument.end,
        ])

        const originalLength = node.end - node.start
        const placeholder = 'x'.repeat(originalLength)

        replacedSource = `${replacedSource.slice(0, node.start)}${placeholder}${replacedSource.slice(node.end)}`
      }
    },
  })

  const finalAST = parse(replacedSource, false)
  if (framework === 'eslint-typescript-parser') {
    return finalAST
  }

  let replaced = 0
  walk(finalAST as any, {
    enter(node, parent, key) {
      if (key === 'tokens') return

      if (['File', 'Program', 'ExpressionStatement'].includes(node.type)) {
        return
      }

      const [start, end] = getNodeRange(node)
      const valid = sources.find(
        ([, _start, _end]) => start === _start && end === _end,
      )
      if (!valid) return

      const newNode = build(start, end, processValid(valid))
      this.replace(newNode)
      this.skip()
    },
  })

  if (replaced !== sources.length) {
    throw new Error(
      `Expected to replace ${sources.length} nodes, but replaced ${replaced}.`,
    )
  }

  return finalAST

  function processValid(node: NodeInfo): any {
    replaced++
    const [, , , validStart, validEnd] = node

    const valid = sources.find(
      ([, start, end]) => start >= validStart && end <= validEnd,
    )
    if (valid) {
      const validNode = processValid(valid)
      const fullMatch = valid[1] === validStart && valid[2] === validEnd

      if (fullMatch) {
        return build(valid[1], valid[2], validNode)
      } else {
        throw new Error('Unsupported syntax')
      }
    } else {
      return parse(node[0], true, validStart)
    }
  }
}
