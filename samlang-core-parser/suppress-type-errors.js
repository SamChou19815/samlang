const fs = require('fs');

const suppress = (filename) =>
  fs.writeFileSync(
    filename,
    `// @ts-nocheck\n\n// @${'generated'}\n\n${fs.readFileSync(filename).toString()}`
  );

suppress('generated/PLLexer.ts');
suppress('generated/PLParser.ts');
suppress('generated/PLVisitor.ts');
