import type { HighIRType } from 'samlang-core-ast/hir-types';
import {
  LLVMType,
  LLVM_INT_TYPE,
  LLVM_BOOL_TYPE,
  LLVM_STRING_TYPE,
  LLVM_STRUCT_TYPE,
  LLVM_FUNCTION_TYPE,
} from 'samlang-core-ast/llvm-nodes';

const lowerHighIRTypeToLLVMType = (type: HighIRType): LLVMType => {
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
    // eslint-disable-next-line no-fallthrough
    case 'IdentifierType':
      return type;
    case 'StructType':
      return LLVM_STRUCT_TYPE(type.mappings.map(lowerHighIRTypeToLLVMType));
    case 'FunctionType':
      return LLVM_FUNCTION_TYPE(
        type.argumentTypes.map(lowerHighIRTypeToLLVMType),
        lowerHighIRTypeToLLVMType(type.returnType)
      );
  }
};

export default lowerHighIRTypeToLLVMType;
