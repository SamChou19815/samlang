import {
  HighIRStatement,
  HIR_VARIABLE,
  HIR_LET,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { checkNotNull } from 'samlang-core-utils';

const performTailRecursiveCallTransformationOnLinearStatements = (
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
    functionExpression.name !== highIRFunction.name
  ) {
    return null;
  }
  if (
    (returnStatement.expression.__type__ === 'HighIRVariableExpression' &&
      returnCollector?.name === returnStatement.expression.name) ||
    (returnStatement.expression.__type__ === 'HighIRIntLiteralExpression' &&
      returnCollector == null)
  ) {
    return [
      ...statements.slice(0, statements.length - 2),
      // TODO: prepare for SSA
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
  }
  return null;
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
      multiAssignedVariable: lastStatement.multiAssignedVariable,
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
  performTailRecursiveCallTransformationOnLinearStatements(highIRFunction, statements) ??
  performTailRecursiveCallTransformationOnIfElseEndedStatements(highIRFunction, statements);

const performTailRecursiveCallTransformationOnHighIRFunction = (
  highIRFunction: HighIRFunction
): HighIRFunction => {
  const potentialRewrittenStatements = recursivelyPerformTailRecursiveCallTransformationOnStatements(
    highIRFunction,
    highIRFunction.body
  );
  if (potentialRewrittenStatements == null) return highIRFunction;
  return {
    ...highIRFunction,
    body: [
      HIR_WHILE_TRUE(
        highIRFunction.parameters.map((_, i) => `_tailRecTransformationArgument${i}`),
        potentialRewrittenStatements
      ),
    ],
  };
};

export default performTailRecursiveCallTransformationOnHighIRFunction;
