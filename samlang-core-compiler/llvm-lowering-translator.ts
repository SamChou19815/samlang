import lowerHighIRTypeToLLVMType from './llvm-types-lowering';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type {
  HighIRExpression,
  HighIRStatement,
  HighIRIndexAccessStatement,
  HighIRIfElseStatement,
  HighIRSwitchStatement,
  HighIRStructInitializationStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
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
import { withoutUnreachableLLVMCode } from 'samlang-core-optimization/simple-optimizations';
import { checkNotNull, zip } from 'samlang-core-utils';

class LLVMResourceAllocator {
  private nextTempId = 0;
  private nextLabelId = 0;

  allocateTemp(purpose: string): string {
    const tempID = this.nextTempId;
    this.nextTempId += 1;
    return `_temp_${tempID}_${purpose}`;
  }

  allocateLabelWithAnnotation(annotation: string): string {
    const temp = this.nextLabelId;
    this.nextLabelId += 1;
    return `l${temp}_${annotation}`;
  }
}

class LLVMLoweringManager {
  readonly llvmInstructionCollector: LLVMInstruction[] = [];
  private readonly allocator = new LLVMResourceAllocator();
  private readonly functionStartLabel: string;
  private currentLabel: string;
  // Keep track of under which label is a variable created.
  private readonly variableSourceMap = new Map<string, string>();

  constructor(
    private readonly globalVariables: Readonly<Record<string, number>>,
    parameters: readonly string[]
  ) {
    this.functionStartLabel = this.allocator.allocateLabelWithAnnotation('start');
    this.currentLabel = this.functionStartLabel;
    this.emitInstruction(LLVM_LABEL(this.functionStartLabel));
    parameters.forEach((it) => this.variableSourceMap.set(it, this.functionStartLabel));
  }

  private emitInstruction(instruction: LLVMInstruction): void {
    this.llvmInstructionCollector.push(instruction);
    if (instruction.__type__ === 'LLVMLabelInstruction') this.currentLabel = instruction.name;
  }

  lowerHighIRStatement(s: HighIRStatement): void {
    switch (s.__type__) {
      case 'HighIRIndexAccessStatement':
        this.lowerHighIRIndexAccessStatement(s);
        return;
      case 'HighIRBinaryStatement': {
        const { name: resultVariable, operator, e1, e2 } = s;
        const { value: v1, type: operandType } = this.lowerHighIRExpression(e1);
        const v2 = this.lowerHighIRExpression(e2).value;
        this.emitInstruction(LLVM_BINARY({ resultVariable, operator, operandType, v1, v2 }));
        return;
      }
      case 'HighIRFunctionCallStatement':
        this.emitInstruction(
          LLVM_CALL({
            resultType: lowerHighIRTypeToLLVMType(s.returnType),
            resultVariable: s.returnCollector,
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
      case 'HighIRCastStatement': {
        const { value: sourceValue, type: sourceType } = this.lowerHighIRExpression(
          s.assignedExpression
        );
        this.emitInstruction(
          LLVM_CAST({
            resultVariable: s.name,
            resultType: lowerHighIRTypeToLLVMType(s.type),
            sourceValue,
            sourceType,
          })
        );
        return;
      }
      case 'HighIRStructInitializationStatement':
        this.lowerHighIRStructInitializationStatement(s);
        return;
      case 'HighIRReturnStatement': {
        const { value, type } = this.lowerHighIRExpression(s.expression);
        this.emitInstruction(LLVM_RETURN(value, type));
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
    this.emitInstruction(
      LLVM_GET_ELEMENT_PTR({
        resultVariable: pointerTemp,
        sourcePointerType: loweredPointerType,
        sourceValue: loweredPointerValue,
        offset: s.index,
      })
    );
    this.emitInstruction(
      LLVM_LOAD({ resultVariable: s.name, sourceVariable: pointerTemp, valueType })
    );
  }

  private lowerNormalHighIRIfElseStatement(s: HighIRIfElseStatement): void {
    const { booleanExpression, s1, s2, finalAssignment } = s;
    const loweredCondition = this.lowerHighIRExpression(booleanExpression).value;
    const trueLabel = this.allocator.allocateLabelWithAnnotation('if_else_true');
    const falseLabel = this.allocator.allocateLabelWithAnnotation('if_else_false');
    const endLabel = this.allocator.allocateLabelWithAnnotation('if_else_end');
    const s1IsEmpty = s1.length === 0;
    const s2IsEmpty = s2.length === 0;
    if (s1IsEmpty && s2IsEmpty) {
      if (finalAssignment == null) return;
      this.emitInstruction(LLVM_CJUMP(loweredCondition, trueLabel, falseLabel));
      this.emitInstruction(LLVM_LABEL(trueLabel));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(falseLabel));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(endLabel));
      const v1 = this.lowerHighIRExpression(finalAssignment.branch1Value).value;
      const v2 = this.lowerHighIRExpression(finalAssignment.branch2Value).value;
      this.emitInstruction(
        LLVM_PHI({
          resultVariable: finalAssignment.name,
          variableType: lowerHighIRTypeToLLVMType(finalAssignment.type),
          valueBranchTuples: [
            { value: v1, branch: trueLabel },
            { value: v2, branch: falseLabel },
          ],
        })
      );
      return;
    }

    this.emitInstruction(
      LLVM_CJUMP(
        loweredCondition,
        s1IsEmpty ? endLabel : trueLabel,
        s2IsEmpty ? endLabel : falseLabel
      )
    );
    const beforeConditionLabel = this.currentLabel;
    if (finalAssignment != null) {
      this.emitInstruction(LLVM_LABEL(trueLabel));
      s1.forEach((it) => this.lowerHighIRStatement(it));
      const v1 = this.lowerHighIRExpression(finalAssignment.branch1Value).value;
      const v1Label = this.currentLabel;
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(falseLabel));
      s2.forEach((it) => this.lowerHighIRStatement(it));
      const v2 = this.lowerHighIRExpression(finalAssignment.branch2Value).value;
      const v2Label = this.currentLabel;
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(endLabel));
      this.emitInstruction(
        LLVM_PHI({
          resultVariable: finalAssignment.name,
          variableType: lowerHighIRTypeToLLVMType(finalAssignment.type),
          valueBranchTuples: [
            { value: v1, branch: s1IsEmpty ? beforeConditionLabel : v1Label },
            { value: v2, branch: s2IsEmpty ? beforeConditionLabel : v2Label },
          ],
        })
      );
    } else {
      this.emitInstruction(LLVM_LABEL(trueLabel));
      s1.forEach((it) => this.lowerHighIRStatement(it));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(falseLabel));
      s2.forEach((it) => this.lowerHighIRStatement(it));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(endLabel));
    }
  }

  private lowerHighIRSwitchStatement(s: HighIRSwitchStatement): void {
    const finalEndLabel = this.allocator.allocateLabelWithAnnotation('match_end');
    const caseWithLabels = s.cases.map((it, i) => ({
      ...it,
      label: this.allocator.allocateLabelWithAnnotation(`match_case_${i}`),
    }));

    this.emitInstruction(
      LLVM_SWITCH(
        LLVM_VARIABLE(s.caseVariable),
        checkNotNull(caseWithLabels[caseWithLabels.length - 1]).label,
        caseWithLabels.map((it) => ({ value: it.caseNumber, branch: it.label }))
      )
    );

    if (s.finalAssignment == null) {
      caseWithLabels.forEach(({ label, statements }) => {
        this.emitInstruction(LLVM_LABEL(label));
        statements.forEach((it) => this.lowerHighIRStatement(it));
        this.emitInstruction(LLVM_JUMP(finalEndLabel));
      });
      this.emitInstruction(LLVM_LABEL(finalEndLabel));
      return;
    }
    const { name: phiVariable, type: phiType, branchValues } = s.finalAssignment;
    const valueBranchTuples: Readonly<{ value: LLVMValue; branch: string }>[] = [];
    zip(caseWithLabels, branchValues).forEach(([{ label, statements }, highIRBranchValue]) => {
      this.emitInstruction(LLVM_LABEL(label));
      statements.forEach((it) => this.lowerHighIRStatement(it));
      const branchValue = this.lowerHighIRExpression(highIRBranchValue).value;
      valueBranchTuples.push({ value: branchValue, branch: this.currentLabel });
      this.emitInstruction(LLVM_JUMP(finalEndLabel));
    });
    this.emitInstruction(LLVM_LABEL(finalEndLabel));
    this.emitInstruction(
      LLVM_PHI({
        resultVariable: phiVariable,
        variableType: lowerHighIRTypeToLLVMType(phiType),
        valueBranchTuples,
      })
    );
  }

  private lowerHighIRStructInitializationStatement(s: HighIRStructInitializationStatement): void {
    const rawPointerTemp = this.allocator.allocateTemp('struct_ptr_raw');
    const structType = lowerHighIRTypeToLLVMType(s.type);
    this.emitInstruction(
      LLVM_CALL({
        resultVariable: rawPointerTemp,
        resultType: LLVM_STRING_TYPE(),
        functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_MALLOC),
        functionArguments: [{ value: LLVM_INT(s.expressionList.length * 8), type: LLVM_INT_TYPE }],
      })
    );
    this.emitInstruction(
      LLVM_CAST({
        resultVariable: s.structVariableName,
        resultType: structType,
        sourceValue: LLVM_VARIABLE(rawPointerTemp),
        sourceType: LLVM_STRING_TYPE(),
      })
    );
    s.expressionList.forEach((e, i) => {
      const { value, type } = this.lowerHighIRExpression(e);
      const storePointerTemp = this.allocator.allocateTemp(`struct_ptr_${i}`);
      this.emitInstruction(
        LLVM_GET_ELEMENT_PTR({
          resultVariable: storePointerTemp,
          sourceValue: LLVM_VARIABLE(s.structVariableName),
          sourcePointerType: structType,
          offset: i,
        })
      );
      this.emitInstruction(
        LLVM_STORE({ targetVariable: storePointerTemp, sourceValue: value, valueType: type })
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
        this.emitInstruction(
          LLVM_CAST({
            resultVariable: castedTempName,
            resultType: LLVM_STRING_TYPE(),
            sourceValue: LLVM_NAME(e.name),
            sourceType: LLVM_STRING_TYPE(length),
          })
        );
        return { value: LLVM_VARIABLE(castedTempName), type: lowerHighIRTypeToLLVMType(e.type) };
      }
      case 'HighIRVariableExpression':
        return { value: LLVM_VARIABLE(e.name), type: lowerHighIRTypeToLLVMType(e.type) };
    }
  }
}

export const lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING = (
  { name, type: { argumentTypes, returnType }, parameters, body }: HighIRFunction,
  /** Mapping between global variable name and their length */
  globalVariables: Readonly<Record<string, number>>
): LLVMFunction => {
  const annotatedParameters = zip(parameters, argumentTypes).map(([parameterName, type]) => ({
    parameterName,
    parameterType: lowerHighIRTypeToLLVMType(type),
  }));
  const manager = new LLVMLoweringManager(globalVariables, parameters);
  body.forEach((it) => manager.lowerHighIRStatement(it));
  return {
    name,
    parameters: annotatedParameters,
    returnType: lowerHighIRTypeToLLVMType(returnType),
    body: withoutUnreachableLLVMCode(manager.llvmInstructionCollector),
  };
};

const lowerHighIRModuleToLLVMModule = (highIRModule: HighIRModule): LLVMModule => {
  const globalVariablesMapping = Object.fromEntries(
    highIRModule.globalVariables.map((it) => [it.name, it.content.length + 1])
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
