import type { IROperator } from './common-operators';
import type { HighIRIdentifierType } from './hir-types';

import type { Long } from 'samlang-core-utils';

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

export type LLVMValue = Long | string;

export type LLVMAnnotatedValue = { readonly value: LLVMValue; readonly type: LLVMType };

export type LLVMGetElementAddressInstruction = {
  readonly __type__: 'LLVMGetElementAddressInstruction';
  readonly pointerType: LLVMType;
  readonly value: LLVMValue;
  readonly offset: number;
};

export type LLVMBinaryInstruction = {
  readonly __type__: 'LLVMBinaryInstruction';
  readonly resultVariable: string;
  readonly operator: IROperator;
  readonly e1: LLVMValue;
  readonly e2: LLVMValue;
};

export type LLVMLoadInstruction = {
  readonly __type__: 'LLVMBinaryInstruction';
  readonly resultVariable: string;
  readonly resultType: LLVMType;
  readonly sourceVariable: string;
  readonly sourceType: LLVMType;
};

export type LLVMStoreInstruction = {
  readonly __type__: 'LLVMStoreInstruction';
  readonly targetVariable: string;
  readonly targetType: LLVMType;
  readonly sourceVariable: string;
  readonly sourceType: LLVMType;
};

export type LLVMPhiInstruction = {
  readonly __type__: 'LLVMPhiInstruction';
  readonly variableType: LLVMType;
  readonly v1: string;
  readonly b1: string;
  readonly v2: string;
  readonly b2: string;
};

export type LLVMFunctionCallInstruction = {
  readonly __type__: 'LLVMFunctionCallInstruction';
  readonly resultType: LLVMType;
  readonly resultVariable?: string;
  readonly functionName: LLVMValue; // ???
  readonly functionArguments: readonly LLVMAnnotatedValue[];
};

export type LLVMConditionalJumpInstruction = {
  readonly __type__: 'LLVMBranchInstruction';
  readonly condition: LLVMValue;
  readonly b1: string;
  readonly b2: string;
};

export type LLVMReturnInstruction = {
  readonly __type__: 'LLVMReturnInstruction';
  readonly value?: LLVMAnnotatedValue;
};

export type LLVMInstruction =
  | LLVMGetElementAddressInstruction
  | LLVMBinaryInstruction
  | LLVMLoadInstruction
  | LLVMStoreInstruction
  | LLVMPhiInstruction
  | LLVMFunctionCallInstruction
  | LLVMConditionalJumpInstruction
  | LLVMReturnInstruction;
