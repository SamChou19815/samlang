import type { MidIRExpression, MidIRStatement, MidIRFunction } from 'samlang-core-ast/mir-nodes';
import { isNotNull } from 'samlang-core-utils';

import { ifElseOrNull } from './mir-optimization-common';

export function collectUseFromMidIRExpression(expression: MidIRExpression, set: Set<string>): void {
  if (expression.__type__ === 'MidIRVariableExpression') set.add(expression.name);
}

export function collectUseFromMidIRStatement(statement: MidIRStatement, set: Set<string>): void {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      collectUseFromMidIRExpression(statement.pointerExpression, set);
      return;
    case 'MidIRBinaryStatement':
      collectUseFromMidIRExpression(statement.e1, set);
      collectUseFromMidIRExpression(statement.e2, set);
      return;
    case 'MidIRFunctionCallStatement':
      collectUseFromMidIRExpression(statement.functionExpression, set);
      statement.functionArguments.forEach((it) => collectUseFromMidIRExpression(it, set));
      return;
    case 'MidIRIfElseStatement':
      statement.finalAssignments.forEach((finalAssignment) => {
        collectUseFromMidIRExpression(finalAssignment.branch1Value, set);
        collectUseFromMidIRExpression(finalAssignment.branch2Value, set);
      });
      statement.s1.forEach((it) => collectUseFromMidIRStatement(it, set));
      statement.s2.forEach((it) => collectUseFromMidIRStatement(it, set));
      collectUseFromMidIRExpression(statement.booleanExpression, set);
      return;
    case 'MidIRSingleIfStatement':
      statement.statements.forEach((it) => collectUseFromMidIRStatement(it, set));
      collectUseFromMidIRExpression(statement.booleanExpression, set);
      return;
    case 'MidIRBreakStatement':
      collectUseFromMidIRExpression(statement.breakValue, set);
      return;
    case 'MidIRWhileStatement': {
      statement.loopVariables.forEach((it) => {
        collectUseFromMidIRExpression(it.initialValue, set);
        collectUseFromMidIRExpression(it.loopValue, set);
      });
      statement.statements.forEach((it) => collectUseFromMidIRStatement(it, set));
      return;
    }
    case 'MidIRCastStatement':
      collectUseFromMidIRExpression(statement.assignedExpression, set);
      return;
    case 'MidIRStructInitializationStatement':
      statement.expressionList.forEach((it) => collectUseFromMidIRExpression(it, set));
      return;
  }
}

function optimizeMidIRStatement(
  statement: MidIRStatement,
  set: Set<string>
): readonly MidIRStatement[] {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      if (!set.has(statement.name)) return [];
      collectUseFromMidIRExpression(statement.pointerExpression, set);
      return [statement];
    case 'MidIRBinaryStatement':
      if (!set.has(statement.name) && statement.operator !== '/' && statement.operator !== '%') {
        return [];
      }
      collectUseFromMidIRExpression(statement.e1, set);
      collectUseFromMidIRExpression(statement.e2, set);
      return [statement];
    case 'MidIRFunctionCallStatement': {
      const returnCollector =
        statement.returnCollector != null && set.has(statement.returnCollector)
          ? statement.returnCollector
          : undefined;
      collectUseFromMidIRExpression(statement.functionExpression, set);
      statement.functionArguments.forEach((it) => collectUseFromMidIRExpression(it, set));
      return [{ ...statement, returnCollector }];
    }
    case 'MidIRIfElseStatement': {
      const finalAssignments = statement.finalAssignments
        .map((finalAssignment) => {
          if (set.has(finalAssignment.name)) {
            collectUseFromMidIRExpression(finalAssignment.branch1Value, set);
            collectUseFromMidIRExpression(finalAssignment.branch2Value, set);
            return finalAssignment;
          }
          return null;
        })
        .filter(isNotNull);
      const s1 = internalOptimizeMidIRStatementsByDCE(statement.s1, set);
      const s2 = internalOptimizeMidIRStatementsByDCE(statement.s2, set);
      const ifElse = ifElseOrNull({ ...statement, s1, s2, finalAssignments });
      if (ifElse.length > 0) collectUseFromMidIRExpression(statement.booleanExpression, set);
      return ifElse;
    }
    case 'MidIRSingleIfStatement': {
      const statements = internalOptimizeMidIRStatementsByDCE(statement.statements, set);
      if (statements.length === 0) return [];
      collectUseFromMidIRExpression(statement.booleanExpression, set);
      return [{ ...statement, statements }];
    }
    case 'MidIRBreakStatement': {
      collectUseFromMidIRExpression(statement.breakValue, set);
      return [statement];
    }
    case 'MidIRWhileStatement': {
      let breakCollector = statement.breakCollector;
      if (breakCollector != null) {
        if (!set.has(breakCollector.name)) {
          breakCollector = undefined;
        }
      }
      const usedSetInsideLoop = new Set<string>();
      collectUseFromMidIRStatement(statement, usedSetInsideLoop);
      const usedLoopVariablesInsideLoop = statement.loopVariables.filter((it) =>
        usedSetInsideLoop.has(it.name)
      );
      usedLoopVariablesInsideLoop.forEach((it) => collectUseFromMidIRExpression(it.loopValue, set));
      const statements = internalOptimizeMidIRStatementsByDCE(statement.statements, set);
      const loopVariables = usedLoopVariablesInsideLoop
        .map((variable) => {
          if (!set.has(variable.name)) return null;
          collectUseFromMidIRExpression(variable.initialValue, set);
          return variable;
        })
        .filter(isNotNull);
      return [{ ...statement, loopVariables, statements, breakCollector }];
    }
    case 'MidIRCastStatement':
      if (!set.has(statement.name)) return [];
      collectUseFromMidIRExpression(statement.assignedExpression, set);
      return [statement];
    case 'MidIRStructInitializationStatement':
      if (!set.has(statement.structVariableName)) return [];
      statement.expressionList.forEach((it) => collectUseFromMidIRExpression(it, set));
      return [statement];
  }
}

export function internalOptimizeMidIRStatementsByDCE(
  statements: readonly MidIRStatement[],
  set: Set<string>
): readonly MidIRStatement[] {
  return [...statements]
    .reverse()
    .flatMap((it) => optimizeMidIRStatement(it, set))
    .reverse();
}

export default function optimizeMidIRFunctionByDeadCodeElimination(
  midIRFunction: MidIRFunction
): MidIRFunction {
  const set = new Set<string>();
  collectUseFromMidIRExpression(midIRFunction.returnValue, set);
  const body = internalOptimizeMidIRStatementsByDCE(midIRFunction.body, set);
  return { ...midIRFunction, body };
}
