import * as samlang from './index.js';

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Actual:\n${actual}\nExpected:\n${expected}`);
  }
}

assertEqual(typeof (await samlang.compile('class')), 'string');
const { tsCode, interpreterResult } = await samlang.compile(
  'class Main { function main(): unit = Process.println("Hi") }'
);
assertEqual(interpreterResult, 'Hi\n');
assertEqual(
  tsCode,
  `const __Str$concat = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const __Process$println = (_: number, [, l]: _Str): number => { console.log(l); return 0; };
const __Str$toInt = ([, v]: _Str): number => parseInt(v as unknown as string, 10);
const __Str$fromInt = (_: number, v: number): _Str => [1, String(v) as unknown as number];
const __Process$panic = (_: number, [, v]: _Str): never => { throw Error(v as unknown as string); };
// empty the array to mess up program code that uses after free.
const __$free = (v: any): number => { v.length = 0; return 0 };
const GLOBAL_STRING_3: _Str = [0, \`Hi\` as unknown as number];
function _Demo_Main$main(): number {
  __Process$println(0, GLOBAL_STRING_3);
  return 0;
}

_Demo_Main$main();
`
);

assertEqual(
  JSON.stringify(await samlang.typeCheck('class Foo { function main(): int = true }')),
  '[{"startLineNumber":1,"startColumn":36,"endLineNumber":1,"endColumn":40,"message":"`bool` [0] is incompatible with `int` [1].","severity":8}]'
);
assertEqual(JSON.stringify(await samlang.typeCheck('class Foo {}')), '[]');

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
