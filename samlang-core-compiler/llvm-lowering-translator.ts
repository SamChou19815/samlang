import lowerHighIRTypeToLLVMType from './llvm-types-lowering';
import MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type {
  HighIRExpression,
  HighIRStatement,
  HighIRIndexAccessStatement,
  HighIRIfElseStatement,
  HighIRSwitchStatement,
  HighIRLetDefinitionStatement,
  HighIRStructInitializationStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  isTheSameLLVMType,
  LLVMAnnotatedValue,
  LLVMInstruction,
  LLVMFunction,
  LLVM_STRING_TYPE,
  LLVM_INT,
  LLVM_NAME,
  LLVM_VARIABLE,
  LLVM_CAST,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_STORE,
  LLVM_PHI,
  LLVM_CALL,
  LLVM_LABEL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_SWITCH,
  LLVM_RETURN,
  LLVM_INT_TYPE,
  LLVMValue,
  LLVMModule,
} from 'samlang-core-ast/llvm-nodes';
import { checkNotNull, LocalStackedContext } from 'samlang-core-utils';

export class LLVMConstantPropagationContext extends LocalStackedContext<LLVMValue> {
  addLocalValueType(name: string, value: LLVMValue, onCollision: () => void): void {
    if (value.__type__ !== 'LLVMVariable') {
      super.addLocalValueType(name, value, onCollision);
      return;
    }
    super.addLocalValueType(name, this.getLocalValueType(value.name) ?? value, onCollision);
  }

  bind(name: string, value: LLVMValue): void {
    // istanbul ignore next
    this.addLocalValueType(name, value, () => {});
  }
}

class LLVMLoweringManager {
  readonly llvmInstructionCollector: LLVMInstruction[] = [];
  private readonly allocator = new MidIRResourceAllocator();
  private readonly llvmConstantPropagationContext = new LLVMConstantPropagationContext();
  private readonly functionStartLabel: string;

  constructor(
    private readonly functionName: string,
    private readonly globalVariables: Readonly<Record<string, number>>
  ) {
    this.functionStartLabel = this.allocator.allocateLabelWithAnnotation(functionName, 'START');
    this.llvmInstructionCollector.push(LLVM_LABEL(this.functionStartLabel));
  }

  lowerHighIRStatement(s: HighIRStatement): void {
    switch (s.__type__) {
      case 'HighIRIndexAccessStatement':
        this.lowerHighIRIndexAccessStatement(s);
        return;
      case 'HighIRBinaryStatement':
        this.llvmInstructionCollector.push(
          LLVM_BINARY({
            resultVariable: s.name,
            operator: s.operator,
            v1: this.lowerHighIRExpression(s.e1).value,
            v2: this.lowerHighIRExpression(s.e2).value,
          })
        );
        return;
      case 'HighIRFunctionCallStatement':
        // TODO: handle potential type cast due to type erasure
        this.llvmInstructionCollector.push(
          LLVM_CALL({
            resultType: lowerHighIRTypeToLLVMType(s.returnCollector?.type ?? HIR_INT_TYPE),
            resultVariable: s.returnCollector?.name,
            functionName: this.lowerHighIRExpression(s.functionExpression).value,
            functionArguments: s.functionArguments.map((it) => this.lowerHighIRExpression(it)),
          })
        );
        return;
      case 'HighIRIfElseStatement':
        this.lowerNormalHighIRIfElseStatement(s);
        return;
      case 'HighIRSwitchStatement':
        this.lowerHighIRSwitchStatement(s);
        return;
      case 'HighIRLetDefinitionStatement':
        this.lowerHighIRLetDefinitionStatement(s);
        return;
      case 'HighIRStructInitializationStatement':
        this.lowerHighIRStructInitializationStatement(s);
        return;
      case 'HighIRReturnStatement': {
        const { value, type } = this.lowerHighIRExpression(s.expression);
        this.llvmInstructionCollector.push(LLVM_RETURN(value, type));
        // eslint-disable-next-line no-useless-return
        return;
      }
    }
  }

  private lowerHighIRIndexAccessStatement(s: HighIRIndexAccessStatement): void {
    const { value: loweredPointerValue, type: loweredPointerType } = this.lowerHighIRExpression(
      s.pointerExpression
    );
    const pointerTemp = this.allocator.allocateTemp('index_pointer_temp');
    const valueType = lowerHighIRTypeToLLVMType(s.type);
    this.llvmInstructionCollector.push(
      LLVM_GET_ELEMENT_PTR({
        resultVariable: pointerTemp,
        resultType: valueType,
        sourcePointerType: loweredPointerType,
        sourceValue: loweredPointerValue,
        offset: s.index,
      }),
      LLVM_LOAD({ resultVariable: s.name, sourceVariable: pointerTemp, valueType })
    );
  }

  private lowerNormalHighIRIfElseStatement(s: HighIRIfElseStatement): void {
    const { booleanExpression, s1, s2, finalAssignment } = s;
    const loweredCondition = this.lowerHighIRExpression(booleanExpression).value;
    const trueLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      'if_else_true_label'
    );
    const falseLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      'if_else_false_label'
    );
    const endLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      'if_else_end_label'
    );

    this.llvmInstructionCollector.push(
      LLVM_CJUMP(loweredCondition, trueLabel, falseLabel),
      LLVM_LABEL(trueLabel)
    );
    if (finalAssignment != null) {
      const v1 = this.llvmConstantPropagationContext.withNestedScope(() => {
        s1.forEach((it) => this.lowerHighIRStatement(it));
        return this.lowerHighIRExpression(finalAssignment.branch1Value).value;
      });
      this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
      const v2 = this.llvmConstantPropagationContext.withNestedScope(() => {
        s2.forEach((it) => this.lowerHighIRStatement(it));
        return this.lowerHighIRExpression(finalAssignment.branch2Value).value;
      });
      this.llvmInstructionCollector.push(LLVM_LABEL(endLabel));
      this.llvmInstructionCollector.push(
        LLVM_PHI({
          name: finalAssignment.name,
          variableType: lowerHighIRTypeToLLVMType(finalAssignment.type),
          valueBranchTuples: [
            { value: v1, branch: trueLabel },
            { value: v2, branch: falseLabel },
          ],
        })
      );
    } else {
      this.llvmConstantPropagationContext.withNestedScope(() =>
        s1.forEach((it) => this.lowerHighIRStatement(it))
      );
      this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
      this.llvmConstantPropagationContext.withNestedScope(() =>
        s2.forEach((it) => this.lowerHighIRStatement(it))
      );
      this.llvmInstructionCollector.push(LLVM_LABEL(endLabel));
    }
  }

  private lowerHighIRSwitchStatement(s: HighIRSwitchStatement): void {
    const finalEndLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      `match_end`
    );
    const caseWithLabels = s.cases.map((it, i) => ({
      ...it,
      label: this.allocator.allocateLabelWithAnnotation(this.functionName, `match_case_${i}`),
    }));

    this.llvmInstructionCollector.push(
      LLVM_SWITCH(
        LLVM_VARIABLE(s.caseVariable),
        finalEndLabel,
        caseWithLabels.map((it) => ({ value: it.caseNumber, branch: it.label }))
      )
    );

    if (s.finalAssignment == null) {
      caseWithLabels.forEach(({ label, statements }) => {
        this.llvmConstantPropagationContext.withNestedScope(() => {
          this.llvmInstructionCollector.push(LLVM_LABEL(label));
          statements.forEach((it) => this.lowerHighIRStatement(it));
          this.llvmInstructionCollector.push(LLVM_JUMP(finalEndLabel));
        });
      });
      this.llvmInstructionCollector.push(LLVM_LABEL(finalEndLabel));
      return;
    }
    const { name: phiVariable, type: phiType, branchValues } = s.finalAssignment;
    const values: LLVMValue[] = [];
    caseWithLabels.forEach(({ label, statements }, i) => {
      this.llvmConstantPropagationContext.withNestedScope(() => {
        this.llvmInstructionCollector.push(LLVM_LABEL(label));
        statements.forEach((it) => this.lowerHighIRStatement(it));
        const branchValue = this.lowerHighIRExpression(checkNotNull(branchValues[i])).value;
        values.push(branchValue);
        this.llvmInstructionCollector.push(LLVM_JUMP(finalEndLabel));
      });
    });
    this.llvmInstructionCollector.push(
      LLVM_LABEL(finalEndLabel),
      LLVM_PHI({
        name: phiVariable,
        variableType: lowerHighIRTypeToLLVMType(phiType),
        valueBranchTuples: caseWithLabels.map(({ label }, i) => ({
          value: checkNotNull(values[i]),
          branch: label,
        })),
      })
    );
  }

  private lowerHighIRLetDefinitionStatement(s: HighIRLetDefinitionStatement): void {
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
  }

  private lowerHighIRStructInitializationStatement(s: HighIRStructInitializationStatement): void {
    const rawPointerTemp = this.allocator.allocateTemp('struct_pointer_raw');
    const structType = lowerHighIRTypeToLLVMType(s.type);
    this.llvmInstructionCollector.push(
      LLVM_CALL({
        resultVariable: rawPointerTemp,
        resultType: LLVM_STRING_TYPE(),
        functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_MALLOC),
        functionArguments: [{ value: LLVM_INT(s.expressionList.length * 8), type: LLVM_INT_TYPE }],
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
      // istanbul ignore next
      if (structType.__type__ === 'StructType') {
        const expectedValueType = checkNotNull(structType.mappings[i]);
        if (!isTheSameLLVMType(expectedValueType, type)) {
          const castedValueTemp = this.allocator.allocateTemp(`struct_value_casted_${i}`);
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
      const storePointerTemp = this.allocator.allocateTemp(`struct_value_pointer_${i}`);
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
        const castedTempName = this.allocator.allocateTemp('string_name_cast');
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
    }
  }
}

export const lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING = (
  { name, type: { argumentTypes, returnType }, parameters, body }: HighIRFunction,
  /** Mapping between global variable name and their length */
  globalVariables: Readonly<Record<string, number>>
): LLVMFunction => {
  const annotatedParameters = parameters.map((parameterName, i) => ({
    parameterName,
    parameterType: lowerHighIRTypeToLLVMType(checkNotNull(argumentTypes[i])),
  }));
  const manager = new LLVMLoweringManager(name, globalVariables);
  body.forEach((it) => manager.lowerHighIRStatement(it));
  return {
    name,
    parameters: annotatedParameters,
    returnType: lowerHighIRTypeToLLVMType(returnType),
    body: manager.llvmInstructionCollector,
  };
};

const lowerHighIRModuleToLLVMModule = (highIRModule: HighIRModule): LLVMModule => {
  const globalVariablesMapping = Object.fromEntries(
    highIRModule.globalVariables.map((it) => [it.name, it.content.length])
  );

  return {
    globalVariables: highIRModule.globalVariables,
    typeDefinitions: highIRModule.typeDefinitions.map((it) => ({
      identifier: it.identifier,
      mappings: it.mappings.map(lowerHighIRTypeToLLVMType),
    })),
    functions: highIRModule.functions.map((it) =>
      lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING(it, globalVariablesMapping)
    ),
  };
};

export default lowerHighIRModuleToLLVMModule;
