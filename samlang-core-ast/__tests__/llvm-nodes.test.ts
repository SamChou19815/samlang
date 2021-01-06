import {
  prettyPrintLLVMType,
  LLVM_BOOL_TYPE,
  LLVM_INT_TYPE,
  LLVM_VOID_TYPE,
  LLVM_IDENTIFIER_TYPE,
  LLVM_POINTER_TYPE,
  LLVM_STRUCT_TYPE,
  LLVM_FUNCTION_TYPE,
} from '../llvm-nodes';

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
