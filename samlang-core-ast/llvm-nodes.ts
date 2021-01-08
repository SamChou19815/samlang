import type { GlobalVariable } from './common-nodes';
import type { IROperator } from './common-operators';
import type { HighIRIdentifierType } from './hir-types';

import { checkNotNull, Long } from 'samlang-core-utils';

export type LLVMPrimitiveType = { readonly __type__: 'PrimitiveType'; readonly type: 'i1' | 'i64' };
export type LLVMStringType = { readonly __type__: 'StringType'; readonly length?: number };
export type LLVMIdentifierType = HighIRIdentifierType;

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
  | LLVMStringType
  | LLVMStructType
  | LLVMFunctionType;

export const LLVM_BOOL_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i1' };
export const LLVM_INT_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i64' };

export const LLVM_STRING_TYPE = (length?: number): LLVMStringType => ({
  __type__: 'StringType',
  length,
});

export const LLVM_IDENTIFIER_TYPE = (name: string): LLVMIdentifierType => ({
  __type__: 'IdentifierType',
  name,
});

export const LLVM_STRUCT_TYPE = (mappings: readonly LLVMType[]): LLVMStructType => ({
  __type__: 'StructType',
  mappings,
});

export const LLVM_FUNCTION_TYPE = (
  argumentTypes: readonly LLVMType[],
  returnType: LLVMType
): LLVMFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export const isTheSameLLVMType = (t1: LLVMType, t2: LLVMType): boolean => {
  switch (t1.__type__) {
    case 'PrimitiveType':
      return t2.__type__ === 'PrimitiveType' && t1.type === t2.type;
    case 'StringType':
      return t2.__type__ === 'StringType' && t1.length === t2.length;
    case 'IdentifierType':
      return t2.__type__ === 'IdentifierType' && t1.name === t2.name;
    case 'StructType':
      return (
        t2.__type__ === 'StructType' &&
        t1.mappings.length === t2.mappings.length &&
        t1.mappings.every((t1Element, index) =>
          isTheSameLLVMType(t1Element, checkNotNull(t2.mappings[index]))
        )
      );
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameLLVMType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        t1.argumentTypes.every((t1Argument, index) =>
          isTheSameLLVMType(t1Argument, checkNotNull(t2.argumentTypes[index]))
        )
      );
  }
};

export const prettyPrintLLVMType = (type: LLVMType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'StringType':
      return type.length == null ? 'i64*' : `[${type.length} x i64]*`;
    case 'IdentifierType':
      return `%${type.name}*`;
    case 'StructType':
      return `{ ${type.mappings.map(prettyPrintLLVMType).join(', ')} }*`;
    case 'FunctionType':
      return `${prettyPrintLLVMType(type.returnType)} (${type.argumentTypes
        .map(prettyPrintLLVMType)
        .join(', ')})*`;
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

export type LLVMCastInstruction = {
  readonly __type__: 'LLVMCastInstruction';
  readonly targetVariable: string;
  readonly targetType: LLVMType;
  readonly sourceValue: LLVMValue;
  readonly sourceType: LLVMType;
};

export type LLVMGetElementPointerInstruction = {
  readonly __type__: 'LLVMGetElementPointerInstruction';
  readonly resultVariable: string;
  readonly resultType: LLVMType;
  readonly sourceValue: LLVMValue;
  readonly sourcePointerType: LLVMType;
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
  readonly sourceVariable: string;
  readonly valueType: LLVMType;
};

export type LLVMStoreInstruction = {
  readonly __type__: 'LLVMStoreInstruction';
  readonly targetVariable: string;
  readonly sourceValue: LLVMValue;
  readonly valueType: LLVMType;
};

export type LLVMPhiInstruction = {
  readonly __type__: 'LLVMPhiInstruction';
  readonly variableType: LLVMType;
  readonly valueBranchTuples: readonly { readonly value: LLVMValue; readonly branch: string }[];
};

export type LLVMFunctionCallInstruction = {
  readonly __type__: 'LLVMFunctionCallInstruction';
  readonly resultType: LLVMType;
  readonly resultVariable?: string;
  readonly functionName: LLVMValue;
  readonly functionArguments: readonly LLVMAnnotatedValue[];
};

export type LLVMLabelInstruction = {
  readonly __type__: 'LLVMLabelInstruction';
  readonly name: string;
};

export type LLVMJumpInstruction = {
  readonly __type__: 'LLVMJumpInstruction';
  readonly branch: string;
};

export type LLVMConditionalJumpInstruction = {
  readonly __type__: 'LLVMConditionalJumpInstruction';
  readonly condition: LLVMValue;
  readonly b1: string;
  readonly b2: string;
};

export type LLVMReturnInstruction = {
  readonly __type__: 'LLVMReturnInstruction';
} & LLVMAnnotatedValue;

export type LLVMInstruction =
  | LLVMCastInstruction
  | LLVMGetElementPointerInstruction
  | LLVMBinaryInstruction
  | LLVMLoadInstruction
  | LLVMStoreInstruction
  | LLVMPhiInstruction
  | LLVMFunctionCallInstruction
  | LLVMLabelInstruction
  | LLVMJumpInstruction
  | LLVMConditionalJumpInstruction
  | LLVMReturnInstruction;

type ConstructorArgumentObject<E extends LLVMInstruction> = Omit<E, '__type__'>;

export const LLVM_CAST = ({
  targetVariable,
  targetType,
  sourceValue,
  sourceType,
}: ConstructorArgumentObject<LLVMCastInstruction>): LLVMCastInstruction => ({
  __type__: 'LLVMCastInstruction',
  targetVariable,
  targetType,
  sourceValue,
  sourceType,
});

export const LLVM_GET_ELEMENT_PTR = ({
  resultVariable,
  resultType,
  sourceValue,
  sourcePointerType,
  offset,
}: ConstructorArgumentObject<LLVMGetElementPointerInstruction>): LLVMGetElementPointerInstruction => ({
  __type__: 'LLVMGetElementPointerInstruction',
  resultVariable,
  resultType,
  sourceValue,
  sourcePointerType,
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
  sourceVariable,
  valueType,
}: ConstructorArgumentObject<LLVMLoadInstruction>): LLVMLoadInstruction => ({
  __type__: 'LLVMLoadInstruction',
  resultVariable,
  sourceVariable,
  valueType,
});

export const LLVM_STORE = ({
  targetVariable,
  sourceValue,
  valueType,
}: ConstructorArgumentObject<LLVMStoreInstruction>): LLVMStoreInstruction => ({
  __type__: 'LLVMStoreInstruction',
  targetVariable,
  sourceValue,
  valueType,
});

export const LLVM_PHI = ({
  variableType,
  valueBranchTuples,
}: ConstructorArgumentObject<LLVMPhiInstruction>): LLVMPhiInstruction => ({
  __type__: 'LLVMPhiInstruction',
  variableType,
  valueBranchTuples,
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

export const LLVM_LABEL = (name: string): LLVMLabelInstruction => ({
  __type__: 'LLVMLabelInstruction',
  name,
});

export const LLVM_JUMP = (branch: string): LLVMJumpInstruction => ({
  __type__: 'LLVMJumpInstruction',
  branch,
});

export const LLVM_CJUMP = (
  condition: LLVMValue,
  b1: string,
  b2: string
): LLVMConditionalJumpInstruction => ({
  __type__: 'LLVMConditionalJumpInstruction',
  condition,
  b1,
  b2,
});

export const LLVM_RETURN = (value: LLVMValue, type: LLVMType): LLVMReturnInstruction => ({
  __type__: 'LLVMReturnInstruction',
  value,
  type,
});

export const prettyPrintLLVMInstruction = (instruction: LLVMInstruction): string => {
  switch (instruction.__type__) {
    case 'LLVMCastInstruction': {
      const sourceValue = prettyPrintLLVMValue(instruction.sourceValue);
      const targetType = prettyPrintLLVMType(instruction.targetType);
      const sourceType = prettyPrintLLVMType(instruction.sourceType);
      if (targetType === sourceType) throw new Error();
      let command: string;
      if (
        instruction.targetType.__type__ !== 'PrimitiveType' &&
        instruction.sourceType.__type__ !== 'PrimitiveType'
      ) {
        command = 'bitcast';
      } else if (
        instruction.targetType.__type__ === 'PrimitiveType' &&
        instruction.sourceType.__type__ === 'PrimitiveType'
      ) {
        throw new Error('Should not cast between primitive types!');
      } else if (instruction.targetType.__type__ === 'PrimitiveType') {
        command = 'ptrtoint';
      } else {
        command = 'inttoptr';
      }
      return `%${instruction.targetVariable} = ${command} ${sourceType} ${sourceValue} to ${targetType}`;
    }
    case 'LLVMGetElementPointerInstruction': {
      const { resultVariable, offset } = instruction;
      const value = prettyPrintLLVMValue(instruction.sourceValue);
      const resultType = prettyPrintLLVMType(instruction.resultType);
      const sourceType = prettyPrintLLVMType(instruction.sourcePointerType);
      return `%${resultVariable} = getelementptr ${resultType}*, ${sourceType} ${value}, i64 ${offset}`;
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
      const type = prettyPrintLLVMType(instruction.valueType);
      return `%${resultVariable} = load ${type}, ${type}* %${sourceVariable}`;
    }
    case 'LLVMStoreInstruction': {
      const sourceValue = prettyPrintLLVMValue(instruction.sourceValue);
      const type = prettyPrintLLVMType(instruction.valueType);
      return `store ${type} ${sourceValue}, ${type}* %${instruction.targetVariable}`;
    }
    case 'LLVMPhiInstruction': {
      const valueBranchTuplesString = instruction.valueBranchTuples
        .map(({ value, branch }) => `[ ${prettyPrintLLVMValue(value)}, %${branch} ]`)
        .join(', ');
      return `phi ${prettyPrintLLVMType(instruction.variableType)} ${valueBranchTuplesString}`;
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
    case 'LLVMLabelInstruction':
      return `${instruction.name}:`;
    case 'LLVMJumpInstruction':
      return `br label %${instruction.branch}`;
    case 'LLVMConditionalJumpInstruction': {
      const { condition, b1, b2 } = instruction;
      return `br i1 ${prettyPrintLLVMValue(condition)}, label %${b1}, label %${b2}`;
    }
    case 'LLVMReturnInstruction': {
      const { value, type } = instruction;
      return `ret ${prettyPrintLLVMType(type)} ${prettyPrintLLVMValue(value)}`;
    }
  }
};

export interface LLVMTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly LLVMType[];
}

export interface LLVMFunction {
  readonly name: string;
  readonly parameters: readonly {
    readonly parameterName: string;
    readonly parameterType: LLVMType;
  }[];
  readonly returnType: LLVMType;
  readonly body: readonly LLVMInstruction[];
}

export const prettyPrintLLVMFunction = ({
  name,
  parameters,
  returnType,
  body,
}: LLVMFunction): string => {
  const returnTypeString = prettyPrintLLVMType(returnType);
  const parametersString = parameters
    .map(
      ({ parameterName, parameterType }) =>
        `${prettyPrintLLVMType(parameterType)} %${parameterName}`
    )
    .join(', ');
  return `define ${returnTypeString} @${name}(${parametersString}) local_unnamed_addr nounwind {
${body
  .map((instruction) =>
    instruction.__type__ === 'LLVMLabelInstruction'
      ? prettyPrintLLVMInstruction(instruction)
      : `  ${prettyPrintLLVMInstruction(instruction)}`
  )
  .join('\n')}
}`;
};

export interface LLVMModule {
  readonly globalVariables: readonly GlobalVariable[];
  readonly typeDefinitions: readonly LLVMTypeDefinition[];
  readonly functions: readonly LLVMFunction[];
}

export const prettyPrintLLVMModule = ({
  globalVariables,
  typeDefinitions,
  functions,
}: LLVMModule): string => {
  return [
    `declare i64* @_builtin_malloc(i64) nounwind
declare void @_builtin_println(i64*) nounwind
declare void @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind
`,
    ...globalVariables.map(({ name, content }) => {
      const size = content.length;
      const ints = Array.from(content)
        .map((it) => `i64 ${it.charCodeAt(0)}`)
        .join(', ');
      return `@${name} = private unnamed_addr constant [${size} x i64] [i64 ${size}, ${ints}], align 8`;
    }),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `%${identifier} = { ${mappings.map(prettyPrintLLVMType).join(', ')} }`
    ),
    ...functions.map(prettyPrintLLVMFunction),
  ].join('\n');
};
