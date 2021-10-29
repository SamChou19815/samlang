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
import { assert } from '../utils';

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

  it('compileSingleSamlangSource works when program with type error.', () => {
    expect(compileSingleSamlangSource('class Main { function main(): string = 42 + "" }')).toEqual({
      __type__: 'ERROR',
      errors: [
        'Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.',
        'Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.',
      ],
    });
  });

  it('compileSingleSamlangSource works when given good program.', () => {
    const result = compileSingleSamlangSource(
      'class Main { function main(): unit = Builtins.println("hello world") }'
    );
    assert(result.__type__ === 'OK');
    expect(result.emittedTSCode).toBe(`type Str = [number, string];
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
`);
    expect(result.interpreterResult).toBe('hello world\n');
  });
});
