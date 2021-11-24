const { build } = require('esbuild');

build({
  entryPoints: ['main.ts'],
  bundle: true,
  sourcemap: false,
  platform: 'node',
  target: 'es2019',
  logLevel: 'error',
  outfile: 'dist/index.js',
  loader: { '.wat': 'text' },
  external: ['binaryen'],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
