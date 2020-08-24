const fs = require('fs');

const suppress = (filename) =>
  fs.writeFileSync(filename, `// @ts-nocheck\n${fs.readFileSync(filename).toString()}`);

suppress('src/parser/generated/PLLexer.ts');
suppress('src/parser/generated/PLParser.ts');
