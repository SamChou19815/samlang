import runSamlangDemo from '..';

describe('samlang-demo', () => {
  it('runSamlangDemo works when given good program.', () => {
    expect(
      runSamlangDemo('class Main { function main(): unit = Builtins.println("hello world") }')
    ).toEqual({
      interpreterPrinted: 'hello world\n',
      prettyPrintedProgram: `class Main { function main(): unit = Builtins.println("hello world")  }\n`,
      jsString: `/** @type {Str} */ const GLOBAL_STRING_0 = [0, "hello world"];
function _Demo_Main_main() {
  let _mid_t0 = __Builtins_println(GLOBAL_STRING_0);
  return 0;
}
`,
      llvmString: `declare i64* @_builtin_malloc(i64) nounwind
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
  %_mid_t0 = call i64 @__Builtins_println(i64* %_temp_0_string_name_cast) nounwind
  ret i64 0
}`,
      errors: [],
    });
  });

  it('runSamlangDemo works when given non-runnable program', () => {
    expect(runSamlangDemo('class Main {}')).toEqual({
      prettyPrintedProgram: 'class Main {  }\n',
      interpreterPrinted: '',
      jsString: ``,
      llvmString: `declare i64* @_builtin_malloc(i64) nounwind
declare i64 @__Builtins_println(i64*) nounwind
declare i64 @__Builtins_panic(i64*) nounwind
declare i64* @__Builtins_intToString(i64) nounwind
declare i64 @__Builtins_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind
declare i64 @_builtin_free(i64*) nounwind
`,
      assemblyString: undefined,
      errors: [],
    });
  });

  it('runSamlangDemo works when program with type error.', () => {
    expect(runSamlangDemo('class Main { function main(): string = 42 + "" }')).toEqual({
      errors: [
        'Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.',
        'Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.',
      ],
    });
  });
});
