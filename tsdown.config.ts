import { lib } from 'tsdown-preset-sxzz'

export default lib(
  {},
  {
    deps: {
      dts: {
        neverBundle: [
          // type-only
          'eslint',
          'ts-macro',
          '@babel/types',
          'typescript',
        ],
      },
    },
  },
)
