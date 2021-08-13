import runSamlangDemo from '..';

describe('samlang-demo', () => {
  it('runSamlangDemo works when given good program.', () => {
    expect(
      runSamlangDemo('class Main { function main(): unit = Builtins.println("hello world") }')
    ).toEqual({
      interpreterPrinted: 'hello world\n',
      prettyPrintedProgram: `class Main { function main(): unit = Builtins.println("hello world")  }\n`,
      jsString: `const _builtin_stringConcat = (a, b) => a + b;
const __Builtins_println = (line) => console.log(line);
const __Builtins_stringToInt = (v) => parseInt(v, 10);
const __Builtins_intToString = (v) => String(v);
const __Builtins_panic = (v) => { throw Error(v); };

const GLOBAL_STRING_0 = "hello world";
const _Demo_Main_main = () => {
  __Builtins_println(GLOBAL_STRING_0);
  return 0;
};

module.exports = { _Demo_Main_main };`,
      llvmString: `declare i32* @_builtin_malloc(i32) nounwind
declare i32 @__Builtins_println(i32*) nounwind
declare i32 @__Builtins_panic(i32*) nounwind
declare i32* @__Builtins_intToString(i32) nounwind
declare i32 @__Builtins_stringToInt(i32*) nounwind
declare i32* @_builtin_stringConcat(i32*, i32*) nounwind

; @GLOBAL_STRING_0 = 'hello world'
@GLOBAL_STRING_0 = private unnamed_addr constant [12 x i32] [i32 11, i32 104, i32 101, i32 108, i32 108, i32 111, i32 32, i32 119, i32 111, i32 114, i32 108, i32 100], align 8
define i32 @_Demo_Main_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [12 x i32]* @GLOBAL_STRING_0 to i32*
  call i32 @__Builtins_println(i32* %_temp_0_string_name_cast) nounwind
  ret i32 0
}`,
      errors: [],
    });
  });

  it('runSamlangDemo works when given non-runnable program', () => {
    expect(runSamlangDemo('class Main {}')).toEqual({
      prettyPrintedProgram: 'class Main {  }\n',
      interpreterPrinted: '',
      jsString: `const _builtin_stringConcat = (a, b) => a + b;
const __Builtins_println = (line) => console.log(line);
const __Builtins_stringToInt = (v) => parseInt(v, 10);
const __Builtins_intToString = (v) => String(v);
const __Builtins_panic = (v) => { throw Error(v); };


module.exports = {  };`,
      llvmString: `declare i32* @_builtin_malloc(i32) nounwind
declare i32 @__Builtins_println(i32*) nounwind
declare i32 @__Builtins_panic(i32*) nounwind
declare i32* @__Builtins_intToString(i32) nounwind
declare i32 @__Builtins_stringToInt(i32*) nounwind
declare i32* @_builtin_stringConcat(i32*, i32*) nounwind
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
