import type OptimizationResourceAllocator from './optimization-resource-allocator';
import { optimizeIrWithSimpleOptimization } from './simple-optimizations';

import {
  HighIRExpression,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
} from 'samlang-core-ast/hir-expressions';
import {
  MidIRStatement,
  MidIRFunction,
  MidIRCompilationUnit,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

/** The threshold max tolerable cost of inlining.  */
const INLINE_THRESHOLD = 25;
/** The threshold max tolerable cost of performing inlining.  */
const PERFORM_INLINE_THRESHOLD = 1000;

const estimateMidIRExpressionInlineCost = (expression: HighIRExpression): number => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return 0;
    case 'HighIRIndexAccessExpression':
      return 1 + estimateMidIRExpressionInlineCost(expression.expression);
    case 'HighIRBinaryExpression':
      return (
        1 +
        estimateMidIRExpressionInlineCost(expression.e1) +
        estimateMidIRExpressionInlineCost(expression.e2)
      );
  }
};

const estimateMidIRStatementInlineCost = (statement: MidIRStatement): number => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return estimateMidIRExpressionInlineCost(statement.source);
    case 'MidIRMoveMemStatement':
      return (
        1 +
        estimateMidIRExpressionInlineCost(statement.memoryIndexExpression) +
        estimateMidIRExpressionInlineCost(statement.source)
      );
    case 'MidIRCallFunctionStatement': {
      let sum = 10;
      sum += estimateMidIRExpressionInlineCost(statement.functionExpression);
      statement.functionArguments.forEach((it) => {
        sum += 1 + estimateMidIRExpressionInlineCost(it);
      });
      return sum;
    }
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return 1;
    case 'MidIRConditionalJumpFallThrough':
      return 1 + estimateMidIRExpressionInlineCost(statement.conditionExpression);
    case 'MidIRReturnStatement':
      return 1 + estimateMidIRExpressionInlineCost(statement.returnedExpression);
  }
};

// eslint-disable-next-line camelcase, import/prefer-default-export
export const estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING = (
  midIRFunction: MidIRFunction
): number => {
  let sum = 0;
  midIRFunction.mainBodyStatements.forEach((statement) => {
    sum += estimateMidIRStatementInlineCost(statement);
  });
  return sum;
};

const getFunctionsToInline = ({
  functions,
}: MidIRCompilationUnit): {
  readonly functionsThatCanPerformInlining: ReadonlySet<string>;
  readonly functionsThatCanBeInlined: ReadonlySet<string>;
} => {
  const functionsThatCanBeInlined = new Set<string>();
  const functionsThatCanPerformInlining = new Set<string>();

  functions.forEach((midIRFunction) => {
    const cost = estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING(midIRFunction);
    if (cost <= INLINE_THRESHOLD) {
      functionsThatCanBeInlined.add(midIRFunction.functionName);
    }
    if (cost <= PERFORM_INLINE_THRESHOLD) {
      functionsThatCanPerformInlining.add(midIRFunction.functionName);
    }
  });

  return { functionsThatCanPerformInlining, functionsThatCanBeInlined };
};

const inlineRewriteForMidIRExpression = (
  prefix: string,
  expression: HighIRExpression
): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression':
      return HIR_VARIABLE(`${prefix}${expression.name}`, expression.type);
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: inlineRewriteForMidIRExpression(prefix, expression.expression),
        index: expression.index,
      });
    case 'HighIRBinaryExpression':
      return HIR_BINARY({
        operator: expression.operator,
        e1: inlineRewriteForMidIRExpression(prefix, expression.e1),
        e2: inlineRewriteForMidIRExpression(prefix, expression.e2),
      });
  }
};

const inlineRewriteForMidIRStatement = (
  labelPrefix: string,
  temporaryPrefix: string,
  returnCollectorTemporaryID: string | undefined,
  statement: MidIRStatement
): readonly MidIRStatement[] => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return [
        MIR_MOVE_TEMP(
          `${temporaryPrefix}${statement.temporaryID}`,
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.source)
        ),
      ];
    case 'MidIRMoveMemStatement':
      return [
        MIR_MOVE_IMMUTABLE_MEM(
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.memoryIndexExpression),
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.source)
        ),
      ];
    case 'MidIRCallFunctionStatement':
      return [
        MIR_CALL_FUNCTION(
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.functionExpression),
          statement.functionArguments.map((it) =>
            inlineRewriteForMidIRExpression(temporaryPrefix, it)
          ),
          statement.returnCollectorTemporaryID == null
            ? undefined
            : `${temporaryPrefix}${statement.returnCollectorTemporaryID}`
        ),
      ];
    case 'MidIRJumpStatement':
      return [MIR_JUMP(`${labelPrefix}${statement.label}`)];
    case 'MidIRLabelStatement':
      return [MIR_LABEL(`${labelPrefix}${statement.name}`)];
    case 'MidIRConditionalJumpFallThrough':
      return [
        MIR_CJUMP_FALLTHROUGH(
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.conditionExpression),
          `${labelPrefix}${statement.label1}`
        ),
      ];
    case 'MidIRReturnStatement':
      // istanbul ignore next
      if (statement.returnedExpression == null || returnCollectorTemporaryID == null) {
        return [MIR_JUMP(`${labelPrefix}__INLINING_END`)];
      }
      return [
        MIR_MOVE_TEMP(
          returnCollectorTemporaryID,
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.returnedExpression)
        ),
        MIR_JUMP(`${labelPrefix}__INLINING_END`),
      ];
  }
};

const performInlineRewriteOnFunction = (
  midIRFunction: MidIRFunction,
  functionsThatCanBeInlined: ReadonlySet<string>,
  allFunctions: Record<string, MidIRFunction>,
  allocator: OptimizationResourceAllocator
): MidIRFunction => {
  const newMainBodyStatements: MidIRStatement[] = [];

  midIRFunction.mainBodyStatements.forEach((oldMainBodyStatement) => {
    if (oldMainBodyStatement.__type__ !== 'MidIRCallFunctionStatement') {
      newMainBodyStatements.push(oldMainBodyStatement);
      return;
    }
    const {
      functionExpression,
      functionArguments,
      returnCollectorTemporaryID,
    } = oldMainBodyStatement;
    if (functionExpression.__type__ !== 'HighIRNameExpression') {
      newMainBodyStatements.push(oldMainBodyStatement);
      return;
    }
    const functionName = functionExpression.name;
    if (!functionsThatCanBeInlined.has(functionName)) {
      newMainBodyStatements.push(oldMainBodyStatement);
      return;
    }

    const {
      argumentNames: argumentNamesOfFunctionToBeInlined,
      mainBodyStatements: mainBodyStatementsOfFunctionToBeInlined,
    } = checkNotNull(allFunctions[functionName]);
    const labelPrefix = allocator.allocateInliningLabelPrefix();
    const temporaryPrefix = allocator.allocateInliningTemporaryPrefix();
    newMainBodyStatements.push(
      // inline step 1: move args to args temp
      ...argumentNamesOfFunctionToBeInlined.map((parameter, index) =>
        MIR_MOVE_TEMP(`${temporaryPrefix}${parameter}`, checkNotNull(functionArguments[index]))
      ),
      // inline step 2: add in body code and change return statements and label prefix
      ...mainBodyStatementsOfFunctionToBeInlined
        .map((it) =>
          inlineRewriteForMidIRStatement(
            labelPrefix,
            temporaryPrefix,
            returnCollectorTemporaryID,
            it
          )
        )
        .flat(),
      // inline step 3: mark the end of inlining for return
      MIR_LABEL(`${labelPrefix}__INLINING_END`)
    );
  });

  return {
    ...midIRFunction,
    mainBodyStatements: optimizeIrWithSimpleOptimization(newMainBodyStatements),
  };
};

const optimizeMidIRCompilationUnitByInlining = (
  compilationUnit: MidIRCompilationUnit,
  allocator: OptimizationResourceAllocator
): MidIRCompilationUnit => {
  let tempCompilationUnit = compilationUnit;
  for (let i = 0; i < 5; i += 1) {
    const { functionsThatCanBeInlined, functionsThatCanPerformInlining } = getFunctionsToInline(
      tempCompilationUnit
    );
    if (functionsThatCanBeInlined.size === 0) {
      return tempCompilationUnit;
    }
    const allFunctions = Object.fromEntries(
      tempCompilationUnit.functions.map((it) => [it.functionName, it])
    );
    tempCompilationUnit = {
      ...compilationUnit,
      functions: tempCompilationUnit.functions.map((oldFunction) => {
        if (functionsThatCanPerformInlining.has(oldFunction.functionName)) {
          return performInlineRewriteOnFunction(
            oldFunction,
            functionsThatCanBeInlined,
            allFunctions,
            allocator
          );
        }
        return oldFunction;
      }),
    };
  }
  return tempCompilationUnit;
};

export default optimizeMidIRCompilationUnitByInlining;
