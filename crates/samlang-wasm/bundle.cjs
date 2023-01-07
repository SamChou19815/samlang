require('esbuild').build({
  entryPoints: ['lazy-index.js'],
  outfile: 'out.js',
  bundle: true,
  format: 'esm',
  banner: { js: `// @${'generated'}` },
  plugins: [require('esbuild-plugin-wasm').wasmLoader({ mode: 'embedded' })],
});
