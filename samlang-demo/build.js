const { build } = require('esbuild');

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2017',
  platform: 'node',
  outfile: 'bin/index.js',
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
