const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: false,
  platform: 'node',
  target: 'es2017',
  logLevel: 'error',
  outfile: 'bin/index.js',
  external: ['@dev-sam/samlang-core', 'binaryen', 'vscode-languageserver/node'],
  plugins: [pnpPlugin()],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
