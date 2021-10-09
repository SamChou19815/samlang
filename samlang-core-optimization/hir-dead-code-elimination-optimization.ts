import type { HighIRExpression, HighIRStatement, HighIRFunction } from 'samlang-core/ast/hir-nodes';
import { filterMap } from 'samlang-core/utils';

import { ifElseOrNull } from './hir-optimization-common';

export function collectUseFromHighIRExpression(
  expression: HighIRExpression,
  set: Set<string>
): void {
  if (expression.__type__ === 'HighIRVariableExpression') set.add(expression.name);
}

export function collectUseFromHighIRStatement(statement: HighIRStatement, set: Set<string>): void {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      collectUseFromHighIRExpression(statement.pointerExpression, set);
      return;
    case 'HighIRBinaryStatement':
      collectUseFromHighIRExpression(statement.e1, set);
      collectUseFromHighIRExpression(statement.e2, set);
      return;
    case 'HighIRFunctionCallStatement':
      collectUseFromHighIRExpression(statement.functionExpression, set);
      statement.functionArguments.forEach((it) => collectUseFromHighIRExpression(it, set));
      return;
    case 'HighIRIfElseStatement':
      statement.finalAssignments.forEach((finalAssignment) => {
        collectUseFromHighIRExpression(finalAssignment.branch1Value, set);
        collectUseFromHighIRExpression(finalAssignment.branch2Value, set);
      });
      statement.s1.forEach((it) => collectUseFromHighIRStatement(it, set));
      statement.s2.forEach((it) => collectUseFromHighIRStatement(it, set));
      collectUseFromHighIRExpression(statement.booleanExpression, set);
      return;
    case 'HighIRSingleIfStatement':
      statement.statements.forEach((it) => collectUseFromHighIRStatement(it, set));
      collectUseFromHighIRExpression(statement.booleanExpression, set);
      return;
    case 'HighIRBreakStatement':
      collectUseFromHighIRExpression(statement.breakValue, set);
      return;
    case 'HighIRWhileStatement': {
      statement.loopVariables.forEach((it) => {
        collectUseFromHighIRExpression(it.initialValue, set);
        collectUseFromHighIRExpression(it.loopValue, set);
      });
      statement.statements.forEach((it) => collectUseFromHighIRStatement(it, set));
      return;
    }
    case 'HighIRStructInitializationStatement':
      statement.expressionList.forEach((it) => collectUseFromHighIRExpression(it, set));
      return;
    case 'HighIRClosureInitializationStatement':
      collectUseFromHighIRExpression(statement.context, set);
      return;
  }
}

function optimizeHighIRStatement(
  statement: HighIRStatement,
  set: Set<string>
): readonly HighIRStatement[] {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      if (!set.has(statement.name)) return [];
      collectUseFromHighIRExpression(statement.pointerExpression, set);
      return [statement];
    case 'HighIRBinaryStatement':
      if (!set.has(statement.name) && statement.operator !== '/' && statement.operator !== '%') {
        return [];
      }
      collectUseFromHighIRExpression(statement.e1, set);
      collectUseFromHighIRExpression(statement.e2, set);
      return [statement];
    case 'HighIRFunctionCallStatement': {
      const returnCollector =
        statement.returnCollector != null && set.has(statement.returnCollector)
          ? statement.returnCollector
          : undefined;
      collectUseFromHighIRExpression(statement.functionExpression, set);
      statement.functionArguments.forEach((it) => collectUseFromHighIRExpression(it, set));
      return [{ ...statement, returnCollector }];
    }
    case 'HighIRIfElseStatement': {
      const finalAssignments = filterMap(statement.finalAssignments, (finalAssignment) => {
        if (set.has(finalAssignment.name)) {
          collectUseFromHighIRExpression(finalAssignment.branch1Value, set);
          collectUseFromHighIRExpression(finalAssignment.branch2Value, set);
          return finalAssignment;
        }
        return null;
      });
      const s1 = internalOptimizeHighIRStatementsByDCE(statement.s1, set);
      const s2 = internalOptimizeHighIRStatementsByDCE(statement.s2, set);
      const ifElse = ifElseOrNull({ ...statement, s1, s2, finalAssignments });
      if (ifElse.length > 0) collectUseFromHighIRExpression(statement.booleanExpression, set);
      return ifElse;
    }
    case 'HighIRSingleIfStatement': {
      const statements = internalOptimizeHighIRStatementsByDCE(statement.statements, set);
      if (statements.length === 0) return [];
      collectUseFromHighIRExpression(statement.booleanExpression, set);
      return [{ ...statement, statements }];
    }
    case 'HighIRBreakStatement': {
      collectUseFromHighIRExpression(statement.breakValue, set);
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
      usedLoopVariablesInsideLoop.forEach((it) =>
        collectUseFromHighIRExpression(it.loopValue, set)
      );
      const statements = internalOptimizeHighIRStatementsByDCE(statement.statements, set);
      const loopVariables = filterMap(usedLoopVariablesInsideLoop, (variable) => {
        if (!set.has(variable.name)) return null;
        collectUseFromHighIRExpression(variable.initialValue, set);
        return variable;
      });
      return [{ ...statement, loopVariables, statements, breakCollector }];
    }
    case 'HighIRStructInitializationStatement':
      if (!set.has(statement.structVariableName)) return [];
      statement.expressionList.forEach((it) => collectUseFromHighIRExpression(it, set));
      return [statement];
    case 'HighIRClosureInitializationStatement':
      if (!set.has(statement.closureVariableName)) return [];
      collectUseFromHighIRExpression(statement.context, set);
      return [statement];
  }
}

export function internalOptimizeHighIRStatementsByDCE(
  statements: readonly HighIRStatement[],
  set: Set<string>
): readonly HighIRStatement[] {
  return [...statements]
    .reverse()
    .flatMap((it) => optimizeHighIRStatement(it, set))
    .reverse();
}

export default function optimizeHighIRFunctionByDeadCodeElimination(
  highIRFunction: HighIRFunction
): HighIRFunction {
  const set = new Set<string>();
  collectUseFromHighIRExpression(highIRFunction.returnValue, set);
  const body = internalOptimizeHighIRStatementsByDCE(highIRFunction.body, set);
  return { ...highIRFunction, body };
}
