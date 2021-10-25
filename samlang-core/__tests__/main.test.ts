import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_MALLOC,
} from '../ast/common-names';
import { ModuleReference } from '../ast/common-nodes';
import { reformatSamlangSources, compileSamlangSources, compileSingleSamlangSource } from '../main';

describe('samlang-core/index', () => {
  it('reformatSamlangSources works', () => {
    expect(reformatSamlangSources([[new ModuleReference(['A']), 'class Main {}']])[0]?.[1]).toBe(
      'class Main {  }\n'
    );
  });

  it('compileSamlangSources fails when there are no valid entry point.', () => {
    expect(compileSamlangSources([], [new ModuleReference(['A'])])).toEqual({
      __type__: 'ERROR',
      errors: ['Invalid entry point: A does not exist.'],
    });
  });

  it('compileSingleSamlangSource works when given good program.', () => {
    expect(
      compileSingleSamlangSource(
        'class Main { function main(): unit = Builtins.println("hello world") }'
      )
    ).toEqual({
      __type__: 'OK',
      emittedTypeScriptCode: `type Str = [number, string];
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([, line]: Str): number => { console.log(line); return 0; };
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([, v]: Str): number => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v: number): Str => [1, String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = ([, v]: Str): number => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v: unknown): number => 0;
const GLOBAL_STRING_0: Str = [0, "hello world"];
function _Demo_Main_main(): number {
  ${ENCODED_FUNCTION_NAME_PRINTLN}(GLOBAL_STRING_0);
  return 0;
}

_Demo_Main_main();
`,
      emittedWasmCode: `(type $none_=>_i32 (func (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_PRINTLN}" (func $${ENCODED_FUNCTION_NAME_PRINTLN} (param i32) (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_THROW}" (func $${ENCODED_FUNCTION_NAME_THROW} (param i32) (result i32)))
(data (i32.const 4096) "\\00\\00\\00\\00\\0b\\00\\00\\00\\68\\00\\00\\00\\65\\00\\00\\00\\6c\\00\\00\\00\\6c\\00\\00\\00\\6f\\00\\00\\00\\20\\00\\00\\00\\77\\00\\00\\00\\6f\\00\\00\\00\\72\\00\\00\\00\\6c\\00\\00\\00\\64\\00\\00\\00")
(table $0 1 funcref)
(elem $0 (i32.const 0) $_Demo_Main_main)
(func $_Demo_Main_main  (result i32)
  (drop (call $__Builtins_println (i32.const 4096)))
  (i32.const 0)
)
(export "_Demo_Main_main" (func $_Demo_Main_main))
`,
    });
  });

  it('compileSingleSamlangSource works when program with type error.', () => {
    expect(compileSingleSamlangSource('class Main { function main(): string = 42 + "" }')).toEqual({
      __type__: 'ERROR',
      errors: [
        'Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.',
        'Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.',
      ],
    });
  });
});
