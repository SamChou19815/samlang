import {
  isTheSameLLVMType,
  prettyPrintLLVMType,
  prettyPrintLLVMValue,
  prettyPrintLLVMInstruction,
  prettyPrintLLVMFunction,
  prettyPrintLLVMSources,
  LLVM_BOOL_TYPE,
  LLVM_INT_TYPE,
  LLVM_STRING_TYPE,
  LLVM_IDENTIFIER_TYPE,
  LLVM_FUNCTION_TYPE,
  LLVM_INT,
  LLVM_VARIABLE,
  LLVM_NAME,
  LLVM_CAST,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_STORE,
  LLVM_PHI,
  LLVM_CALL,
  LLVM_LABEL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_RETURN,
} from '../llvm-nodes';
import { MIR_IDENTIFIER_TYPE } from '../mir-nodes';

describe('llvm-nodes', () => {
  it('isTheSameLLVMType works', () => {
    expect(isTheSameLLVMType(LLVM_INT_TYPE, LLVM_STRING_TYPE())).toBeFalsy();
    expect(isTheSameLLVMType(LLVM_INT_TYPE, LLVM_BOOL_TYPE)).toBeFalsy();
    expect(isTheSameLLVMType(LLVM_INT_TYPE, LLVM_INT_TYPE)).toBeTruthy();
    expect(isTheSameLLVMType(LLVM_BOOL_TYPE, LLVM_BOOL_TYPE)).toBeTruthy();
    expect(isTheSameLLVMType(LLVM_BOOL_TYPE, LLVM_INT_TYPE)).toBeFalsy();

    expect(isTheSameLLVMType(LLVM_STRING_TYPE(), LLVM_STRING_TYPE())).toBeTruthy();
    expect(isTheSameLLVMType(LLVM_STRING_TYPE(13), LLVM_STRING_TYPE(13))).toBeTruthy();
    expect(isTheSameLLVMType(LLVM_STRING_TYPE(3), LLVM_STRING_TYPE())).toBeFalsy();
    expect(isTheSameLLVMType(LLVM_STRING_TYPE(), LLVM_BOOL_TYPE)).toBeFalsy();

    expect(isTheSameLLVMType(MIR_IDENTIFIER_TYPE('A'), LLVM_STRING_TYPE())).toBeFalsy();
    expect(isTheSameLLVMType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('B'))).toBeFalsy();
    expect(isTheSameLLVMType(MIR_IDENTIFIER_TYPE('A'), MIR_IDENTIFIER_TYPE('A'))).toBeTruthy();

    expect(
      isTheSameLLVMType(LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE), LLVM_INT_TYPE)
    ).toBeFalsy();
    expect(
      isTheSameLLVMType(
        LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE),
        LLVM_FUNCTION_TYPE([LLVM_BOOL_TYPE], LLVM_INT_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameLLVMType(
        LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE),
        LLVM_FUNCTION_TYPE([LLVM_BOOL_TYPE], LLVM_BOOL_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameLLVMType(
        LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE),
        LLVM_FUNCTION_TYPE([], LLVM_BOOL_TYPE)
      )
    ).toBeFalsy();
    expect(
      isTheSameLLVMType(
        LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE),
        LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE)
      )
    ).toBeTruthy();
  });

  it('prettyPrintLLVMType works.', () => {
    expect(prettyPrintLLVMType(LLVM_BOOL_TYPE)).toBe('i1');
    expect(prettyPrintLLVMType(LLVM_INT_TYPE)).toBe('i64');
    expect(prettyPrintLLVMType(LLVM_STRING_TYPE())).toBe('i64*');
    expect(prettyPrintLLVMType(LLVM_STRING_TYPE(3))).toBe('[3 x i64]*');
    expect(prettyPrintLLVMType(LLVM_IDENTIFIER_TYPE('Foo'))).toBe('%Foo*');
    expect(
      prettyPrintLLVMType(LLVM_FUNCTION_TYPE([LLVM_INT_TYPE, LLVM_BOOL_TYPE], LLVM_INT_TYPE))
    ).toBe('i64 (i64, i1)*');
  });

  it('prettyPrintLLVMValue works.', () => {
    expect(prettyPrintLLVMValue(LLVM_INT(0), LLVM_STRING_TYPE())).toBe('null');
    expect(prettyPrintLLVMValue(LLVM_INT(3), LLVM_INT_TYPE)).toBe('3');
    expect(prettyPrintLLVMValue(LLVM_INT(3), LLVM_INT_TYPE)).toBe('3');
    expect(prettyPrintLLVMValue(LLVM_VARIABLE('foo'), LLVM_INT_TYPE)).toBe('%foo');
    expect(prettyPrintLLVMValue(LLVM_NAME('foo'), LLVM_INT_TYPE)).toBe('@foo');
  });

  it('prettyPrintLLVMInstruction works for LLVM_CAST.', () => {
    expect(() =>
      prettyPrintLLVMInstruction(
        LLVM_CAST({
          resultVariable: 'foo',
          resultType: LLVM_INT_TYPE,
          sourceValue: LLVM_VARIABLE('bar'),
          sourceType: LLVM_INT_TYPE,
        })
      )
    ).toThrow();

    expect(
      prettyPrintLLVMInstruction(
        LLVM_CAST({
          resultVariable: 'foo',
          resultType: LLVM_IDENTIFIER_TYPE('Foo'),
          sourceValue: LLVM_VARIABLE('bar'),
          sourceType: LLVM_IDENTIFIER_TYPE('Bar'),
        })
      )
    ).toBe('%foo = bitcast %Bar* %bar to %Foo*');

    expect(() =>
      prettyPrintLLVMInstruction(
        LLVM_CAST({
          resultVariable: 'foo',
          resultType: LLVM_BOOL_TYPE,
          sourceValue: LLVM_VARIABLE('bar'),
          sourceType: LLVM_INT_TYPE,
        })
      )
    ).toThrow();

    expect(
      prettyPrintLLVMInstruction(
        LLVM_CAST({
          resultVariable: 'foo',
          resultType: LLVM_IDENTIFIER_TYPE('Foo'),
          sourceValue: LLVM_VARIABLE('bar'),
          sourceType: LLVM_INT_TYPE,
        })
      )
    ).toBe('%foo = inttoptr i64 %bar to %Foo*');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_CAST({
          resultVariable: 'foo',
          resultType: LLVM_INT_TYPE,
          sourceValue: LLVM_VARIABLE('bar'),
          sourceType: LLVM_IDENTIFIER_TYPE('Bar'),
        })
      )
    ).toBe('%foo = ptrtoint %Bar* %bar to i64');
  });

  it('prettyPrintLLVMInstruction works for LLVM_GET_ELEMENT_PTR.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_GET_ELEMENT_PTR({
          resultVariable: 'foo',
          sourceValue: LLVM_VARIABLE('bar'),
          sourcePointerType: LLVM_IDENTIFIER_TYPE('Bar'),
          offset: 3,
        })
      )
    ).toBe('%foo = getelementptr %Bar, %Bar* %bar, i32 0, i32 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_GET_ELEMENT_PTR({
          resultVariable: 'foo',
          sourceValue: LLVM_VARIABLE('bar'),
          sourcePointerType: LLVM_STRING_TYPE(),
          offset: 3,
        })
      )
    ).toBe('%foo = getelementptr i64, i64* %bar, i32 3');
  });

  it('prettyPrintLLVMInstruction works for LLVM_BINARY.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '+',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(3),
        })
      )
    ).toBe('%foo = add i64 %bar, 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '-',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(3),
        })
      )
    ).toBe('%foo = sub i64 %bar, 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '*',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(3),
        })
      )
    ).toBe('%foo = mul i64 %bar, 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '/',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(3),
        })
      )
    ).toBe('%foo = sdiv i64 %bar, 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '%',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(3),
        })
      )
    ).toBe('%foo = srem i64 %bar, 3');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '^',
          operandType: LLVM_BOOL_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = xor i1 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '<',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp slt i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '<=',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp sle i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '>',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp sgt i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '>=',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp sge i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '==',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp eq i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '!=',
          operandType: LLVM_INT_TYPE,
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(1),
        })
      )
    ).toBe('%foo = icmp ne i64 %bar, 1');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_BINARY({
          resultVariable: 'foo',
          operator: '!=',
          operandType: LLVM_STRING_TYPE(),
          v1: LLVM_VARIABLE('bar'),
          v2: LLVM_INT(0),
        })
      )
    ).toBe('%foo = icmp ne i64* %bar, null');
  });

  it('prettyPrintLLVMInstruction works for LLVM_LOAD.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_LOAD({
          resultVariable: 'foo',
          sourceVariable: 'bar',
          valueType: LLVM_INT_TYPE,
        })
      )
    ).toBe('%foo = load i64, i64* %bar');
  });

  it('prettyPrintLLVMInstruction works for LLVM_STORE.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_STORE({
          targetVariable: 'foo',
          sourceValue: LLVM_NAME('bar'),
          valueType: LLVM_INT_TYPE,
        })
      )
    ).toBe('store i64 @bar, i64* %foo');
  });

  it('prettyPrintLLVMInstruction works for LLVM_PHI.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_PHI({
          resultVariable: 'f',
          variableType: LLVM_INT_TYPE,
          valueBranchTuples: [
            { value: LLVM_VARIABLE('bar'), branch: 'b1' },
            { value: LLVM_INT(1), branch: 'b2' },
            { value: LLVM_INT(42), branch: 'b3' },
          ],
        })
      )
    ).toBe('%f = phi i64 [ %bar, %b1 ], [ 1, %b2 ], [ 42, %b3 ]');
  });

  it('prettyPrintLLVMInstruction works for LLVM_CALL.', () => {
    expect(
      prettyPrintLLVMInstruction(
        LLVM_CALL({
          resultType: LLVM_INT_TYPE,
          resultVariable: 'c',
          functionName: LLVM_NAME('plusPlus'),
          functionArguments: [
            { value: LLVM_VARIABLE('bar'), type: LLVM_INT_TYPE },
            { value: LLVM_INT(1), type: LLVM_INT_TYPE },
          ],
        })
      )
    ).toBe('%c = call i64 @plusPlus(i64 %bar, i64 1) nounwind');

    expect(
      prettyPrintLLVMInstruction(
        LLVM_CALL({
          resultType: LLVM_INT_TYPE,
          functionName: LLVM_NAME('plusPlus'),
          functionArguments: [
            { value: LLVM_VARIABLE('bar'), type: LLVM_INT_TYPE },
            { value: LLVM_INT(1), type: LLVM_INT_TYPE },
          ],
        })
      )
    ).toBe('call i64 @plusPlus(i64 %bar, i64 1) nounwind');
  });

  it('prettyPrintLLVMInstruction works for LLVM_LABEL.', () => {
    expect(prettyPrintLLVMInstruction(LLVM_LABEL('bb'))).toBe('bb:');
  });

  it('prettyPrintLLVMInstruction works for LLVM_JUMP.', () => {
    expect(prettyPrintLLVMInstruction(LLVM_JUMP('bb'))).toBe('br label %bb');
  });

  it('prettyPrintLLVMInstruction works for LLVM_CJUMP.', () => {
    expect(prettyPrintLLVMInstruction(LLVM_CJUMP(LLVM_VARIABLE('c'), 'b1', 'b2'))).toBe(
      'br i1 %c, label %b1, label %b2'
    );
  });

  it('prettyPrintLLVMInstruction works for LLVM_RETURN.', () => {
    expect(prettyPrintLLVMInstruction(LLVM_RETURN(LLVM_VARIABLE('bar'), LLVM_BOOL_TYPE))).toBe(
      'ret i1 %bar'
    );
  });

  it('prettyPrintLLVMFunction works', () => {
    expect(
      prettyPrintLLVMFunction({
        name: 'fact',
        parameters: [{ parameterName: 'n', parameterType: LLVM_INT_TYPE }],
        returnType: LLVM_INT_TYPE,
        body: [LLVM_LABEL('start'), LLVM_RETURN(LLVM_VARIABLE('n'), LLVM_INT_TYPE)],
      })
    ).toBe(`define i64 @fact(i64 %n) local_unnamed_addr nounwind {
start:
  ret i64 %n
}`);
  });

  it('prettyPrintLLVMSources works', () => {
    expect(
      prettyPrintLLVMSources({
        globalVariables: [
          { name: 'hw', content: 'AA' },
          { name: 'empty', content: '' },
        ],
        typeDefinitions: [
          { identifier: 'Foo', mappings: [LLVM_INT_TYPE, LLVM_IDENTIFIER_TYPE('Bar')] },
        ],
        mainFunctionNames: [],
        functions: [
          {
            name: 'fact',
            parameters: [{ parameterName: 'n', parameterType: LLVM_INT_TYPE }],
            returnType: LLVM_INT_TYPE,
            body: [LLVM_LABEL('start'), LLVM_RETURN(LLVM_VARIABLE('n'), LLVM_INT_TYPE)],
          },
        ],
      })
    ).toBe(`declare i64* @_builtin_malloc(i64) nounwind
declare i64 @__Builtins_println(i64*) nounwind
declare i64 @__Builtins_panic(i64*) nounwind
declare i64* @__Builtins_intToString(i64) nounwind
declare i64 @__Builtins_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind
declare i64 @_builtin_free(i64*) nounwind

; @hw = 'AA'
@hw = private unnamed_addr constant [4 x i64] [i64 0, i64 2, i64 65, i64 65], align 8
; @empty = ''
@empty = private unnamed_addr constant [2 x i64] [i64 0, i64 0], align 8
%Foo = type { i64, %Bar* }
define i64 @fact(i64 %n) local_unnamed_addr nounwind {
start:
  ret i64 %n
}`);
  });
});
