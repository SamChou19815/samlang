const { spawnSync } = require('child_process');
const fs = require('fs');

const { minify } = require('terser');

const suppressTS = (filename) =>
  fs.writeFileSync(
    filename,
    `// @ts-nocheck

${fs.readFileSync(filename).toString()}`
  );

const suppressDTS = (filename) =>
  fs.writeFileSync(
    filename,
    `// @${'generated'}
/* eslint-disable */

${fs.readFileSync(filename).toString()}`
  );

const uglify = async (filename) =>
  fs.writeFileSync(
    filename,
    `// @${'generated'}
/* eslint-disable */
// prettier-ignore
${(await minify(fs.readFileSync(filename).toString(), { mangle: false, keep_fnames: true })).code}`
  );

(async () => {
  suppressTS('src/PLLexer.ts');
  suppressTS('src/PLParser.ts');
  suppressTS('src/PLVisitor.ts');

  spawnSync('yarn', ['tsc', '-p', 'tsconfig.generated.json'], { stdio: 'inherit' });
  await Promise.all([uglify('PLLexer.js'), uglify('PLParser.js'), uglify('PLVisitor.js')]);
  suppressDTS('PLLexer.d.ts');
  suppressDTS('PLParser.d.ts');
  suppressDTS('PLVisitor.d.ts');
  spawnSync('rm', ['-rf', 'src']);
  spawnSync('yarn', ['format:generatedDTS'], { stdio: 'inherit' });
})();
