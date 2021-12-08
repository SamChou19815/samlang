const { build } = require('esbuild');

build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'node',
  target: 'node14',
  logLevel: 'error',
  outfile: 'out/extension.js',
  external: ['vscode'],
});
