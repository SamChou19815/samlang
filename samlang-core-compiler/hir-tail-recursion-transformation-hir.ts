import {
  HighIRStatement,
  HIR_VARIABLE,
  HIR_LET,
  HIR_IF_ELSE,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { checkNotNull } from 'samlang-core-utils';

const getFunctionParameterCollector = (name: string): string => `_param_${name}_temp_collector`;

const recursivelyPerformTailRecursiveCallTransformationOnStatements = (
  highIRFunction: HighIRFunction,
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] | null => {
  const lastStatement = statements[statements.length - 1];
  if (lastStatement == null) return null;
  if (lastStatement.__type__ === 'HighIRIfElseStatement') {
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
        finalAssignment: lastStatement.finalAssignment,
      }),
    ];
  }

  const returnStatement = lastStatement;
  const functionCallStatement = statements[statements.length - 2];
  if (
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
      ...functionArguments.map((functionArgument, i) =>
        HIR_LET({
          name: getFunctionParameterCollector(checkNotNull(highIRFunction.parameters[i])),
          type: checkNotNull(highIRFunction.type.argumentTypes[i]),
          assignedExpression: functionArgument,
        })
      ),
      ...highIRFunction.parameters.map((name, i) =>
        HIR_LET({
          name,
          type: checkNotNull(highIRFunction.type.argumentTypes[i]),
          assignedExpression: HIR_VARIABLE(
            getFunctionParameterCollector(name),
            checkNotNull(highIRFunction.type.argumentTypes[i])
          ),
        })
      ),
    ];
  }
  return null;
};

export default recursivelyPerformTailRecursiveCallTransformationOnStatements;
