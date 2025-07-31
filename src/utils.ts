import { walk } from 'estree-walker'

export function getNodeRange(node: any): [start: number, end: number] {
  return node.range || [node.start, node.end]
}

export function patchLocOffset(node: any, offset?: number): any {
  if (offset === undefined) return node
  walk(node as any, {
    enter(node: any) {
      if (typeof node.loc === 'object') {
        node.loc.start.index += offset
        node.loc.end.index += offset
      }
      if (typeof node.range === 'object') {
        node.range[0] += offset
        node.range[1] += offset
      }
      if (typeof node.start === 'number') {
        node.start += offset
      }
      if (typeof node.end === 'number') {
        node.end += offset
      }
    },
  })
  return node
}
