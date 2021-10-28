const { pnpPlugin } = require('@yarnpkg/esbuild-plugin-pnp');
const { build } = require('esbuild');

build({
  entryPoints: ['main.ts'],
  bundle: true,
  sourcemap: false,
  platform: 'node',
  target: 'es2017',
  logLevel: 'error',
  outfile: 'dist/index.js',
  loader: { '.wat': 'text' },
  external: ['binaryen'],
  plugins: [pnpPlugin()],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
