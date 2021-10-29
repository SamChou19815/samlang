const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: false,
  platform: 'node',
  target: 'es2019',
  logLevel: 'error',
  outfile: 'bin/index.js',
  external: ['@dev-sam/samlang-core', 'binaryen'],
  plugins: [pnpPlugin()],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});

build({
  entryPoints: ['src/lsp.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: 'node',
  target: 'es2019',
  logLevel: 'error',
  outfile: 'bin/lsp.js',
  plugins: [pnpPlugin()],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
