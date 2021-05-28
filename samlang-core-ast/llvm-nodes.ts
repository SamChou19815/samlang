import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_THROW,
} from './common-names';
import type { GlobalVariable } from './common-nodes';
import type { IROperator } from './common-operators';
import type { HighIRIdentifierType } from './hir-types';

import { assert, zip } from 'samlang-core-utils';

export type LLVMPrimitiveType = { readonly __type__: 'PrimitiveType'; readonly type: 'i1' | 'i32' };
export type LLVMStringType = { readonly __type__: 'StringType'; readonly length?: number };
export type LLVMIdentifierType = HighIRIdentifierType;

export type LLVMFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly LLVMType[];
  readonly returnType: LLVMType;
};

export type LLVMType = LLVMPrimitiveType | LLVMIdentifierType | LLVMStringType | LLVMFunctionType;

export const LLVM_BOOL_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i1' };
export const LLVM_INT_TYPE: LLVMPrimitiveType = { __type__: 'PrimitiveType', type: 'i32' };

export const LLVM_STRING_TYPE = (length?: number): LLVMStringType => ({
  __type__: 'StringType',
  length,
});

export const LLVM_IDENTIFIER_TYPE = (name: string): LLVMIdentifierType => ({
  __type__: 'IdentifierType',
  name,
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
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameLLVMType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        zip(t1.argumentTypes, t2.argumentTypes).every(([t1Element, t2Element]) =>
          isTheSameLLVMType(t1Element, t2Element)
        )
      );
  }
};

export const prettyPrintLLVMType = (type: LLVMType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'StringType':
      return type.length == null ? 'i32*' : `[${type.length} x i32]*`;
    case 'IdentifierType':
      return `%${type.name}*`;
    case 'FunctionType':
      return `${prettyPrintLLVMType(type.returnType)} (${type.argumentTypes
        .map(prettyPrintLLVMType)
        .join(', ')})*`;
  }
};

export type LLVMLiteral = { readonly __type__: 'LLVMLiteral'; readonly value: number };
export type LLVMVariable = { readonly __type__: 'LLVMVariable'; readonly name: string };
export type LLVMName = { readonly __type__: 'LLVMName'; readonly name: string };
export type LLVMValue = LLVMLiteral | LLVMVariable | LLVMName;

export const LLVM_INT = (value: number): LLVMLiteral => ({
  __type__: 'LLVMLiteral',
  value,
});

export const LLVM_VARIABLE = (name: string): LLVMVariable => ({ __type__: 'LLVMVariable', name });
export const LLVM_NAME = (name: string): LLVMName => ({ __type__: 'LLVMName', name });

export const prettyPrintLLVMValue = (value: LLVMValue, type: LLVMType): string => {
  switch (value.__type__) {
    case 'LLVMLiteral':
      if (value.value === 0 && type.__type__ !== 'PrimitiveType') return 'null';
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
  readonly resultVariable: string;
  readonly resultType: LLVMType;
  readonly sourceValue: LLVMValue;
  readonly sourceType: LLVMType;
};

export type LLVMGetElementPointerInstruction = {
  readonly __type__: 'LLVMGetElementPointerInstruction';
  readonly resultVariable: string;
  readonly sourceValue: LLVMValue;
  readonly sourcePointerType: LLVMType;
  readonly offset: number;
};

export type LLVMBinaryInstruction = {
  readonly __type__: 'LLVMBinaryInstruction';
  readonly resultVariable: string;
  readonly operator: IROperator;
  readonly operandType: LLVMType;
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
  readonly resultVariable: string;
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
  resultVariable,
  resultType,
  sourceValue,
  sourceType,
}: ConstructorArgumentObject<LLVMCastInstruction>): LLVMCastInstruction => ({
  __type__: 'LLVMCastInstruction',
  resultVariable,
  resultType,
  sourceValue,
  sourceType,
});

export const LLVM_GET_ELEMENT_PTR = ({
  resultVariable,
  sourceValue,
  sourcePointerType,
  offset,
}: ConstructorArgumentObject<LLVMGetElementPointerInstruction>): LLVMGetElementPointerInstruction => ({
  __type__: 'LLVMGetElementPointerInstruction',
  resultVariable,
  sourceValue,
  sourcePointerType,
  offset,
});

export const LLVM_BINARY = ({
  resultVariable,
  operator,
  operandType,
  v1,
  v2,
}: ConstructorArgumentObject<LLVMBinaryInstruction>): LLVMBinaryInstruction => ({
  __type__: 'LLVMBinaryInstruction',
  resultVariable,
  operator,
  operandType,
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
  resultVariable,
  variableType,
  valueBranchTuples,
}: ConstructorArgumentObject<LLVMPhiInstruction>): LLVMPhiInstruction => ({
  __type__: 'LLVMPhiInstruction',
  resultVariable,
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
      const sourceValue = prettyPrintLLVMValue(instruction.sourceValue, instruction.sourceType);
      const targetType = prettyPrintLLVMType(instruction.resultType);
      const sourceType = prettyPrintLLVMType(instruction.sourceType);
      assert(targetType !== sourceType);
      let command: string;
      if (
        instruction.resultType.__type__ !== 'PrimitiveType' &&
        instruction.sourceType.__type__ !== 'PrimitiveType'
      ) {
        command = 'bitcast';
      } else if (
        instruction.resultType.__type__ === 'PrimitiveType' &&
        instruction.sourceType.__type__ === 'PrimitiveType'
      ) {
        throw new Error('Should not cast between primitive types!');
      } else if (instruction.resultType.__type__ === 'PrimitiveType') {
        command = 'ptrtoint';
      } else {
        command = 'inttoptr';
      }
      return `%${instruction.resultVariable} = ${command} ${sourceType} ${sourceValue} to ${targetType}`;
    }
    case 'LLVMGetElementPointerInstruction': {
      const { resultVariable, offset } = instruction;
      const value = prettyPrintLLVMValue(instruction.sourceValue, instruction.sourcePointerType);
      const sourceType = prettyPrintLLVMType(instruction.sourcePointerType);
      const sourceTypeWithoutStar = sourceType.substring(0, sourceType.length - 1);
      return `%${resultVariable} = getelementptr ${sourceTypeWithoutStar}, ${sourceType} ${value}, i32 0, i32 ${offset}`;
    }
    case 'LLVMBinaryInstruction': {
      const result = `%${instruction.resultVariable}`;
      const v1 = prettyPrintLLVMValue(instruction.v1, instruction.operandType);
      const v2 = prettyPrintLLVMValue(instruction.v2, instruction.operandType);
      let operator: string;
      switch (instruction.operator) {
        case '+':
          operator = 'add';
          break;
        case '-':
          operator = 'sub';
          break;
        case '*':
          operator = 'mul';
          break;
        case '/':
          operator = 'sdiv';
          break;
        case '%':
          operator = 'srem';
          break;
        case '^':
          operator = 'xor';
          break;
        case '<':
          operator = 'icmp slt';
          break;
        case '<=':
          operator = 'icmp sle';
          break;
        case '>':
          operator = 'icmp sgt';
          break;
        case '>=':
          operator = 'icmp sge';
          break;
        case '==':
          operator = 'icmp eq';
          break;
        case '!=':
          operator = 'icmp ne';
          break;
      }
      const type = prettyPrintLLVMType(instruction.operandType);
      return `${result} = ${operator} ${type} ${v1}, ${v2}`;
    }
    case 'LLVMLoadInstruction': {
      const { resultVariable, sourceVariable } = instruction;
      const type = prettyPrintLLVMType(instruction.valueType);
      return `%${resultVariable} = load ${type}, ${type}* %${sourceVariable}`;
    }
    case 'LLVMStoreInstruction': {
      const sourceValue = prettyPrintLLVMValue(instruction.sourceValue, instruction.valueType);
      const type = prettyPrintLLVMType(instruction.valueType);
      return `store ${type} ${sourceValue}, ${type}* %${instruction.targetVariable}`;
    }
    case 'LLVMPhiInstruction': {
      const name = instruction.resultVariable;
      const type = prettyPrintLLVMType(instruction.variableType);
      const valueBranchTuplesString = instruction.valueBranchTuples
        .map(
          ({ value, branch }) =>
            `[ ${prettyPrintLLVMValue(value, instruction.variableType)}, %${branch} ]`
        )
        .join(', ');
      return `%${name} = phi ${type} ${valueBranchTuplesString}`;
    }
    case 'LLVMFunctionCallInstruction': {
      const assignedTo =
        instruction.resultVariable != null ? `%${instruction.resultVariable} = ` : '';
      const resultType = prettyPrintLLVMType(instruction.resultType);
      const functionName = prettyPrintLLVMValue(instruction.functionName, LLVM_STRING_TYPE());
      const functionArguments = instruction.functionArguments
        .map(
          ({ value, type }) => `${prettyPrintLLVMType(type)} ${prettyPrintLLVMValue(value, type)}`
        )
        .join(', ');
      return `${assignedTo}call ${resultType} ${functionName}(${functionArguments}) nounwind`;
    }
    case 'LLVMLabelInstruction':
      return `${instruction.name}:`;
    case 'LLVMJumpInstruction':
      return `br label %${instruction.branch}`;
    case 'LLVMConditionalJumpInstruction': {
      const { condition, b1, b2 } = instruction;
      return `br i1 ${prettyPrintLLVMValue(condition, LLVM_BOOL_TYPE)}, label %${b1}, label %${b2}`;
    }
    case 'LLVMReturnInstruction': {
      const { value, type } = instruction;
      return `ret ${prettyPrintLLVMType(type)} ${prettyPrintLLVMValue(value, type)}`;
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
    `declare i32* @${ENCODED_FUNCTION_NAME_MALLOC}(i32) nounwind
declare i32 @${ENCODED_FUNCTION_NAME_PRINTLN}(i32*) nounwind
declare i32* @${ENCODED_FUNCTION_NAME_THROW}(i32*) nounwind
declare i32* @${ENCODED_FUNCTION_NAME_INT_TO_STRING}(i32) nounwind
declare i32 @${ENCODED_FUNCTION_NAME_STRING_TO_INT}(i32*) nounwind
declare i32* @${ENCODED_FUNCTION_NAME_STRING_CONCAT}(i32*, i32*) nounwind
`,
    ...globalVariables.flatMap(({ name, content }) => {
      const size = content.length;
      const structLength = size + 1;
      const ints = Array.from(content)
        .map((it) => `i32 ${it.charCodeAt(0)}`)
        .join(', ');
      return [
        `; @${name} = '${content}'`,
        size === 0
          ? `@${name} = private unnamed_addr constant [${structLength} x i32] [i32 ${size}], align 8`
          : `@${name} = private unnamed_addr constant [${structLength} x i32] [i32 ${size}, ${ints}], align 8`,
      ];
    }),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `%${identifier} = type { ${mappings.map(prettyPrintLLVMType).join(', ')} }`
    ),
    ...functions.map(prettyPrintLLVMFunction),
  ].join('\n');
};
