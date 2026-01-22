import { lib } from 'tsdown-preset-sxzz'

export default lib(
  {},
  {
    external: [
      // type-only
      'eslint',
      'ts-macro',
      '@babel/types',
      'typescript',
    ],
  },
)
