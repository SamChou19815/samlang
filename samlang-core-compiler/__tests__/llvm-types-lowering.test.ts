import lowerMidIRTypeToLLVMType from '../llvm-types-lowering';

import {
  LLVM_BOOL_TYPE,
  LLVM_FUNCTION_TYPE,
  LLVM_INT_TYPE,
  LLVM_STRING_TYPE,
} from 'samlang-core-ast/llvm-nodes';
import {
  MIR_ANY_TYPE,
  MIR_BOOL_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_INT_TYPE,
  MIR_STRING_TYPE,
} from 'samlang-core-ast/mir-types';

it('lowerMidIRTypeToLLVMType works', () => {
  expect(lowerMidIRTypeToLLVMType(MIR_BOOL_TYPE)).toEqual(LLVM_BOOL_TYPE);
  expect(lowerMidIRTypeToLLVMType(MIR_INT_TYPE)).toEqual(LLVM_INT_TYPE);
  expect(lowerMidIRTypeToLLVMType(MIR_STRING_TYPE)).toEqual(LLVM_STRING_TYPE());
  expect(lowerMidIRTypeToLLVMType(MIR_ANY_TYPE)).toEqual(LLVM_STRING_TYPE());
  expect(lowerMidIRTypeToLLVMType(MIR_IDENTIFIER_TYPE('a'))).toEqual(MIR_IDENTIFIER_TYPE('a'));
  expect(lowerMidIRTypeToLLVMType(MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_BOOL_TYPE))).toEqual(
    LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE)
  );
});
