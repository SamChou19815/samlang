import type { HighIRIdentifierType } from './hir-types';

export type LLVMPrimitiveType = {
  readonly __type__: 'PrimitiveType';
  readonly type: 'i1' | 'i64' | 'void';
};
export type LLVMIdentifierType = HighIRIdentifierType;

export type LLVMPointerType = {
  readonly __type__: 'PointerType';
  readonly boxed: LLVMType;
};

export type LLVMStructType = {
  readonly __type__: 'StructType';
  readonly mappings: readonly LLVMType[];
};

export type LLVMFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly LLVMType[];
  readonly returnType: LLVMType;
};

export type LLVMType =
  | LLVMPrimitiveType
  | LLVMIdentifierType
  | LLVMPointerType
  | LLVMStructType
  | LLVMFunctionType;

export const LLVM_BOOL_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i1' };
export const LLVM_INT_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i64' };
export const LLVM_VOID_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'void' };

export const LLVM_IDENTIFIER_TYPE = (name: string): LLVMIdentifierType => ({
  __type__: 'IdentifierType',
  name,
});

export const LLVM_POINTER_TYPE = (boxed: LLVMType): LLVMPointerType => ({
  __type__: 'PointerType',
  boxed,
});

export const LLVM_STRUCT_TYPE = (mappings: readonly LLVMType[]): LLVMStructType => ({
  __type__: 'StructType',
  mappings,
});

export const LLVM_FUNCTION_TYPE = (
  argumentTypes: readonly LLVMType[],
  returnType: LLVMType
): LLVMFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export const prettyPrintLLVMType = (type: LLVMType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return `%${type.name}`;
    case 'PointerType':
      return `${prettyPrintLLVMType(type.boxed)} *`;
    case 'StructType':
      return `{ ${type.mappings.map(prettyPrintLLVMType).join(', ')} }`;
    case 'FunctionType':
      return `${prettyPrintLLVMType(type.returnType)} (${type.argumentTypes
        .map(prettyPrintLLVMType)
        .join(', ')})`;
  }
};
