import {
  LLVMType,
  LLVM_INT_TYPE,
  LLVM_BOOL_TYPE,
  LLVM_STRING_TYPE,
  LLVM_FUNCTION_TYPE,
} from 'samlang-core-ast/llvm-nodes';
import type { MidIRType } from 'samlang-core-ast/mir-nodes';

const lowerMidIRTypeToLLVMType = (type: MidIRType): LLVMType => {
  switch (type.__type__) {
    case 'PrimitiveType':
      switch (type.type) {
        case 'bool':
          return LLVM_BOOL_TYPE;
        case 'int':
          return LLVM_INT_TYPE;
        case 'string':
        case 'any':
          return LLVM_STRING_TYPE();
      }
    case 'IdentifierType':
      return type;
    case 'FunctionType':
      return LLVM_FUNCTION_TYPE(
        type.argumentTypes.map(lowerMidIRTypeToLLVMType),
        lowerMidIRTypeToLLVMType(type.returnType)
      );
  }
};

export default lowerMidIRTypeToLLVMType;
