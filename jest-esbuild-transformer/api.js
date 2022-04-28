// @ts-check

const { createHash } = require('crypto');
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('fs');
const Module = require('module');
const { tmpdir } = require('os');
const { extname, resolve } = require('path');

const { transformSync } = require('esbuild');

const tmpPath = resolve(tmpdir(), 'esbuild-runner-cache');
if (!existsSync(tmpPath)) mkdirSync(tmpPath, { recursive: true });

/**
 * @param {string} filename
 * @param {() => string} transpiler
 */
function cachedGet(filename, transpiler) {
  const hash = createHash('md5').update(resolve(filename)).digest('hex');

  const compiledPath = resolve(tmpPath, `${hash}.js`);
  if (!existsSync(compiledPath) || statSync(compiledPath).mtime < statSync(filename).mtime) {
    const code = transpiler();
    writeFileSync(compiledPath, code, { encoding: 'utf-8' });
    return code;
  }
  return readFileSync(compiledPath, { encoding: 'utf-8' });
}

/** @type {Record<string, import('esbuild').Loader>} */
const loaders = {
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.json': 'json',
};

const target = `node${process.version.slice(1)}`;

/** @param {string} filename */
const supports = (filename) => {
  if (filename.includes('node_modules')) return false;
  return extname(filename) in loaders;
};

const registerHook = () => {
  // @ts-expect-error: node patch
  const extensions = Module._extensions;
  const defaultLoaderJS = extensions['.js'];
  Object.keys(loaders).forEach((ext) => {
    const defaultLoader = extensions[ext] || defaultLoaderJS;

    extensions[ext] = (/** @type {any} */ mod, /** @type {string} */ filename) => {
      if (supports(filename)) {
        const defaultCompile = mod._compile;
        mod._compile = (/** @type {string} */ code) => {
          mod._compile = defaultCompile;
          return mod._compile(transpile(code, filename), filename);
        };
      }
      defaultLoader(mod, filename);
    };
  });
};

/**
 * @param {string} src
 * @param {string} filename
 */
const transpile = (src, filename) =>
  cachedGet(
    filename,
    () =>
      transformSync(src, {
        format: 'cjs',
        logLevel: 'error',
        target,
        minify: false,
        sourcemap: 'inline',
        loader: loaders[extname(filename)],
        sourcefile: filename,
      }).code
  );

module.exports.registerHook = registerHook;
module.exports.transpile = transpile;
