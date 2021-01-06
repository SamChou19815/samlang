import type { IROperator } from './common-operators';
import type { HighIRIdentifierType } from './hir-types';

import { Long } from 'samlang-core-utils';

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

export type LLVMLiteral = { readonly __type__: 'LLVMLiteral'; readonly value: Long };
export type LLVMVariable = { readonly __type__: 'LLVMVariable'; readonly name: string };
export type LLVMName = { readonly __type__: 'LLVMName'; readonly name: string };
export type LLVMValue = LLVMLiteral | LLVMVariable | LLVMName;

export const LLVM_INT = (value: Long | number): LLVMLiteral => ({
  __type__: 'LLVMLiteral',
  value: typeof value === 'number' ? Long.fromInt(value) : value,
});

export const LLVM_VARIABLE = (name: string): LLVMVariable => ({ __type__: 'LLVMVariable', name });
export const LLVM_NAME = (name: string): LLVMName => ({ __type__: 'LLVMName', name });

export const prettyPrintLLVMValue = (value: LLVMValue): string => {
  switch (value.__type__) {
    case 'LLVMLiteral':
      return value.value.toString();
    case 'LLVMVariable':
      return `%${value.name}`;
    case 'LLVMName':
      return `@${value.name}`;
  }
};

export type LLVMAnnotatedValue = { readonly value: LLVMValue; readonly type: LLVMType };

export type LLVMGetElementPointerInstruction = {
  readonly __type__: 'LLVMGetElementPointerInstruction';
  readonly resultVariable: string;
  readonly pointerType: LLVMType;
  readonly sourceVariable: string;
  readonly offset: number;
};

export type LLVMBinaryInstruction = {
  readonly __type__: 'LLVMBinaryInstruction';
  readonly resultVariable: string;
  readonly operator: IROperator;
  readonly v1: LLVMValue;
  readonly v2: LLVMValue;
};

export type LLVMLoadInstruction = {
  readonly __type__: 'LLVMLoadInstruction';
  readonly resultVariable: string;
  readonly resultType: LLVMType;
  readonly sourceVariable: string;
  readonly sourceType: LLVMType;
};

export type LLVMStoreInstruction = {
  readonly __type__: 'LLVMStoreInstruction';
  readonly targetVariable: string;
  readonly targetType: LLVMType;
  readonly sourceValue: LLVMValue;
  readonly sourceType: LLVMType;
};

export type LLVMPhiInstruction = {
  readonly __type__: 'LLVMPhiInstruction';
  readonly variableType: LLVMType;
  readonly v1: LLVMValue;
  readonly b1: string;
  readonly v2: LLVMValue;
  readonly b2: string;
};

export type LLVMFunctionCallInstruction = {
  readonly __type__: 'LLVMFunctionCallInstruction';
  readonly resultType: LLVMType;
  readonly resultVariable?: string;
  readonly functionName: LLVMValue;
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
  | LLVMGetElementPointerInstruction
  | LLVMBinaryInstruction
  | LLVMLoadInstruction
  | LLVMStoreInstruction
  | LLVMPhiInstruction
  | LLVMFunctionCallInstruction
  | LLVMConditionalJumpInstruction
  | LLVMReturnInstruction;

type ConstructorArgumentObject<E extends LLVMInstruction> = Omit<E, '__type__'>;

export const LLVM_GET_ELEMENT_PTR = ({
  resultVariable,
  pointerType,
  sourceVariable,
  offset,
}: ConstructorArgumentObject<LLVMGetElementPointerInstruction>): LLVMGetElementPointerInstruction => ({
  __type__: 'LLVMGetElementPointerInstruction',
  resultVariable,
  pointerType,
  sourceVariable,
  offset,
});

export const LLVM_BINARY = ({
  resultVariable,
  operator,
  v1,
  v2,
}: ConstructorArgumentObject<LLVMBinaryInstruction>): LLVMBinaryInstruction => ({
  __type__: 'LLVMBinaryInstruction',
  resultVariable,
  operator,
  v1,
  v2,
});

export const LLVM_LOAD = ({
  resultVariable,
  resultType,
  sourceVariable,
  sourceType,
}: ConstructorArgumentObject<LLVMLoadInstruction>): LLVMLoadInstruction => ({
  __type__: 'LLVMLoadInstruction',
  resultVariable,
  resultType,
  sourceVariable,
  sourceType,
});

export const LLVM_STORE = ({
  targetVariable,
  targetType,
  sourceValue,
  sourceType,
}: ConstructorArgumentObject<LLVMStoreInstruction>): LLVMStoreInstruction => ({
  __type__: 'LLVMStoreInstruction',
  targetVariable,
  targetType,
  sourceValue,
  sourceType,
});

export const LLVM_PHI = ({
  variableType,
  v1,
  b1,
  v2,
  b2,
}: ConstructorArgumentObject<LLVMPhiInstruction>): LLVMPhiInstruction => ({
  __type__: 'LLVMPhiInstruction',
  variableType,
  v1,
  b1,
  v2,
  b2,
});

export const LLVM_CALL = ({
  resultType,
  resultVariable,
  functionName,
  functionArguments,
}: ConstructorArgumentObject<LLVMFunctionCallInstruction>): LLVMFunctionCallInstruction => ({
  __type__: 'LLVMFunctionCallInstruction',
  resultType,
  resultVariable,
  functionName,
  functionArguments,
});

export const LLVM_CJUMP = ({
  condition,
  b1,
  b2,
}: ConstructorArgumentObject<LLVMConditionalJumpInstruction>): LLVMConditionalJumpInstruction => ({
  __type__: 'LLVMBranchInstruction',
  condition,
  b1,
  b2,
});

export const LLVM_RETURN_VOID: LLVMReturnInstruction = { __type__: 'LLVMReturnInstruction' };

export const LLVM_RETURN = (value: LLVMValue, type: LLVMType): LLVMReturnInstruction => ({
  __type__: 'LLVMReturnInstruction',
  value: { value, type },
});

export const prettyPrintLLVMInstruction = (instruction: LLVMInstruction): string => {
  switch (instruction.__type__) {
    case 'LLVMGetElementPointerInstruction': {
      const { resultVariable, pointerType, sourceVariable, offset } = instruction;
      const type = prettyPrintLLVMType(pointerType);
      return `%${resultVariable} = getelementptr ${type}, ${type} %${sourceVariable}, i64 ${offset}`;
    }
    case 'LLVMBinaryInstruction': {
      const result = `%${instruction.resultVariable}`;
      const v1 = prettyPrintLLVMValue(instruction.v1);
      const v2 = prettyPrintLLVMValue(instruction.v2);
      let stringOperatorAndType: string;
      switch (instruction.operator) {
        case '+':
          stringOperatorAndType = 'add i64';
          break;
        case '-':
          stringOperatorAndType = 'sub i64';
          break;
        case '*':
          stringOperatorAndType = 'mul i64';
          break;
        case '/':
          stringOperatorAndType = 'sdiv i64';
          break;
        case '%':
          stringOperatorAndType = 'srem i64';
          break;
        case '^':
          stringOperatorAndType = 'xor i1';
          break;
        case '<':
          stringOperatorAndType = 'icmp slt i1';
          break;
        case '<=':
          stringOperatorAndType = 'icmp sle i1';
          break;
        case '>':
          stringOperatorAndType = 'icmp sgt i1';
          break;
        case '>=':
          stringOperatorAndType = 'icmp sge i1';
          break;
        case '==':
          stringOperatorAndType = 'icmp eq i1';
          break;
        case '!=':
          stringOperatorAndType = 'icmp ne i1';
          break;
      }
      return `${result} = ${stringOperatorAndType} ${v1}, ${v2}`;
    }
    case 'LLVMLoadInstruction': {
      const { resultVariable, sourceVariable } = instruction;
      const resultType = prettyPrintLLVMType(instruction.resultType);
      const sourceType = prettyPrintLLVMType(instruction.sourceType);
      return `%${resultVariable} = load ${resultType}, ${sourceType} %${sourceVariable}`;
    }
    case 'LLVMStoreInstruction': {
      const sourceValue = prettyPrintLLVMValue(instruction.sourceValue);
      const targetType = prettyPrintLLVMType(instruction.targetType);
      const sourceType = prettyPrintLLVMType(instruction.sourceType);
      return `store ${sourceType} %${sourceValue}, ${targetType} %${instruction.targetVariable}`;
    }
    case 'LLVMPhiInstruction': {
      const v1 = prettyPrintLLVMValue(instruction.v1);
      const v2 = prettyPrintLLVMValue(instruction.v2);
      const type = prettyPrintLLVMType(instruction.variableType);
      return `phi ${type} [ %${v1}, %${instruction.b1} ], [ %${v2}, %${instruction.b2} ]`;
    }
    case 'LLVMFunctionCallInstruction': {
      const assignedTo =
        instruction.resultVariable != null ? `%${instruction.resultVariable} = ` : '';
      const resultType = prettyPrintLLVMType(instruction.resultType);
      const functionName = prettyPrintLLVMValue(instruction.functionName);
      const functionArguments = instruction.functionArguments
        .map(({ value, type }) => `${prettyPrintLLVMType(type)} ${prettyPrintLLVMValue(value)}`)
        .join(', ');
      return `${assignedTo}call ${resultType} ${functionName}(${functionArguments}) nounwind`;
    }
    case 'LLVMBranchInstruction': {
      const { condition, b1, b2 } = instruction;
      return `br i1 ${prettyPrintLLVMValue(condition)}, label %${b1}, label %${b2}`;
    }
    case 'LLVMReturnInstruction': {
      if (instruction.value == null) return 'ret void';
      const { value, type } = instruction.value;
      return `ret ${prettyPrintLLVMType(type)} ${prettyPrintLLVMValue(value)}`;
    }
  }
};
