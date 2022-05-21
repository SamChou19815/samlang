// @ts-check

const { createHash } = require('crypto');
const { transpileESM } = require('./api');

module.exports.process = (/** @type {string} */ src, /** @type {string} */ filename) =>
  transpileESM(src, filename);

module.exports.getCacheKey = (/** @type {string} */ src, /** @type {string} */ filename) =>
  createHash('md5').update(filename).update(src).digest('hex');
