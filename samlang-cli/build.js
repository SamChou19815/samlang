const { build } = require('esbuild');
const pnpPlugin = require('esbuild-plugin-pnp');

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  logLevel: 'error',
  outfile: 'bin/index.js',
  plugins: [pnpPlugin()],
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.log(err);
  process.exit(1);
});
