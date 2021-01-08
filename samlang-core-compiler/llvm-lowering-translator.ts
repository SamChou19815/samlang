import lowerHighIRTypeToLLVMType from './llvm-types-lowering';
import type MidIRResourceAllocator from './mir-resource-allocator';

import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  LLVMAnnotatedValue,
  LLVMInstruction,
  LLVM_STRING_TYPE,
  LLVM_INT,
  LLVM_NAME,
  LLVM_VARIABLE,
  LLVM_BITCAST,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_CALL,
  LLVM_RETURN,
} from 'samlang-core-ast/llvm-nodes';

export default class LLVMLoweringManager {
  private readonly llvmInstructionCollector: LLVMInstruction[] = [];

  constructor(
    private readonly allocator: MidIRResourceAllocator,
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
        break;
      }
      case 'HighIRWhileTrueStatement': {
        break;
      }
      case 'HighIRLetDefinitionStatement': {
        break;
      }
      case 'HighIRStructInitializationStatement': {
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
          LLVM_BITCAST({
            targetVariable: castedTempName,
            targetType: LLVM_STRING_TYPE(),
            sourceValue: LLVM_NAME(e.name),
            sourceType: LLVM_STRING_TYPE(length),
          })
        );
        return { value: LLVM_VARIABLE(castedTempName), type: lowerHighIRTypeToLLVMType(e.type) };
      }
      case 'HighIRVariableExpression':
        return { value: LLVM_VARIABLE(e.name), type: lowerHighIRTypeToLLVMType(e.type) };
      case 'HighIRIndexAccessExpression': {
        const loweredPointerAnnotatedValue = this.lowerHighIRExpression(e.expression);
        const {
          value: loweredPointerValue,
          type: loweredPointerType,
        } = loweredPointerAnnotatedValue;
        const pointerTemp = this.allocator.allocateTemp('pointer-temp');
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
