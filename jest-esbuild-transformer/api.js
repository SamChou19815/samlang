// @ts-check

const { transformSync } = require('esbuild');
const Module = require('module');
const { extname } = require('path');

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
          return mod._compile(transpile(code, filename, 'cjs').code, filename);
        };
      }
      defaultLoader(mod, filename);
    };
  });
};

/**
 * @param {string} src
 * @param {string} filename
 * @param {'esm' | 'cjs'} format
 * @returns {import('esbuild').TransformResult}
 */
const transpile = (src, filename, format) =>
  transformSync(src, {
    format,
    logLevel: 'error',
    target,
    minify: false,
    sourcemap: 'inline',
    loader: loaders[extname(filename)],
    sourcefile: filename,
  });

/**
 * @param {string} src
 * @param {string} filename
 * @returns {import('esbuild').TransformResult}
 */
const transpileESM = (src, filename) => transpile(src, filename, 'esm');

module.exports.registerHook = registerHook;
module.exports.transpileESM = transpileESM;
