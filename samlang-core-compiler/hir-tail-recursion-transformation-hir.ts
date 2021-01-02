import eliminateUselessEndingMoveForHighIRStatements from './hir-eliminate-useless-ending-moves';
import coalesceMoveAndReturnForHighIRStatements from './hir-move-return-coalescing';

import {
  HighIRStatement,
  HIR_ZERO,
  HIR_VARIABLE,
  HIR_LET,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { checkNotNull } from 'samlang-core-utils';

const performTailRecursiveCallTransformationOnLinearStatementsWithFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const returnStatement = statements[statements.length - 1];
  const functionCallStatement = statements[statements.length - 2];
  if (
    returnStatement == null ||
    functionCallStatement == null ||
    returnStatement.__type__ !== 'HighIRReturnStatement' ||
    functionCallStatement.__type__ !== 'HighIRFunctionCallStatement'
  ) {
    return null;
  }
  const { functionExpression, functionArguments, returnCollector } = functionCallStatement;
  if (
    functionExpression.__type__ !== 'HighIRNameExpression' ||
    returnStatement.expression.__type__ !== 'HighIRVariableExpression' ||
    returnCollector !== returnStatement.expression.name ||
    functionExpression.name !== highIRFunction.name
  ) {
    return null;
  }
  return [
    ...statements.slice(0, statements.length - 2),
    ...functionArguments.map((functionArgument, i) =>
      HIR_LET({
        name: `_tailRecTransformationArgument${i}`,
        type: functionArgument.type,
        assignedExpression: functionArgument,
      })
    ),
    ...highIRFunction.parameters.map((name, i) =>
      HIR_LET({
        name,
        type: checkNotNull(functionArguments[i]).type,
        assignedExpression: HIR_VARIABLE(
          `_tailRecTransformationArgument${i}`,
          checkNotNull(functionArguments[i]).type
        ),
      })
    ),
  ];
};

const performTailRecursiveCallTransformationOnLinearStatementsWithoutFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const functionCallStatement = statements[statements.length - 1];
  if (
    functionCallStatement == null ||
    functionCallStatement.__type__ !== 'HighIRFunctionCallStatement'
  ) {
    return null;
  }
  const { functionExpression, functionArguments } = functionCallStatement;
  if (
    functionExpression.__type__ !== 'HighIRNameExpression' ||
    functionExpression.name !== highIRFunction.name
  ) {
    return null;
  }
  return [
    ...statements.slice(0, statements.length - 2),
    ...functionArguments.map((functionArgument, i) =>
      HIR_LET({
        name: `_tailRecTransformationArgument${i}`,
        type: functionArgument.type,
        assignedExpression: functionArgument,
      })
    ),
    ...highIRFunction.parameters.map((name, i) =>
      HIR_LET({
        name,
        type: checkNotNull(functionArguments[i]).type,
        assignedExpression: HIR_VARIABLE(
          `_tailRecTransformationArgument${i}`,
          checkNotNull(functionArguments[i]).type
        ),
      })
    ),
  ];
};

const performTailRecursiveCallTransformationOnIfElseEndedStatementsWithFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null || lastStatement.__type__ !== 'HighIRIfElseStatement') return null;

  const s1 = recursivelyPerformTailRecursiveCallTransformationOnStatementsWithFinalReturn(
    highIRFunction,
    lastStatement.s1
  );
  const s2 = recursivelyPerformTailRecursiveCallTransformationOnStatementsWithFinalReturn(
    highIRFunction,
    lastStatement.s2
  );
  if (s1 == null && s2 == null) return null;
  return [
    ...statements.slice(0, statements.length - 1),
    HIR_IF_ELSE({
      booleanExpression: lastStatement.booleanExpression,
      s1: s1 ?? lastStatement.s1,
      s2: s2 ?? lastStatement.s2,
    }),
  ];
};

const performTailRecursiveCallTransformationOnIfElseEndedStatementsWithoutFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null || lastStatement.__type__ !== 'HighIRIfElseStatement') return null;

  const s1 = recursivelyPerformTailRecursiveCallTransformationOnStatementsWithoutFinalReturn(
    highIRFunction,
    lastStatement.s1
  );
  const s2 = recursivelyPerformTailRecursiveCallTransformationOnStatementsWithoutFinalReturn(
    highIRFunction,
    lastStatement.s2
  );
  // istanbul ignore next
  if (s1 == null && s2 == null) return null;
  return [
    ...statements.slice(0, statements.length - 1),
    HIR_IF_ELSE({
      booleanExpression: lastStatement.booleanExpression,
      s1: s1 ?? [...lastStatement.s1, HIR_RETURN(HIR_ZERO)],
      s2: s2 ?? [...lastStatement.s2, HIR_RETURN(HIR_ZERO)],
    }),
  ];
};

const recursivelyPerformTailRecursiveCallTransformationOnStatementsWithFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null =>
  performTailRecursiveCallTransformationOnLinearStatementsWithFinalReturn(
    highIRFunction,
    statements
  ) ??
  performTailRecursiveCallTransformationOnIfElseEndedStatementsWithFinalReturn(
    highIRFunction,
    statements
  );

const recursivelyPerformTailRecursiveCallTransformationOnStatementsWithoutFinalReturn = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null =>
  performTailRecursiveCallTransformationOnLinearStatementsWithoutFinalReturn(
    highIRFunction,
    statements
  ) ??
  performTailRecursiveCallTransformationOnIfElseEndedStatementsWithoutFinalReturn(
    highIRFunction,
    statements
  );

const performTailRecursiveCallTransformationOnHighIRFunction = (
  highIRFunction: HighIRFunction
): HighIRFunction => {
  const optimizedStatements = highIRFunction.hasReturn
    ? coalesceMoveAndReturnForHighIRStatements(highIRFunction.body) ?? highIRFunction.body
    : eliminateUselessEndingMoveForHighIRStatements(highIRFunction.body);
  const optimizer = highIRFunction.hasReturn
    ? recursivelyPerformTailRecursiveCallTransformationOnStatementsWithFinalReturn
    : recursivelyPerformTailRecursiveCallTransformationOnStatementsWithoutFinalReturn;
  const potentialRewrittenStatements = optimizer(highIRFunction, optimizedStatements);
  if (potentialRewrittenStatements == null) return { ...highIRFunction, body: optimizedStatements };
  return { ...highIRFunction, body: [HIR_WHILE_TRUE(potentialRewrittenStatements)] };
};

export default performTailRecursiveCallTransformationOnHighIRFunction;
