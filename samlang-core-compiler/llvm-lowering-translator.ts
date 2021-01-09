import {
  getFunctionParameterCollector,
  renameFunctionParameterReadForSSA,
} from './hir-tail-recursion-transformation-hir';
import LLVMConstantPropagationContext from './llvm-constant-propagation-context';
import lowerHighIRTypeToLLVMType from './llvm-types-lowering';
import MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type {
  HighIRExpression,
  HighIRStatement,
  HighIRFunctionCallStatement,
  HighIRIfElseStatement,
  HighIRWhileTrueStatement,
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
import { Long, checkNotNull } from 'samlang-core-utils';

type ChainedIfElseFromMatchCase = {
  readonly branchVariable: string;
  readonly statements: readonly HighIRStatement[];
};

type DetectedChainedIfElseFromMatch = {
  readonly phiVariable: string;
  readonly phiType: LLVMType;
  readonly tagVariable: string;
  readonly cases: readonly ChainedIfElseFromMatchCase[];
};

const detectChainedIfElseFromMatch = (
  statement: HighIRIfElseStatement
): DetectedChainedIfElseFromMatch | null => {
  type ChainedIfElseFromMatchCaseAugmented = ChainedIfElseFromMatchCase & {
    readonly phiVariable: string;
    readonly tagVariable: string;
  };
  const cases: ChainedIfElseFromMatchCaseAugmented[] = [];

  const detectChainedIfElseFromMatchHelper = (s: HighIRIfElseStatement, index: number): boolean => {
    if (
      s.multiAssignedVariable == null ||
      s.booleanExpression.__type__ !== 'HighIRBinaryExpression' ||
      s.booleanExpression.operator !== '==' ||
      s.booleanExpression.e1.__type__ !== 'HighIRVariableExpression' ||
      s.booleanExpression.e2.__type__ !== 'HighIRIntLiteralExpression' ||
      s.booleanExpression.e2.value.notEquals(Long.fromInt(index))
    ) {
      return false;
    }

    const currentCase = {
      phiVariable: s.multiAssignedVariable.name,
      tagVariable: s.booleanExpression.e1.name,
      branchVariable: s.multiAssignedVariable.branch1Variable,
      statements: s.s1,
    };
    cases.push(currentCase);

    if (s.s2.length === 1) {
      const elseBranchOnlyStatement = checkNotNull(s.s2[0]);
      // istanbul ignore next
      if (
        elseBranchOnlyStatement.__type__ === 'HighIRIfElseStatement' &&
        s.multiAssignedVariable.branch2Variable === s.multiAssignedVariable.name
      ) {
        return detectChainedIfElseFromMatchHelper(elseBranchOnlyStatement, index + 1);
      }
    }
    cases.push({
      phiVariable: s.multiAssignedVariable.name,
      tagVariable: s.booleanExpression.e1.name,
      branchVariable: s.multiAssignedVariable.branch2Variable,
      statements: s.s2,
    });
    return true;
  };

  if (!detectChainedIfElseFromMatchHelper(statement, 0)) return null;
  const phiVariable = checkNotNull(cases[0]?.phiVariable);
  const tagVariable = checkNotNull(cases[0]?.tagVariable);
  return {
    phiVariable,
    phiType: lowerHighIRTypeToLLVMType(checkNotNull(statement?.multiAssignedVariable?.type)),
    tagVariable,
    cases: cases.map(({ phiVariable: p, tagVariable: t, branchVariable, statements }) => {
      // istanbul ignore next
      if (phiVariable !== p || tagVariable !== t) throw new Error();
      return { branchVariable, statements };
    }),
  };
};

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
      case 'HighIRFunctionCallStatement':
        this.lowerHighIRFunctionCallStatement(s);
        return;
      case 'HighIRIfElseStatement': {
        const result = detectChainedIfElseFromMatch(s);
        if (result == null) {
          this.lowerNormalHighIRIfElseStatement(s);
        } else {
          this.lowerChainedIfElseFromMatch(result);
        }
        return;
      }
      case 'HighIRWhileTrueStatement':
        this.lowerHighIRWhileTrueStatement(s);
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

  private lowerChainedIfElseFromMatch({
    phiVariable,
    tagVariable,
    cases,
  }: DetectedChainedIfElseFromMatch): void {
    const finalEndLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      `match_end`
    );
    const phiMovesWithLabels = cases.map(({ branchVariable }, i) => ({
      target: phiVariable,
      source: branchVariable,
      label: this.allocator.allocateLabelWithAnnotation(this.functionName, `match_case_${i}`),
    }));
    this.llvmInstructionCollector.push(
      LLVM_SWITCH(
        LLVM_VARIABLE(tagVariable),
        finalEndLabel,
        phiMovesWithLabels.map((it) => it.label)
      )
    );
    const values: LLVMValue[] = [];
    cases.forEach(({ branchVariable, statements }, i) => {
      this.withNestedScope(phiMovesWithLabels, () => {
        this.llvmInstructionCollector.push(LLVM_LABEL(checkNotNull(phiMovesWithLabels[i]).label));
        this.withNestedScope(phiMovesWithLabels, () => {
          statements.forEach((it) => this.lowerHighIRStatement(it));
          const assignedValue = checkNotNull(
            this.llvmConstantPropagationContext.getLocalValueType(branchVariable)
          );
          values.push(assignedValue);
        });
        this.llvmInstructionCollector.push(LLVM_JUMP(finalEndLabel));
      });
    });
    this.llvmInstructionCollector.push(
      LLVM_LABEL(finalEndLabel),
      LLVM_PHI({
        name: phiVariable,
        variableType: LLVM_INT_TYPE,
        valueBranchTuples: phiMovesWithLabels.map(({ label: branch }, i) => ({
          value: checkNotNull(values[i]),
          branch,
        })),
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
          v1 = checkNotNull(
            this.llvmConstantPropagationContext.getLocalValueType(
              multiAssignedVariable.branch1Variable
            )
          );
        }
      );
      this.llvmInstructionCollector.push(LLVM_JUMP(endLabel), LLVM_LABEL(falseLabel));
      this.withNestedScope(
        [{ target: multiAssignedVariable.name, source: multiAssignedVariable.branch2Variable }],
        () => {
          s2.forEach((it) => this.lowerHighIRStatement(it));
          v2 = checkNotNull(
            this.llvmConstantPropagationContext.getLocalValueType(
              multiAssignedVariable.branch2Variable
            )
          );
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

  private lowerHighIRWhileTrueStatement(s: HighIRWhileTrueStatement): void {
    const startLabel = this.allocator.allocateLabelWithAnnotation(
      this.functionName,
      'while_true_start'
    );
    this.llvmInstructionCollector.push(LLVM_LABEL(startLabel));
    s.multiAssignedVariables.forEach((name) => {
      this.llvmInstructionCollector.push(
        LLVM_PHI({
          name: renameFunctionParameterReadForSSA(name),
          variableType: checkNotNull(this.parameters[name]),
          valueBranchTuples: [
            { value: LLVM_VARIABLE(name), branch: this.functionStartLabel },
            { value: LLVM_VARIABLE(getFunctionParameterCollector(name)), branch: startLabel },
          ],
        })
      );
    });
    this.withNestedScope(
      s.multiAssignedVariables.map((name) => ({
        target: renameFunctionParameterReadForSSA(name),
        source: getFunctionParameterCollector(name),
      })),
      () => {
        s.statements.forEach((it) => this.lowerHighIRStatement(it));
      }
    );
    this.llvmInstructionCollector.push(LLVM_JUMP(startLabel));
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
      case 'HighIRIndexAccessExpression': {
        const { value: loweredPointerValue, type: loweredPointerType } = this.lowerHighIRExpression(
          e.expression
        );
        const pointerTemp = this.allocator.allocateTemp('index_pointer_temp');
        const valueTemp = this.allocator.allocateTemp('value_temp_loaded');
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
        const binaryTemp = this.allocator.allocateTemp('binary_temp');
        this.llvmInstructionCollector.push(
          LLVM_BINARY({ resultVariable: binaryTemp, operator: e.operator, v1, v2 })
        );
        return { value: LLVM_VARIABLE(binaryTemp), type: lowerHighIRTypeToLLVMType(e.type) };
      }
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
