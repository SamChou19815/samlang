import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
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
  LLVM_RETURN,
  LLVM_INT_TYPE,
  LLVMValue,
  LLVMSources,
} from 'samlang-core-ast/llvm-nodes';
import type {
  MidIRExpression,
  MidIRStatement,
  MidIRIndexAccessStatement,
  MidIRIfElseStatement,
  MidIRSingleIfStatement,
  MidIRWhileStatement,
  MidIRStructInitializationStatement,
  MidIRFunction,
  MidIRSources,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull, zip, zip3 } from 'samlang-core-utils';

import { withoutUnreachableLLVMCode } from './llvm-control-flow-graph';
import lowerMidIRTypeToLLVMType from './llvm-types-lowering';

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

type ValueAndBranch = { readonly value: LLVMValue; readonly branch: string };

type LabelAndBreakValues = {
  readonly label: string;
  readonly breakValues: ValueAndBranch[];
};

class WhileBreakCollectorManager {
  private stack: LabelAndBreakValues[] = [];

  get currentLevel(): LabelAndBreakValues {
    return checkNotNull(this.stack[this.stack.length - 1]);
  }

  withNewNestedWhileLoop = (label: string, block: () => void): readonly ValueAndBranch[] => {
    this.stack.push({ label, breakValues: [] });
    block();
    return checkNotNull(this.stack.pop()).breakValues;
  };
}

class LLVMLoweringManager {
  readonly llvmInstructionCollector: LLVMInstruction[] = [];
  private readonly allocator = new LLVMResourceAllocator();
  private readonly functionStartLabel: string;
  private currentLabel: string;
  // Keep track of under which label is a variable created.
  private readonly variableSourceMap = new Map<string, string>();
  private readonly whileBreakCollectorManager = new WhileBreakCollectorManager();

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

  lowerMidIRStatement(s: MidIRStatement): void {
    switch (s.__type__) {
      case 'MidIRIndexAccessStatement':
        this.lowerMidIRIndexAccessStatement(s);
        return;
      case 'MidIRBinaryStatement': {
        const { name: resultVariable, operator, e1, e2 } = s;
        const { value: v1, type: operandType } = this.lowerMidIRExpression(e1);
        const v2 = this.lowerMidIRExpression(e2).value;
        this.emitInstruction(LLVM_BINARY({ resultVariable, operator, operandType, v1, v2 }));
        return;
      }
      case 'MidIRFunctionCallStatement':
        this.emitInstruction(
          LLVM_CALL({
            resultType: lowerMidIRTypeToLLVMType(s.returnType),
            resultVariable: s.returnCollector,
            functionName: this.lowerMidIRExpression(s.functionExpression).value,
            functionArguments: s.functionArguments.map((it) => this.lowerMidIRExpression(it)),
          })
        );
        return;
      case 'MidIRIfElseStatement':
        this.lowerMidIRIfElseStatement(s);
        return;
      case 'MidIRSingleIfStatement':
        this.lowerMidIRSingleIfStatement(s);
        return;
      case 'MidIRBreakStatement': {
        const { label, breakValues } = this.whileBreakCollectorManager.currentLevel;
        breakValues.push({
          value: this.lowerMidIRExpression(s.breakValue).value,
          branch: this.currentLabel,
        });
        this.emitInstruction(LLVM_JUMP(label));
        return;
      }
      case 'MidIRWhileStatement':
        this.lowerMidIRWhileStatement(s);
        return;
      case 'MidIRCastStatement': {
        const { value: sourceValue, type: sourceType } = this.lowerMidIRExpression(
          s.assignedExpression
        );
        this.emitInstruction(
          LLVM_CAST({
            resultVariable: s.name,
            resultType: lowerMidIRTypeToLLVMType(s.type),
            sourceValue,
            sourceType,
          })
        );
        return;
      }
      case 'MidIRStructInitializationStatement':
        this.lowerMidIRStructInitializationStatement(s);
        return;
    }
  }

  private lowerMidIRIndexAccessStatement(s: MidIRIndexAccessStatement): void {
    const { value: loweredPointerValue, type: loweredPointerType } = this.lowerMidIRExpression(
      s.pointerExpression
    );
    const pointerTemp = this.allocator.allocateTemp('index_pointer_temp');
    const valueType = lowerMidIRTypeToLLVMType(s.type);
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

  private lowerMidIRIfElseStatement({
    booleanExpression,
    s1,
    s2,
    finalAssignments,
  }: MidIRIfElseStatement): void {
    const loweredCondition = this.lowerMidIRExpression(booleanExpression).value;
    const trueLabel = this.allocator.allocateLabelWithAnnotation('if_else_true');
    const falseLabel = this.allocator.allocateLabelWithAnnotation('if_else_false');
    const endLabel = this.allocator.allocateLabelWithAnnotation('if_else_end');
    const s1IsEmpty =
      s1.length === 0 &&
      finalAssignments.every((it) => it.branch1Value.__type__ !== 'MidIRNameExpression');
    const s2IsEmpty =
      s2.length === 0 &&
      finalAssignments.every((it) => it.branch2Value.__type__ !== 'MidIRNameExpression');
    if (s1IsEmpty && s2IsEmpty) {
      if (finalAssignments.length === 0) return;
      this.emitInstruction(LLVM_CJUMP(loweredCondition, trueLabel, falseLabel));
      this.emitInstruction(LLVM_LABEL(trueLabel));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(falseLabel));
      this.emitInstruction(LLVM_JUMP(endLabel));
      this.emitInstruction(LLVM_LABEL(endLabel));
      finalAssignments.forEach((finalAssignment) => {
        const v1 = this.lowerMidIRExpression(finalAssignment.branch1Value).value;
        const v2 = this.lowerMidIRExpression(finalAssignment.branch2Value).value;
        this.emitInstruction(
          LLVM_PHI({
            resultVariable: finalAssignment.name,
            variableType: lowerMidIRTypeToLLVMType(finalAssignment.type),
            valueBranchTuples: [
              { value: v1, branch: trueLabel },
              { value: v2, branch: falseLabel },
            ],
          })
        );
      });
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
    this.emitInstruction(LLVM_LABEL(trueLabel));
    s1.forEach((it) => this.lowerMidIRStatement(it));
    const v1List = finalAssignments.map(
      (finalAssignment) => this.lowerMidIRExpression(finalAssignment.branch1Value).value
    );
    const v1Label = this.currentLabel;
    this.emitInstruction(LLVM_JUMP(endLabel));
    this.emitInstruction(LLVM_LABEL(falseLabel));
    s2.forEach((it) => this.lowerMidIRStatement(it));
    const v2List = finalAssignments.map(
      (finalAssignment) => this.lowerMidIRExpression(finalAssignment.branch2Value).value
    );
    const v2Label = this.currentLabel;
    this.emitInstruction(LLVM_JUMP(endLabel));
    this.emitInstruction(LLVM_LABEL(endLabel));
    zip3(v1List, v2List, finalAssignments).forEach(([v1, v2, finalAssignment]) => {
      this.emitInstruction(
        LLVM_PHI({
          resultVariable: finalAssignment.name,
          variableType: lowerMidIRTypeToLLVMType(finalAssignment.type),
          valueBranchTuples: [
            { value: v1, branch: s1IsEmpty ? beforeConditionLabel : v1Label },
            { value: v2, branch: s2IsEmpty ? beforeConditionLabel : v2Label },
          ],
        })
      );
    });
  }

  private lowerMidIRSingleIfStatement({
    booleanExpression,
    invertCondition,
    statements,
  }: MidIRSingleIfStatement): void {
    if (statements.length === 0) return;
    const loweredCondition = this.lowerMidIRExpression(booleanExpression).value;
    const blockLabel = this.allocator.allocateLabelWithAnnotation('single_if_block');
    const endLabel = this.allocator.allocateLabelWithAnnotation('single_if_end');

    this.emitInstruction(
      LLVM_CJUMP(
        loweredCondition,
        invertCondition ? endLabel : blockLabel,
        invertCondition ? blockLabel : endLabel
      )
    );
    this.emitInstruction(LLVM_LABEL(blockLabel));
    statements.forEach((it) => this.lowerMidIRStatement(it));
    this.emitInstruction(LLVM_JUMP(endLabel));
    this.emitInstruction(LLVM_LABEL(endLabel));
  }

  private lowerMidIRWhileStatement(s: MidIRWhileStatement): void {
    const beforeLoopLabel = this.currentLabel;
    const loopStartLabel = this.allocator.allocateLabelWithAnnotation('loop_start');
    const loopEndLabel = this.allocator.allocateLabelWithAnnotation('loop_end');
    this.emitInstruction(LLVM_JUMP(loopStartLabel));
    this.emitInstruction(LLVM_LABEL(loopStartLabel));
    const phiInstructions = s.loopVariables.map((loopVariable) =>
      LLVM_PHI({
        resultVariable: loopVariable.name,
        variableType: lowerMidIRTypeToLLVMType(loopVariable.type),
        valueBranchTuples: [
          {
            value: this.lowerMidIRExpression(loopVariable.initialValue).value,
            branch: beforeLoopLabel,
          },
          {
            value: this.lowerMidIRExpression(loopVariable.loopValue).value,
            branch: beforeLoopLabel, // hack: to be patched later
          },
        ],
      })
    );
    phiInstructions.forEach((it) => this.emitInstruction(it));
    const breakValueBranchTuples = this.whileBreakCollectorManager.withNewNestedWhileLoop(
      loopEndLabel,
      () => {
        s.statements.forEach((it) => this.lowerMidIRStatement(it));
      }
    );
    const beforeJumpLabel = this.currentLabel;
    phiInstructions.forEach((it) => {
      // @ts-expect-error: ugly patch
      it.valueBranchTuples[1].branch = beforeJumpLabel;
    });
    this.emitInstruction(LLVM_JUMP(loopStartLabel));
    this.emitInstruction(LLVM_LABEL(loopEndLabel));
    if (s.breakCollector != null) {
      this.emitInstruction(
        LLVM_PHI({
          resultVariable: s.breakCollector.name,
          variableType: lowerMidIRTypeToLLVMType(s.breakCollector.type),
          valueBranchTuples: breakValueBranchTuples,
        })
      );
    }
  }

  private lowerMidIRStructInitializationStatement(s: MidIRStructInitializationStatement): void {
    const rawPointerTemp = this.allocator.allocateTemp('struct_ptr_raw');
    const structType = lowerMidIRTypeToLLVMType(s.type);
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
      const { value, type } = this.lowerMidIRExpression(e);
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

  lowerMidIRExpression(e: MidIRExpression): LLVMAnnotatedValue {
    switch (e.__type__) {
      case 'MidIRIntLiteralExpression':
        return { value: LLVM_INT(e.value), type: lowerMidIRTypeToLLVMType(e.type) };
      case 'MidIRNameExpression': {
        const length = this.globalVariables[e.name];
        if (length == null) {
          // must be a function name
          return { value: LLVM_NAME(e.name), type: lowerMidIRTypeToLLVMType(e.type) };
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
        return { value: LLVM_VARIABLE(castedTempName), type: lowerMidIRTypeToLLVMType(e.type) };
      }
      case 'MidIRVariableExpression':
        return { value: LLVM_VARIABLE(e.name), type: lowerMidIRTypeToLLVMType(e.type) };
    }
  }
}

export function lowerMidIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING(
  { name, type: { argumentTypes, returnType }, parameters, body, returnValue }: MidIRFunction,
  /** Mapping between global variable name and their length */
  globalVariables: Readonly<Record<string, number>>
): LLVMFunction {
  const annotatedParameters = zip(parameters, argumentTypes).map(([parameterName, type]) => ({
    parameterName,
    parameterType: lowerMidIRTypeToLLVMType(type),
  }));
  const manager = new LLVMLoweringManager(globalVariables, parameters);
  body.forEach((it) => manager.lowerMidIRStatement(it));
  manager.llvmInstructionCollector.push(
    LLVM_RETURN(
      manager.lowerMidIRExpression(returnValue).value,
      lowerMidIRTypeToLLVMType(returnType)
    )
  );
  return {
    name,
    parameters: annotatedParameters,
    returnType: lowerMidIRTypeToLLVMType(returnType),
    body: withoutUnreachableLLVMCode(manager.llvmInstructionCollector),
  };
}

export default function lowerMidIRSourcesToLLVMSources(midIRSources: MidIRSources): LLVMSources {
  const globalVariablesMapping = Object.fromEntries(
    midIRSources.globalVariables.map((it) => [it.name, it.content.length + 1])
  );

  return {
    globalVariables: midIRSources.globalVariables,
    typeDefinitions: midIRSources.typeDefinitions.map((it) => ({
      identifier: it.identifier,
      mappings: it.mappings.map(lowerMidIRTypeToLLVMType),
    })),
    mainFunctionNames: midIRSources.mainFunctionNames,
    functions: midIRSources.functions.map((it) =>
      lowerMidIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING(it, globalVariablesMapping)
    ),
  };
}
