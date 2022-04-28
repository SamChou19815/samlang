// @ts-check

const { registerHook, transpile } = require('./api');

registerHook();

module.exports.process = (/** @type {string} */ src, /** @type {string} */ filename) => ({
  code: transpile(src, filename),
});
