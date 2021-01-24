import { ifElseOrNull } from './hir-optimization-common';

import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import { isNotNull } from 'samlang-core-utils';

const collectUseFromHighIRStatement = (statement: HighIRStatement, set: Set<string>): void => {
  const collectUseFromExpression = (expression: HighIRExpression): void => {
    if (expression.__type__ === 'HighIRVariableExpression') set.add(expression.name);
  };

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      collectUseFromExpression(statement.pointerExpression);
      return;
    case 'HighIRBinaryStatement':
      collectUseFromExpression(statement.e1);
      collectUseFromExpression(statement.e2);
      return;
    case 'HighIRFunctionCallStatement':
      collectUseFromExpression(statement.functionExpression);
      statement.functionArguments.forEach(collectUseFromExpression);
      return;
    case 'HighIRIfElseStatement':
      statement.finalAssignments.forEach((finalAssignment) => {
        collectUseFromExpression(finalAssignment.branch1Value);
        collectUseFromExpression(finalAssignment.branch2Value);
      });
      statement.s1.forEach((it) => collectUseFromHighIRStatement(it, set));
      statement.s2.forEach((it) => collectUseFromHighIRStatement(it, set));
      collectUseFromExpression(statement.booleanExpression);
      return;
    case 'HighIRSingleIfStatement':
      statement.statements.forEach((it) => collectUseFromHighIRStatement(it, set));
      collectUseFromExpression(statement.booleanExpression);
      return;
    case 'HighIRBreakStatement':
      collectUseFromExpression(statement.breakValue);
      return;
    case 'HighIRWhileStatement': {
      statement.loopVariables.forEach((it) => {
        collectUseFromExpression(it.initialValue);
        collectUseFromExpression(it.loopValue);
      });
      statement.statements.forEach((it) => collectUseFromHighIRStatement(it, set));
      statement.loopVariables.forEach((variable) => {
        collectUseFromExpression(variable.initialValue);
      });
      return;
    }
    case 'HighIRCastStatement':
      collectUseFromExpression(statement.assignedExpression);
      return;
    case 'HighIRStructInitializationStatement':
      statement.expressionList.forEach(collectUseFromExpression);
      return;
    // istanbul ignore next
    case 'HighIRReturnStatement':
      // istanbul ignore next
      collectUseFromExpression(statement.expression);
  }
};

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
      const s1 = internalOptimizeHighIRStatementsByDCE(statement.s1, set);
      const s2 = internalOptimizeHighIRStatementsByDCE(statement.s2, set);
      const ifElse = ifElseOrNull({ ...statement, s1, s2, finalAssignments });
      if (ifElse.length > 0) collectUseFromExpression(statement.booleanExpression);
      return ifElse;
    }
    case 'HighIRSingleIfStatement': {
      const statements = internalOptimizeHighIRStatementsByDCE(statement.statements, set);
      if (statements.length === 0) return [];
      collectUseFromExpression(statement.booleanExpression);
      return [{ ...statement, statements }];
    }
    case 'HighIRBreakStatement': {
      collectUseFromExpression(statement.breakValue);
      return [statement];
    }
    case 'HighIRWhileStatement': {
      let breakCollector = statement.breakCollector;
      if (breakCollector != null) {
        if (!set.has(breakCollector.name)) {
          breakCollector = undefined;
        }
      }
      const usedSetInsideLoop = new Set<string>();
      collectUseFromHighIRStatement(statement, usedSetInsideLoop);
      const usedLoopVariablesInsideLoop = statement.loopVariables.filter((it) =>
        usedSetInsideLoop.has(it.name)
      );
      usedLoopVariablesInsideLoop.forEach((it) => collectUseFromExpression(it.loopValue));
      const statements = internalOptimizeHighIRStatementsByDCE(statement.statements, set);
      const loopVariables = usedLoopVariablesInsideLoop
        .map((variable) => {
          // istanbul ignore next
          if (!set.has(variable.name)) return null;
          collectUseFromExpression(variable.initialValue);
          return variable;
        })
        .filter(isNotNull);
      return [{ ...statement, loopVariables, statements, breakCollector }];
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

export const internalOptimizeHighIRStatementsByDCE = (
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
): readonly HighIRStatement[] => internalOptimizeHighIRStatementsByDCE(statements, new Set());

export default optimizeHighIRStatementsByDeadCodeElimination;
