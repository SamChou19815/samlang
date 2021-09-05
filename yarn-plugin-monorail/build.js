// @ts-check

const { mkdirSync } = require('fs');
const { dirname, join } = require('path');

const { build } = require('esbuild');

const outFile = join('bundles', 'plugin-monorail.js');
mkdirSync(dirname(outFile), { recursive: true });

build({
  entryPoints: [join('src', 'plugin.ts')],
  bundle: true,
  banner: {
    js: `// @${'generated'}
/* eslint-disable */
//prettier-ignore
module.exports = {
name: "@yarnpkg/plugin-monorail",
factory: function (require) {`,
  },
  footer: {
    js: 'return plugin;\n}\n};',
  },
  external: ['clipanion'],
  format: 'iife',
  minify: true,
  globalName: 'plugin',
  platform: 'node',
  target: 'node12',
  outfile: outFile,
  // eslint-disable-next-line no-console
}).then(() => console.log('Bundle plugin `@yarnpkg/plugin-monorail`!'));
