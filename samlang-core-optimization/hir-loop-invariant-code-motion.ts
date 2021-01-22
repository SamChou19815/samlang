import {
  HighIRExpression,
  HighIRStatement,
  HighIRWhileStatement,
  HIR_WHILE,
} from 'samlang-core-ast/hir-expressions';
import { isNotNull } from 'samlang-core-utils';

type LoopInvariantCodeMotionOptimizationResult = {
  readonly hoistedStatementsBeforeWhile: readonly HighIRStatement[];
  readonly optimizedWhileStatement: HighIRWhileStatement;
  readonly nonLoopInvariantVariables: ReadonlySet<string>;
};

const optimizeHighIRWhileStatementByLoopInvariantCodeMotion = ({
  loopVariables,
  statements,
  breakCollector,
}: HighIRWhileStatement): LoopInvariantCodeMotionOptimizationResult => {
  const nonLoopInvariantVariables = new Set(loopVariables.map((it) => it.name));

  const expressionIsNotLoopInvariant = (expression: HighIRExpression): boolean => {
    if (expression.__type__ === 'HighIRVariableExpression') {
      return nonLoopInvariantVariables.has(expression.name);
    }
    return false;
  };

  const hoistedStatementsBeforeWhile: HighIRStatement[] = [];
  const innerStatements = statements
    .map((statement) => {
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
        case 'HighIRCastStatement':
          if (expressionIsNotLoopInvariant(statement.assignedExpression)) {
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
        case 'HighIRReturnStatement':
          return statement;
        case 'HighIRWhileStatement':
          if (statement.breakCollector != null) {
            nonLoopInvariantVariables.add(statement.breakCollector.name);
          }
          return statement;
      }
    })
    .filter(isNotNull);

  return {
    hoistedStatementsBeforeWhile,
    optimizedWhileStatement: HIR_WHILE({
      loopVariables,
      statements: innerStatements,
      breakCollector,
    }),
    nonLoopInvariantVariables,
  };
};

export default optimizeHighIRWhileStatementByLoopInvariantCodeMotion;
