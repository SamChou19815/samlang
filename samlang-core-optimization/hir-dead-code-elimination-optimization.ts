import { ifElseOrNull, switchOrNull } from './hir-optimization-common';

import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';

const optimizeHighIRStatement = (
  statement: HighIRStatement,
  set: Set<string>
): readonly HighIRStatement[] => {
  const collectUseFromExpression = (expression: HighIRExpression): void => {
    if (expression.__type__ === 'HighIRVariableExpression') set.add(expression.name);
  };

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      if (!set.has(statement.name)) return [];
      collectUseFromExpression(statement.pointerExpression);
      return [statement];
    case 'HighIRBinaryStatement':
      if (!set.has(statement.name) && statement.operator !== '/' && statement.operator !== '%') {
        return [];
      }
      collectUseFromExpression(statement.e1);
      collectUseFromExpression(statement.e2);
      return [statement];
    case 'HighIRFunctionCallStatement': {
      const returnCollector =
        statement.returnCollector != null && set.has(statement.returnCollector)
          ? statement.returnCollector
          : undefined;
      collectUseFromExpression(statement.functionExpression);
      statement.functionArguments.forEach(collectUseFromExpression);
      return [{ ...statement, returnCollector }];
    }
    case 'HighIRIfElseStatement': {
      let finalAssignment: typeof statement.finalAssignment = undefined;
      if (statement.finalAssignment != null && set.has(statement.finalAssignment.name)) {
        collectUseFromExpression(statement.finalAssignment.branch1Value);
        collectUseFromExpression(statement.finalAssignment.branch2Value);
        finalAssignment = statement.finalAssignment;
      }
      const s1 = optimizeHighIRStatements(statement.s1, set);
      const s2 = optimizeHighIRStatements(statement.s2, set);
      const ifElse = ifElseOrNull({ ...statement, s1, s2, finalAssignment });
      if (ifElse.length > 0) collectUseFromExpression(statement.booleanExpression);
      return ifElse;
    }
    case 'HighIRSwitchStatement': {
      let finalAssignment: typeof statement.finalAssignment = undefined;
      if (statement.finalAssignment != null && set.has(statement.finalAssignment.name)) {
        statement.finalAssignment.branchValues.forEach(collectUseFromExpression);
        finalAssignment = statement.finalAssignment;
      }
      const cases = statement.cases.map((it) => ({
        ...it,
        statements: optimizeHighIRStatements(it.statements, set),
      }));
      const switchStatement = switchOrNull({ ...statement, finalAssignment, cases });
      if (switchStatement.length > 0) set.add(statement.caseVariable);
      return switchStatement;
    }
    case 'HighIRCastStatement':
      if (!set.has(statement.name)) return [];
      collectUseFromExpression(statement.assignedExpression);
      return [statement];
    case 'HighIRStructInitializationStatement':
      if (!set.has(statement.structVariableName)) return [];
      statement.expressionList.forEach(collectUseFromExpression);
      return [statement];
    case 'HighIRReturnStatement':
      collectUseFromExpression(statement.expression);
      return [statement];
  }
};

const optimizeHighIRStatements = (
  statements: readonly HighIRStatement[],
  set: Set<string>
): readonly HighIRStatement[] => {
  return [...statements]
    .reverse()
    .flatMap((it) => optimizeHighIRStatement(it, set))
    .reverse();
};

const optimizeHighIRStatementsByDeadCodeElimination = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] => optimizeHighIRStatements(statements, new Set());

export default optimizeHighIRStatementsByDeadCodeElimination;
