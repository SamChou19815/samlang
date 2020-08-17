import {
  HighIRStatement,
  HIR_VARIABLE,
  HIR_LET,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
} from '../../ast/hir/hir-expressions';
import type { HighIRFunction } from '../../ast/hir/hir-toplevel';
import eliminateUselessEndingMoveForHighIRStatements from './hir-eliminate-useless-ending-moves';
import coalesceMoveAndReturnForHighIRStatements from './hir-move-return-coalescing';

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
      HIR_LET({ name: `_tailRecTransformationArgument${i}`, assignedExpression: functionArgument })
    ),
    ...highIRFunction.parameters.map((name, i) =>
      HIR_LET({ name, assignedExpression: HIR_VARIABLE(`_tailRecTransformationArgument${i}`) })
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
      HIR_LET({ name: `_tailRecTransformationArgument${i}`, assignedExpression: functionArgument })
    ),
    ...highIRFunction.parameters.map((name, i) =>
      HIR_LET({ name, assignedExpression: HIR_VARIABLE(`_tailRecTransformationArgument${i}`) })
    ),
  ];
};

const performTailRecursiveCallTransformationOnIfElseEndedStatements = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null || lastStatement.__type__ !== 'HighIRIfElseStatement') return null;

  const s1 = recursivelyPerformTailRecursiveCallTransformationOnStatements(
    highIRFunction,
    lastStatement.s1
  );
  const s2 = recursivelyPerformTailRecursiveCallTransformationOnStatements(
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

const recursivelyPerformTailRecursiveCallTransformationOnStatements = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null =>
  performTailRecursiveCallTransformationOnLinearStatementsWithFinalReturn(
    highIRFunction,
    statements
  ) ??
  performTailRecursiveCallTransformationOnLinearStatementsWithoutFinalReturn(
    highIRFunction,
    statements
  ) ??
  performTailRecursiveCallTransformationOnIfElseEndedStatements(highIRFunction, statements);

const performTailRecursiveCallTransformationOnHighIRFunction = (
  highIRFunction: HighIRFunction
): HighIRFunction | null => {
  const optimizedStatements = highIRFunction.hasReturn
    ? coalesceMoveAndReturnForHighIRStatements(highIRFunction.body) ?? highIRFunction.body
    : eliminateUselessEndingMoveForHighIRStatements(highIRFunction.body);
  const potentialRewrittenStatements = recursivelyPerformTailRecursiveCallTransformationOnStatements(
    highIRFunction,
    optimizedStatements
  );
  if (potentialRewrittenStatements == null) return null;
  return { ...highIRFunction, body: [HIR_WHILE_TRUE(potentialRewrittenStatements)] };
};

export default performTailRecursiveCallTransformationOnHighIRFunction;
