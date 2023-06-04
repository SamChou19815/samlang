import * as samlang from './index.js';

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Actual:\n${actual}\nExpected:\n${expected}`);
  }
}

assertEqual(typeof (await samlang.compile('class')), 'string');
const { tsCode, interpreterResult } = await samlang.compile(
  'class Main { function main(): unit = Builtins.println("Hi") }'
);
assertEqual(interpreterResult, 'Hi\n');
assertEqual(
  tsCode,
  `const __Builtins$stringConcat = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const __Builtins$println = (_: number, [, line]: _Str): number => { console.log(line); return 0; };
const __Builtins$stringToInt = (_: number, [, v]: _Str): number => parseInt(v, 10);
const __Builtins$intToString = (_: number, v: number): _Str => [1, String(v)];
const __Builtins$panic = (_: number, [, v]: _Str): number => { throw Error(v); };
const _builtin_free = (v: any): number => { v.length = 0; return 0 };
const GLOBAL_STRING_0: _Str = [0, \`Hi\`];
function _Demo_Main$main(): number {
  __Builtins$println(0, GLOBAL_STRING_0);
  return 0;
}

_Demo_Main$main();
`
);

assertEqual(
  await samlang.typeCheck('class Foo { function main(): int = true }'),
  'Demo.sam:1:36-1:40: [incompatible-type]: Expected: `int`, actual: `bool`.'
);
assertEqual(await samlang.typeCheck('class Foo {}'), '');

assertEqual(
  JSON.stringify(await samlang.queryType('class Foo {}', 1, 8)),
  '{"contents":[{"language":"samlang","value":"class Foo"}],"range":{"startLineNumber":1,"startColumn":7,"endLineNumber":1,"endColumn":10}}'
);
assertEqual(
  JSON.stringify(await samlang.queryDefinitionLocation('class Foo {}', 1, 8)),
  '{"startLineNumber":1,"startColumn":1,"endLineNumber":1,"endColumn":13}'
);

assertEqual(
  JSON.stringify(
    (
      await samlang.autoComplete(
        `
class Main {
  function main(a: Developer): Developer = a.
}
class Developer {
  private method f(): unit = {}
  method b(): unit = {}
}
`,
        3,
        46
      )
    ).map(({ insertText, ...rest }) => rest)
  ),
  '[{"range":{"startLineNumber":3,"startColumn":46,"endLineNumber":3,"endColumn":46},"label":"b","kind":2,"detail":"b(): unit"}]'
);
