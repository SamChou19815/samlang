import {
  HighIRStatement,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_LET,
  HIR_IF_ELSE,
  HIR_WHILE_TRUE,
  HighIRExpression,
  HIR_FUNCTION_CALL,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { checkNotNull } from 'samlang-core-utils';

const rewriteFunctionParameterReadForTailRecursion = (name: string): string => `_param_${name}`;

const renameExpressionForSSA = (
  expression: HighIRExpression,
  parameters: ReadonlySet<string>
): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression':
      if (!parameters.has(expression.name)) return expression;
      return HIR_VARIABLE(
        rewriteFunctionParameterReadForTailRecursion(expression.name),
        expression.type
      );
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: renameExpressionForSSA(expression.expression, parameters),
        index: expression.index,
      });
    case 'HighIRBinaryExpression':
      return HIR_BINARY({
        operator: expression.operator,
        e1: renameExpressionForSSA(expression.e1, parameters),
        e2: renameExpressionForSSA(expression.e2, parameters),
      });
  }
};

const renameStatementForSSA = (
  statement: HighIRStatement,
  parameters: ReadonlySet<string>
): HighIRStatement => {
  switch (statement.__type__) {
    case 'HighIRFunctionCallStatement':
      return HIR_FUNCTION_CALL({
        functionExpression: renameExpressionForSSA(statement.functionExpression, parameters),
        functionArguments: statement.functionArguments.map((it) =>
          renameExpressionForSSA(it, parameters)
        ),
        returnCollector: statement.returnCollector,
      });
    case 'HighIRIfElseStatement':
      return HIR_IF_ELSE({
        multiAssignedVariable: statement.multiAssignedVariable,
        booleanExpression: renameExpressionForSSA(statement.booleanExpression, parameters),
        s1: statement.s1.map((it) => renameStatementForSSA(it, parameters)),
        s2: statement.s2.map((it) => renameStatementForSSA(it, parameters)),
      });
    case 'HighIRWhileTrueStatement':
      return HIR_WHILE_TRUE(
        statement.multiAssignedVariables,
        statement.statements.map((it) => renameStatementForSSA(it, parameters))
      );
    case 'HighIRLetDefinitionStatement':
      return HIR_LET({
        name: statement.name,
        type: statement.type,
        assignedExpression: renameExpressionForSSA(statement.assignedExpression, parameters),
      });
    case 'HighIRStructInitializationStatement':
      return HIR_STRUCT_INITIALIZATION({
        structVariableName: statement.structVariableName,
        type: statement.type,
        expressionList: statement.expressionList.map((it) =>
          renameExpressionForSSA(it, parameters)
        ),
      });
    case 'HighIRReturnStatement':
      return HIR_RETURN(renameExpressionForSSA(statement.expression, parameters));
  }
};

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
    const parameters = new Set(highIRFunction.parameters);
    return [
      ...statements
        .slice(0, statements.length - 2)
        .map((it) => renameStatementForSSA(it, parameters)),
      ...highIRFunction.parameters.map((name, i) =>
        HIR_LET({
          name,
          type: checkNotNull(highIRFunction.type.argumentTypes[i]),
          assignedExpression: renameExpressionForSSA(
            checkNotNull(functionArguments[i]),
            parameters
          ),
        })
      ),
      ...highIRFunction.parameters.map((name, i) =>
        HIR_LET({
          name: rewriteFunctionParameterReadForTailRecursion(name),
          type: checkNotNull(highIRFunction.type.argumentTypes[i]),
          assignedExpression: HIR_VARIABLE(
            name,
            checkNotNull(highIRFunction.type.argumentTypes[i])
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
    parameters: highIRFunction.parameters,
    body: [
      ...highIRFunction.parameters.map((name, i) => {
        const type = checkNotNull(highIRFunction.type.argumentTypes[i]);
        return HIR_LET({
          name: rewriteFunctionParameterReadForTailRecursion(name),
          type,
          assignedExpression: HIR_VARIABLE(name, type),
        });
      }),
      HIR_WHILE_TRUE(highIRFunction.parameters, potentialRewrittenStatements),
    ],
  };
};

export default performTailRecursiveCallTransformationOnHighIRFunction;
