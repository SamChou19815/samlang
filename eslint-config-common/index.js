// @ts-check

module.exports = require('./api')(
  require.resolve('@typescript-eslint/parser'),
  require.resolve('eslint-import-resolver-node')
);
