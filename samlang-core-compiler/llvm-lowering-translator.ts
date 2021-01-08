import type LLVMConstantPropagationContext from './llvm-constant-propagation-context';
import lowerHighIRTypeToLLVMType from './llvm-types-lowering';
import type MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  LLVMAnnotatedValue,
  LLVMInstruction,
  LLVM_STRING_TYPE,
  LLVM_INT,
  LLVM_NAME,
  LLVM_VARIABLE,
  LLVM_CAST,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_STORE,
  LLVM_CALL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_RETURN,
  LLVM_INT_TYPE,
  isTheSameLLVMType,
  LLVM_LABEL,
} from 'samlang-core-ast/llvm-nodes';
import { checkNotNull } from 'samlang-core-utils';

export default class LLVMLoweringManager {
  private readonly llvmInstructionCollector: LLVMInstruction[] = [];

  constructor(
    private readonly functionName: string,
    private readonly allocator: MidIRResourceAllocator,
    private readonly llvmConstantPropagationContext: LLVMConstantPropagationContext,
    /** Mapping between global variable name and their length */
    private readonly globalVariables: Readonly<Record<string, number>>
  ) {}

  private lowerHighIRStatement(s: HighIRStatement): void {
    switch (s.__type__) {
      case 'HighIRFunctionCallStatement': {
        const functionName = this.lowerHighIRExpression(s.functionExpression).value;
        const functionArguments = s.functionArguments.map((it) => this.lowerHighIRExpression(it));
        this.llvmInstructionCollector.push(
          LLVM_CALL({
            resultType: lowerHighIRTypeToLLVMType(s.returnCollector?.type ?? HIR_INT_TYPE),
            resultVariable: s.returnCollector?.name,
            functionName,
            functionArguments,
          })
        );
        break;
      }
      case 'HighIRIfElseStatement': {
        const loweredCondition = this.lowerHighIRExpression(s.booleanExpression).value;
        const trueLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'if-else-true-label'
        );
        const falseLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'if-else-false-label'
        );
        const endLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'if-else-end-label'
        );
        this.llvmInstructionCollector.push(
          LLVM_CJUMP(loweredCondition, trueLabel, falseLabel),
          LLVM_LABEL(trueLabel)
        );
        this.llvmConstantPropagationContext.withNestedScope(() => {
          s.s1.forEach((it) => this.lowerHighIRStatement(it));
        });
        this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
        this.llvmConstantPropagationContext.withNestedScope(() => {
          s.s2.forEach((it) => this.lowerHighIRStatement(it));
        });
        this.llvmInstructionCollector.push(LLVM_LABEL(endLabel));
        // TODO: handle phi variables!
        break;
      }
      case 'HighIRWhileTrueStatement': {
        const startLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'while-true-start'
        );
        this.llvmInstructionCollector.push(LLVM_LABEL(startLabel));
        // TODO: handle phi variables!
        this.llvmConstantPropagationContext.withNestedScope(() => {
          s.statements.forEach((it) => this.lowerHighIRStatement(it));
        });
        this.llvmInstructionCollector.push(LLVM_JUMP(startLabel));
        break;
      }
      case 'HighIRLetDefinitionStatement': {
        const { value: sourceValue, type: actualType } = this.lowerHighIRExpression(
          s.assignedExpression
        );
        const expectedType = lowerHighIRTypeToLLVMType(s.type);
        if (isTheSameLLVMType(expectedType, actualType)) {
          this.llvmConstantPropagationContext.bind(s.name, sourceValue);
        } else {
          this.llvmInstructionCollector.push(
            LLVM_CAST({
              targetVariable: s.name,
              targetType: expectedType,
              sourceValue,
              sourceType: actualType,
            })
          );
        }
        // TODO: handle phi variables!
        break;
      }
      case 'HighIRStructInitializationStatement': {
        const rawPointerTemp = this.allocator.allocateTemp('struct-pointer-raw');
        const structType = lowerHighIRTypeToLLVMType(s.type);
        this.llvmInstructionCollector.push(
          LLVM_CALL({
            resultVariable: rawPointerTemp,
            resultType: LLVM_STRING_TYPE(),
            functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_MALLOC),
            functionArguments: [
              { value: LLVM_INT(s.expressionList.length * 8), type: LLVM_INT_TYPE },
            ],
          }),
          LLVM_CAST({
            targetVariable: s.structVariableName,
            targetType: structType,
            sourceValue: LLVM_VARIABLE(rawPointerTemp),
            sourceType: LLVM_STRING_TYPE(),
          })
        );
        s.expressionList.forEach((e, i) => {
          const { value, type } = this.lowerHighIRExpression(e);
          let valueToStore = value;
          let valueType = type;
          if (structType.__type__ === 'StructType') {
            const expectedValueType = checkNotNull(structType.mappings[i]);
            if (!isTheSameLLVMType(expectedValueType, type)) {
              const castedValueTemp = this.allocator.allocateTemp(`struct-value-casted-${i}`);
              this.llvmInstructionCollector.push(
                LLVM_CAST({
                  targetVariable: castedValueTemp,
                  targetType: expectedValueType,
                  sourceValue: value,
                  sourceType: type,
                })
              );
              valueToStore = LLVM_VARIABLE(castedValueTemp);
              valueType = expectedValueType;
            }
          }
          const storePointerTemp = this.allocator.allocateTemp(`struct-value-pointer-${i}`);
          this.llvmInstructionCollector.push(
            LLVM_GET_ELEMENT_PTR({
              resultVariable: storePointerTemp,
              resultType: valueType,
              sourceValue: LLVM_VARIABLE(s.structVariableName),
              sourcePointerType: structType,
              offset: i,
            }),
            LLVM_STORE({ targetVariable: storePointerTemp, sourceValue: valueToStore, valueType })
          );
        });
        break;
      }
      case 'HighIRReturnStatement': {
        const { value, type } = this.lowerHighIRExpression(s.expression);
        this.llvmInstructionCollector.push(LLVM_RETURN(value, type));
        break;
      }
    }
  }

  private lowerHighIRExpression(e: HighIRExpression): LLVMAnnotatedValue {
    switch (e.__type__) {
      case 'HighIRIntLiteralExpression':
        return { value: LLVM_INT(e.value), type: lowerHighIRTypeToLLVMType(e.type) };
      case 'HighIRNameExpression': {
        const length = this.globalVariables[e.name];
        if (length == null) {
          // must be a function name
          return { value: LLVM_NAME(e.name), type: lowerHighIRTypeToLLVMType(e.type) };
        }
        const castedTempName = this.allocator.allocateTemp('string-name-cast');
        this.llvmInstructionCollector.push(
          LLVM_CAST({
            targetVariable: castedTempName,
            targetType: LLVM_STRING_TYPE(),
            sourceValue: LLVM_NAME(e.name),
            sourceType: LLVM_STRING_TYPE(length),
          })
        );
        return { value: LLVM_VARIABLE(castedTempName), type: lowerHighIRTypeToLLVMType(e.type) };
      }
      case 'HighIRVariableExpression':
        return {
          value:
            this.llvmConstantPropagationContext.getLocalValueType(e.name) ?? LLVM_VARIABLE(e.name),
          type: lowerHighIRTypeToLLVMType(e.type),
        };
      case 'HighIRIndexAccessExpression': {
        const { value: loweredPointerValue, type: loweredPointerType } = this.lowerHighIRExpression(
          e.expression
        );
        const pointerTemp = this.allocator.allocateTemp('index-pointer-temp');
        const valueTemp = this.allocator.allocateTemp('value-temp-loaded');
        const valueType = lowerHighIRTypeToLLVMType(e.type);
        this.llvmInstructionCollector.push(
          LLVM_GET_ELEMENT_PTR({
            resultVariable: pointerTemp,
            resultType: valueType,
            sourcePointerType: loweredPointerType,
            sourceValue: loweredPointerValue,
            offset: e.index,
          }),
          LLVM_LOAD({ resultVariable: valueTemp, sourceVariable: pointerTemp, valueType })
        );
        return { value: LLVM_VARIABLE(valueTemp), type: lowerHighIRTypeToLLVMType(e.type) };
      }
      case 'HighIRBinaryExpression': {
        const v1 = this.lowerHighIRExpression(e.e1).value;
        const v2 = this.lowerHighIRExpression(e.e2).value;
        const binaryTemp = this.allocator.allocateTemp('binary-temp');
        this.llvmInstructionCollector.push(
          LLVM_BINARY({ resultVariable: binaryTemp, operator: e.operator, v1, v2 })
        );
        return { value: LLVM_VARIABLE(binaryTemp), type: lowerHighIRTypeToLLVMType(e.type) };
      }
    }
  }
}
