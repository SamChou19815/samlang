// @ts-check

const { registerHook, transpile } = require('./api');

registerHook();

module.exports.process = transpile;
