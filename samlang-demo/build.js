const { writeFileSync } = require('fs');
const { join } = require('path');

require('@vercel/ncc')(join(__dirname, 'src', 'index.ts'), {
  // minify: true,
  sourceMapRegister: false,
  transpileOnly: true,
  quiet: true,
}).then(({ code }) =>
  writeFileSync(
    join(__dirname, 'bin', 'index.js'),
    code
      .replace('require("assert")', '() => {}')
      .replace('require("util")', '{inspect:{custom:"UTIL_INSPECT_CUSTOM"}}')
  )
);
