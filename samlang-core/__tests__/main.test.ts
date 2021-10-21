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
const _builtin_stringConcat = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const __Builtins_println = ([, line]: Str): number => { console.log(line); return 0; };
const __Builtins_stringToInt = ([, v]: Str): number => parseInt(v, 10);
const __Builtins_intToString = (v: number): Str => [1, String(v)];
const __Builtins_panic = ([, v]: Str): number => { throw Error(v); };
const _builtin_free = (v: unknown): number => 0;
const GLOBAL_STRING_0: Str = [0, "hello world"];
function _Demo_Main_main(): number {
  __Builtins_println(GLOBAL_STRING_0);
  return 0;
}

_Demo_Main_main();
`,
      emittedLLVMCode: `declare i64* @_builtin_malloc(i64) nounwind
declare i64 @__Builtins_println(i64*) nounwind
declare i64 @__Builtins_panic(i64*) nounwind
declare i64* @__Builtins_intToString(i64) nounwind
declare i64 @__Builtins_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind
declare i64 @_builtin_free(i64*) nounwind

; @GLOBAL_STRING_0 = 'hello world'
@GLOBAL_STRING_0 = private unnamed_addr constant [13 x i64] [i64 0, i64 11, i64 104, i64 101, i64 108, i64 108, i64 111, i64 32, i64 119, i64 111, i64 114, i64 108, i64 100], align 8
define i64 @_Demo_Main_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [13 x i64]* @GLOBAL_STRING_0 to i64*
  call i64 @__Builtins_println(i64* %_temp_0_string_name_cast) nounwind
  ret i64 0
}
define i64 @_compiled_program_main() local_unnamed_addr nounwind {
  call i64 @_Demo_Main_main() nounwind
  ret i64 0
}
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
