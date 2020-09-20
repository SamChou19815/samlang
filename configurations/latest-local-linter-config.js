module.exports = require('../../website/packages/eslint-config-common/api')(
  require.resolve('@typescript-eslint/parser'),
  require.resolve('eslint-import-resolver-node')
);
