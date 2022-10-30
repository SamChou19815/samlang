// @ts-check

const { createHash } = require("crypto");
const { transpileESM } = require("./api");

/** @type {Map<string, import('esbuild').TransformResult>} */
const processCache = new Map();
function process(/** @type {string} */ src, /** @type {string} */ filename) {
  const existing = processCache.get(filename);
  if (existing != null) return existing;
  const result = transpileESM(src, filename);
  processCache.set(filename, result);
  return result;
}

function getCacheKey(/** @type {string} */ src, /** @type {string} */ filename) {
  return createHash("md5").update(filename).update(src).digest("hex");
}

module.exports = { process, getCacheKey };
