import {
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRCompilationUnit,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
} from '../ast/mir';
import OptimizationResourceAllocator from './optimization-resource-allocator';
import { optimizeIrWithSimpleOptimization } from './simple-optimizations';

/** The threshold max tolerable cost of inlining.  */
const INLINE_THRESHOLD = 25;
/** The threshold max tolerable cost of performing inlining.  */
const PERFORM_INLINE_THRESHOLD = 1000;

const estimateMidIRExpressionInlineCost = (expression: MidIRExpression): number => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return 0;
    case 'MidIRImmutableMemoryExpression':
      return 1 + estimateMidIRExpressionInlineCost(expression.indexExpression);
    case 'MidIRBinaryExpression':
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
      return (
        1 +
        (statement.returnedExpression == null
          ? 0
          : estimateMidIRExpressionInlineCost(statement.returnedExpression))
      );
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
  expression: MidIRExpression
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
      return expression;
    case 'MidIRTemporaryExpression':
      return MIR_TEMP(`${prefix}${expression.temporaryID}`);
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(inlineRewriteForMidIRExpression(prefix, expression.indexExpression));
    case 'MidIRBinaryExpression':
      return MIR_OP(
        expression.operator,
        inlineRewriteForMidIRExpression(prefix, expression.e1),
        inlineRewriteForMidIRExpression(prefix, expression.e2)
      );
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
          MIR_TEMP(`${temporaryPrefix}${statement.temporaryID}`),
          inlineRewriteForMidIRExpression(temporaryPrefix, statement.source)
        ),
      ];
    case 'MidIRMoveMemStatement':
      return [
        MIR_MOVE_IMMUTABLE_MEM(
          MIR_IMMUTABLE_MEM(
            inlineRewriteForMidIRExpression(temporaryPrefix, statement.memoryIndexExpression)
          ),
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
          MIR_TEMP(returnCollectorTemporaryID),
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
    if (functionExpression.__type__ !== 'MidIRNameExpression') {
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
    } = allFunctions[functionName];
    const labelPrefix = allocator.allocateInliningLabelPrefix();
    const temporaryPrefix = allocator.allocateInliningTemporaryPrefix();
    newMainBodyStatements.push(
      // inline step 1: move args to args temp
      ...argumentNamesOfFunctionToBeInlined.map((parameter, index) =>
        MIR_MOVE_TEMP(MIR_TEMP(`${temporaryPrefix}${parameter}`), functionArguments[index])
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
