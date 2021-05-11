import runSamlangDemo from '..';

it('runSamlangDemo works when given good program.', () => {
  expect(runSamlangDemo('class Main { function main(): unit = println("hello world") }')).toEqual({
    interpreterPrinted: 'hello world\n',
    prettyPrintedProgram: `class Main { function main(): unit = println("hello world")  }\n`,
    jsString: `const _builtin_stringConcat = (a, b) => a + b;
const _builtin_println = (line) => console.log(line);
const _builtin_stringToInt = (v) => parseInt(v, 10);
const _builtin_intToString = (v) => String(v);
const _builtin_throw = (v) => { throw Error(v); };

const GLOBAL_STRING_0 = "hello world";
const _compiled_program_main = () => {
  _builtin_println(GLOBAL_STRING_0);
  return 0;
};

_compiled_program_main();`,
    llvmString: `declare i32* @_builtin_malloc(i32) nounwind
declare i32 @_builtin_println(i32*) nounwind
declare i32 @_builtin_throw(i32*) nounwind
declare i32* @_builtin_intToString(i32) nounwind
declare i32 @_builtin_stringToInt(i32*) nounwind
declare i32* @_builtin_stringConcat(i32*, i32*) nounwind

; @GLOBAL_STRING_0 = 'hello world'
@GLOBAL_STRING_0 = private unnamed_addr constant [12 x i32] [i32 11, i32 104, i32 101, i32 108, i32 108, i32 111, i32 32, i32 119, i32 111, i32 114, i32 108, i32 100], align 8
define i32 @_compiled_program_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [12 x i32]* @GLOBAL_STRING_0 to i32*
  call i32 @_builtin_println(i32* %_temp_0_string_name_cast) nounwind
  ret i32 0
}`,
    errors: [],
  });
});

it('runSamlangDemo works when given non-runnable program', () => {
  expect(runSamlangDemo('class Main {}')).toEqual({
    prettyPrintedProgram: 'class Main {  }\n',
    interpreterPrinted: '',
    jsString: '// No JS output because there is no Main.main() function\n',
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
