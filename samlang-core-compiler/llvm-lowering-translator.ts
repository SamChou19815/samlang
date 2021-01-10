import LLVMConstantPropagationContext from './llvm-constant-propagation-context';
import lowerHighIRTypeToLLVMType from './llvm-types-lowering';
import MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type {
  HighIRExpression,
  HighIRStatement,
  HighIRIndexAccessStatement,
  HighIRBinaryStatement,
  HighIRFunctionCallStatement,
  HighIRIfElseStatement,
  HighIRSwitchStatement,
  HighIRLetDefinitionStatement,
  HighIRStructInitializationStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  isTheSameLLVMType,
  LLVMType,
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
import { checkNotNull } from 'samlang-core-utils';

class LLVMLoweringManager {
  readonly llvmInstructionCollector: LLVMInstruction[] = [];
  private readonly allocator = new MidIRResourceAllocator();
  private readonly llvmConstantPropagationContext = new LLVMConstantPropagationContext();
  private readonly phiMoveSet = new Set<string>();
  private readonly functionStartLabel: string;

  constructor(
    private readonly functionName: string,
    private readonly parameters: Readonly<Record<string, LLVMType>>,
    private readonly globalVariables: Readonly<Record<string, number>>
  ) {
    this.functionStartLabel = this.allocator.allocateLabelWithAnnotation(functionName, 'START');
    this.llvmInstructionCollector.push(LLVM_LABEL(this.functionStartLabel));
  }

  private withNestedScope(
    newPhiMoveSet: readonly Readonly<{ target: string; source: string }>[],
    statementLoweringCode: () => void
  ) {
    newPhiMoveSet.forEach(({ target, source }) => this.phiMoveSet.add(`${target} = ${source}`));
    this.llvmConstantPropagationContext.withNestedScope(statementLoweringCode);
    newPhiMoveSet.forEach(({ target, source }) => this.phiMoveSet.delete(`${target} = ${source}`));
  }

  lowerHighIRStatement(s: HighIRStatement): void {
    switch (s.__type__) {
      case 'HighIRIndexAccessStatement':
        this.lowerHighIRIndexAccessStatement(s);
        return;
      case 'HighIRBinaryStatement':
        this.lowerHighIRBinaryStatement(s);
        return;
      case 'HighIRFunctionCallStatement':
        this.lowerHighIRFunctionCallStatement(s);
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

  private lowerHighIRBinaryStatement(s: HighIRBinaryStatement): void {
    this.llvmInstructionCollector.push(
      LLVM_BINARY({
        resultVariable: s.name,
        operator: s.operator,
        v1: this.lowerHighIRExpression(s.e1).value,
        v2: this.lowerHighIRExpression(s.e2).value,
      })
    );
  }

  private lowerHighIRFunctionCallStatement(s: HighIRFunctionCallStatement): void {
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
  }

  private lowerNormalHighIRIfElseStatement(s: HighIRIfElseStatement): void {
    const { multiAssignedVariable, booleanExpression, s1, s2 } = s;
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
    if (multiAssignedVariable != null) {
      let v1: LLVMValue = LLVM_VARIABLE(multiAssignedVariable.branch1Variable);
      let v2: LLVMValue = LLVM_VARIABLE(multiAssignedVariable.branch2Variable);
      this.withNestedScope(
        [{ target: multiAssignedVariable.name, source: multiAssignedVariable.branch1Variable }],
        () => {
          s1.forEach((it) => this.lowerHighIRStatement(it));
          v1 =
            this.llvmConstantPropagationContext.getLocalValueType(
              multiAssignedVariable.branch1Variable
            ) ?? LLVM_VARIABLE(multiAssignedVariable.branch1Variable);
        }
      );
      this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
      this.withNestedScope(
        [{ target: multiAssignedVariable.name, source: multiAssignedVariable.branch2Variable }],
        () => {
          s2.forEach((it) => this.lowerHighIRStatement(it));
          v2 =
            this.llvmConstantPropagationContext.getLocalValueType(
              multiAssignedVariable.branch2Variable
            ) ?? LLVM_VARIABLE(multiAssignedVariable.branch2Variable);
        }
      );
      this.llvmInstructionCollector.push(LLVM_LABEL(endLabel));
      this.llvmInstructionCollector.push(
        LLVM_PHI({
          name: multiAssignedVariable.name,
          variableType: lowerHighIRTypeToLLVMType(multiAssignedVariable.type),
          valueBranchTuples: [
            { value: v1, branch: trueLabel },
            { value: v2, branch: falseLabel },
          ],
        })
      );
    } else {
      this.withNestedScope([], () => s1.forEach((it) => this.lowerHighIRStatement(it)));
      this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
      this.withNestedScope([], () => s2.forEach((it) => this.lowerHighIRStatement(it)));
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

    if (s.multiAssignedVariable == null) {
      caseWithLabels.forEach(({ label, statements }) => {
        this.withNestedScope([], () => {
          this.llvmInstructionCollector.push(LLVM_LABEL(label));
          statements.forEach((it) => this.lowerHighIRStatement(it));
          this.llvmInstructionCollector.push(LLVM_JUMP(finalEndLabel));
        });
      });
      this.llvmInstructionCollector.push(LLVM_LABEL(finalEndLabel));
      return;
    }
    const { name: phiVariable, type: phiType, branchVariables } = s.multiAssignedVariable;
    const values: LLVMValue[] = [];
    caseWithLabels.forEach(({ label, statements }, i) => {
      const branchVariable = checkNotNull(branchVariables[i]);
      this.withNestedScope([{ target: phiVariable, source: branchVariable }], () => {
        this.llvmInstructionCollector.push(LLVM_LABEL(label));
        statements.forEach((it) => this.lowerHighIRStatement(it));
        const assignedValue =
          this.llvmConstantPropagationContext.getLocalValueType(branchVariable) ??
          LLVM_VARIABLE(branchVariable);
        values.push(assignedValue);
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
    if (
      s.assignedExpression.__type__ === 'HighIRVariableExpression' &&
      this.phiMoveSet.has(`${s.name} = ${s.assignedExpression.name}`)
    ) {
      return;
    }
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
  const manager = new LLVMLoweringManager(
    name,
    Object.fromEntries(
      annotatedParameters.map(({ parameterName, parameterType }) => [parameterName, parameterType])
    ),
    globalVariables
  );
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
