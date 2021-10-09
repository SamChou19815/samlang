import {
  HighIRExpression,
  HighIRStatement,
  HighIRWhileStatement,
  HIR_WHILE,
} from '../ast/hir-nodes';
import { filterMap } from '../utils';

type LoopInvariantCodeMotionOptimizationResult = {
  readonly hoistedStatementsBeforeWhile: readonly HighIRStatement[];
  readonly optimizedWhileStatement: HighIRWhileStatement;
  readonly nonLoopInvariantVariables: ReadonlySet<string>;
};

export default function optimizeHighIRWhileStatementByLoopInvariantCodeMotion({
  loopVariables,
  statements,
  breakCollector,
}: HighIRWhileStatement): LoopInvariantCodeMotionOptimizationResult {
  const nonLoopInvariantVariables = new Set(loopVariables.map((it) => it.name));

  function expressionIsNotLoopInvariant(expression: HighIRExpression): boolean {
    return (
      expression.__type__ === 'HighIRVariableExpression' &&
      nonLoopInvariantVariables.has(expression.name)
    );
  }

  const hoistedStatementsBeforeWhile: HighIRStatement[] = [];
  const innerStatements = filterMap(statements, (statement) => {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        if (expressionIsNotLoopInvariant(statement.pointerExpression)) {
          nonLoopInvariantVariables.add(statement.name);
          return statement;
        }
        hoistedStatementsBeforeWhile.push(statement);
        return null;
      case 'HighIRBinaryStatement':
        if (
          expressionIsNotLoopInvariant(statement.e1) ||
          expressionIsNotLoopInvariant(statement.e2)
        ) {
          nonLoopInvariantVariables.add(statement.name);
          return statement;
        }
        hoistedStatementsBeforeWhile.push(statement);
        return null;
      case 'HighIRStructInitializationStatement':
        if (statement.expressionList.some((it) => expressionIsNotLoopInvariant(it))) {
          nonLoopInvariantVariables.add(statement.structVariableName);
          return statement;
        }
        hoistedStatementsBeforeWhile.push(statement);
        return null;
      case 'HighIRClosureInitializationStatement':
        if (expressionIsNotLoopInvariant(statement.context)) {
          nonLoopInvariantVariables.add(statement.closureVariableName);
          return statement;
        }
        hoistedStatementsBeforeWhile.push(statement);
        return null;
      case 'HighIRFunctionCallStatement':
        if (statement.returnCollector != null) {
          nonLoopInvariantVariables.add(statement.returnCollector);
        }
        return statement;
      case 'HighIRIfElseStatement':
        statement.finalAssignments.forEach((it) => nonLoopInvariantVariables.add(it.name));
        return statement;
      case 'HighIRSingleIfStatement':
      case 'HighIRBreakStatement':
        return statement;
      case 'HighIRWhileStatement':
        if (statement.breakCollector != null) {
          nonLoopInvariantVariables.add(statement.breakCollector.name);
        }
        return statement;
    }
  });

  return {
    hoistedStatementsBeforeWhile,
    optimizedWhileStatement: HIR_WHILE({
      loopVariables,
      statements: innerStatements,
      breakCollector,
    }),
    nonLoopInvariantVariables,
  };
}
