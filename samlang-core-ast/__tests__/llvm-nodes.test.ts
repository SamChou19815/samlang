import {
  prettyPrintLLVMType,
  prettyPrintLLVMValue,
  prettyPrintLLVMInstruction,
  LLVM_BOOL_TYPE,
  LLVM_INT_TYPE,
  LLVM_VOID_TYPE,
  LLVM_IDENTIFIER_TYPE,
  LLVM_POINTER_TYPE,
  LLVM_STRUCT_TYPE,
  LLVM_FUNCTION_TYPE,
  LLVM_INT,
  LLVM_VARIABLE,
  LLVM_NAME,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_STORE,
  LLVM_PHI,
  LLVM_CALL,
  LLVM_CJUMP,
  LLVM_RETURN,
  LLVM_RETURN_VOID,
  LLVM_JUMP,
} from '../llvm-nodes';

import { Long } from 'samlang-core-utils';

it('prettyPrintLLVMType works.', () => {
  expect(prettyPrintLLVMType(LLVM_BOOL_TYPE)).toBe('i1');
  expect(prettyPrintLLVMType(LLVM_INT_TYPE)).toBe('i64');
  expect(prettyPrintLLVMType(LLVM_VOID_TYPE)).toBe('void');
  expect(prettyPrintLLVMType(LLVM_IDENTIFIER_TYPE('Foo'))).toBe('%Foo');
  expect(prettyPrintLLVMType(LLVM_POINTER_TYPE(LLVM_INT_TYPE))).toBe('i64 *');
  expect(prettyPrintLLVMType(LLVM_STRUCT_TYPE([LLVM_INT_TYPE, LLVM_BOOL_TYPE]))).toBe(
    '{ i64, i1 }'
  );
  expect(
    prettyPrintLLVMType(LLVM_FUNCTION_TYPE([LLVM_INT_TYPE, LLVM_BOOL_TYPE], LLVM_VOID_TYPE))
  ).toBe('void (i64, i1)');
});

it('prettyPrintLLVMValue works.', () => {
  expect(prettyPrintLLVMValue(LLVM_INT(3))).toBe('3');
  expect(prettyPrintLLVMValue(LLVM_INT(Long.fromInt(3)))).toBe('3');
  expect(prettyPrintLLVMValue(LLVM_VARIABLE('foo'))).toBe('%foo');
  expect(prettyPrintLLVMValue(LLVM_NAME('foo'))).toBe('@foo');
});

it('prettyPrintLLVMInstruction works for LLVM_GET_ELEMENT_PTR.', () => {
  expect(
    prettyPrintLLVMInstruction(
      LLVM_GET_ELEMENT_PTR({
        resultVariable: 'foo',
        pointerType: LLVM_IDENTIFIER_TYPE('Foo'),
        sourceVariable: 'bar',
        offset: 3,
      })
    )
  ).toBe('%foo = getelementptr %Foo, %Foo %bar, i64 3');
});

it('prettyPrintLLVMInstruction works for LLVM_BINARY.', () => {
  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '+',
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
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp slt i1 %bar, 1');

  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '<=',
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp sle i1 %bar, 1');

  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '>',
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp sgt i1 %bar, 1');

  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '>=',
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp sge i1 %bar, 1');

  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '==',
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp eq i1 %bar, 1');

  expect(
    prettyPrintLLVMInstruction(
      LLVM_BINARY({
        resultVariable: 'foo',
        operator: '!=',
        v1: LLVM_VARIABLE('bar'),
        v2: LLVM_INT(1),
      })
    )
  ).toBe('%foo = icmp ne i1 %bar, 1');
});

it('prettyPrintLLVMInstruction works for LLVM_LOAD.', () => {
  expect(
    prettyPrintLLVMInstruction(
      LLVM_LOAD({
        resultVariable: 'foo',
        resultType: LLVM_IDENTIFIER_TYPE('Foo'),
        sourceVariable: 'bar',
        sourceType: LLVM_IDENTIFIER_TYPE('Foo'),
      })
    )
  ).toBe('%foo = load %Foo, %Foo %bar');
});

it('prettyPrintLLVMInstruction works for LLVM_STORE.', () => {
  expect(
    prettyPrintLLVMInstruction(
      LLVM_STORE({
        targetVariable: 'foo',
        targetType: LLVM_IDENTIFIER_TYPE('Foo'),
        sourceValue: LLVM_NAME('bar'),
        sourceType: LLVM_IDENTIFIER_TYPE('Foo'),
      })
    )
  ).toBe('store %Foo %@bar, %Foo %foo');
});

it('prettyPrintLLVMInstruction works for LLVM_PHI.', () => {
  expect(
    prettyPrintLLVMInstruction(
      LLVM_PHI({
        variableType: LLVM_INT_TYPE,
        v1: LLVM_VARIABLE('bar'),
        b1: 'b1',
        v2: LLVM_INT(1),
        b2: 'b2',
      })
    )
  ).toBe('phi i64 [ %bar, %b1 ], [ 1, %b2 ]');
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

it('prettyPrintLLVMInstruction works for LLVM_JUMP.', () => {
  expect(prettyPrintLLVMInstruction(LLVM_JUMP('bb'))).toBe('br label %bb');
});

it('prettyPrintLLVMInstruction works for LLVM_CJUMP.', () => {
  expect(prettyPrintLLVMInstruction(LLVM_CJUMP(LLVM_VARIABLE('c'), 'b1', 'b2'))).toBe(
    'br i1 %c, label %b1, label %b2'
  );
});

it('prettyPrintLLVMInstruction works for LLVM_RETURN.', () => {
  expect(prettyPrintLLVMInstruction(LLVM_RETURN_VOID)).toBe('ret void');

  expect(prettyPrintLLVMInstruction(LLVM_RETURN(LLVM_VARIABLE('bar'), LLVM_BOOL_TYPE))).toBe(
    'ret i1 %bar'
  );
});
