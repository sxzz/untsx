# untsx

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Unit Test][unit-test-src]][unit-test-href]

Universal TypeScript extension for all popular toolchains.

## Install

```bash
npm i untsx
```

## Features

- ✅ **Parser** - Supports Acorn, Babel, espree, ESLint-TypeScript, and more parsers.
- ✅ **TypeScript** - Full type support with transformations.
- ✅ **Bundler** - Seamless integration with Vite and other bundlers via `unplugin`.
- ✅ **Prettier** - Code formatting support.
- ✅ **ESLint** - Linting with proper syntax recognition.
- ✅ **Development** - Hot reload and dev server support powered by Vite.

## Usage

### Vite Integration

To integrate with Vite, configure your `vite.config.ts` as follows:

```ts
// vite.config.ts
import Foo from 'untsx-foo/unplugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Foo.vite()],
})
```

### TypeScript Macro

For proper syntax highlighting and IntelliSense support, install the [TS Macro extension](https://marketplace.visualstudio.com/items?itemName=zhiyuanzmj.vscode-ts-macro) in VS Code.

Alternatively, search for "TS Macro" in the VS Code Extensions marketplace.

Then, configure your `ts-macro.config.ts`:

```typescript
// ts-macro.config.ts
import Foo from 'untsx-foo/volar'

export default {
  plugins: [Foo()],
}
```

### Prettier Configuration

To enable Prettier support, configure your `prettier.config.js` as follows:

```js
// prettier.config.js
import { fileURLToPath } from 'node:url'

export default {
  // ...
  plugins: [fileURLToPath(import.meta.resolve('untsx-foo/prettier'))],
}
```

### ESLint Configuration

To enable ESLint support, configure your `eslint.config.js` as follows:

```js
// eslint.config.js

import { jsParser, tsParser } from 'untsx-foo/eslint'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
  },
  {
    files: ['**/*.js'],
    languageOptions: { parser: jsParser },
  },
]
```

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/sxzz/sponsors/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/sxzz/sponsors/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE) License © 2025 [Kevin Deng](https://github.com/sxzz)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/untsx.svg
[npm-version-href]: https://npmjs.com/package/untsx
[npm-downloads-src]: https://img.shields.io/npm/dm/untsx
[npm-downloads-href]: https://www.npmcharts.com/compare/untsx?interval=30
[unit-test-src]: https://github.com/sxzz/untsx/actions/workflows/unit-test.yml/badge.svg
[unit-test-href]: https://github.com/sxzz/untsx/actions/workflows/unit-test.yml
