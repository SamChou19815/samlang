const fs = require('fs');

const suppress = (filename) =>
  fs.writeFileSync(filename, `// @ts-nocheck\n${fs.readFileSync(filename).toString()}`);

suppress('parser/generated/PLLexer.ts');
suppress('parser/generated/PLParser.ts');
suppress('parser/generated/PLVisitor.ts');
