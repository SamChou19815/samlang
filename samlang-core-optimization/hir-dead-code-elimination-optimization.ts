import { ifElseOrNull, switchOrNull } from './hir-optimization-common';

import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import { isNotNull } from 'samlang-core-utils';

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
      const finalAssignments = statement.finalAssignments
        .map((finalAssignment) => {
          if (set.has(finalAssignment.name)) {
            collectUseFromExpression(finalAssignment.branch1Value);
            collectUseFromExpression(finalAssignment.branch2Value);
            return finalAssignment;
          }
          return null;
        })
        .filter(isNotNull);
      const s1 = optimizeHighIRStatements(statement.s1, set);
      const s2 = optimizeHighIRStatements(statement.s2, set);
      const ifElse = ifElseOrNull({ ...statement, s1, s2, finalAssignments });
      if (ifElse.length > 0) collectUseFromExpression(statement.booleanExpression);
      return ifElse;
    }
    case 'HighIRSwitchStatement': {
      const finalAssignments = statement.finalAssignments
        .map((final) => {
          if (set.has(final.name)) {
            final.branchValues.forEach(collectUseFromExpression);
            return final;
          }
          return null;
        })
        .filter(isNotNull);
      const cases = statement.cases.map((it) => ({
        ...it,
        statements: optimizeHighIRStatements(it.statements, set),
      }));
      const switchStatement = switchOrNull({ ...statement, cases, finalAssignments });
      if (switchStatement.length > 0) set.add(statement.caseVariable);
      return switchStatement;
    }
    case 'HighIRWhileStatement': {
      let returnAssignment = statement.returnAssignment;
      if (returnAssignment != null) {
        if (set.has(returnAssignment.name)) {
          collectUseFromExpression(returnAssignment.value);
        } else {
          returnAssignment = undefined;
        }
      }
      statement.loopVariables.forEach((it) => collectUseFromExpression(it.loopValue));
      collectUseFromExpression(statement.conditionValue);
      const statements = optimizeHighIRStatements(statement.statements, set);
      const loopVariables = statement.loopVariables
        .map((variable) => {
          if (set.has(variable.name)) {
            collectUseFromExpression(variable.initialValue);
            return variable;
          }
          return null;
        })
        .filter(isNotNull);
      return [{ ...statement, loopVariables, statements, returnAssignment }];
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
