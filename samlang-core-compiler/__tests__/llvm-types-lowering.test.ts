import lowerHighIRTypeToLLVMType from '../llvm-types-lowering';

import {
  HIR_ANY_TYPE,
  HIR_BOOL_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_STRUCT_TYPE,
} from 'samlang-core-ast/hir-types';
import {
  LLVM_BOOL_TYPE,
  LLVM_FUNCTION_TYPE,
  LLVM_INT_TYPE,
  LLVM_STRING_TYPE,
  LLVM_STRUCT_TYPE,
} from 'samlang-core-ast/llvm-nodes';

it('lowerHighIRTypeToLLVMType works', () => {
  expect(lowerHighIRTypeToLLVMType(HIR_BOOL_TYPE)).toEqual(LLVM_BOOL_TYPE);
  expect(lowerHighIRTypeToLLVMType(HIR_INT_TYPE)).toEqual(LLVM_INT_TYPE);
  expect(lowerHighIRTypeToLLVMType(HIR_STRING_TYPE)).toEqual(LLVM_STRING_TYPE());
  expect(lowerHighIRTypeToLLVMType(HIR_ANY_TYPE)).toEqual(LLVM_STRING_TYPE());
  expect(lowerHighIRTypeToLLVMType(HIR_IDENTIFIER_TYPE('a'))).toEqual(HIR_IDENTIFIER_TYPE('a'));
  expect(lowerHighIRTypeToLLVMType(HIR_STRUCT_TYPE([HIR_INT_TYPE]))).toEqual(
    LLVM_STRUCT_TYPE([LLVM_INT_TYPE])
  );
  expect(lowerHighIRTypeToLLVMType(HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_BOOL_TYPE))).toEqual(
    LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE)
  );
});
