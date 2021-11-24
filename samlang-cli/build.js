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
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
