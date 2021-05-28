import {
  MidIRExpression,
  MidIRStatement,
  MidIRWhileStatement,
  MIR_WHILE,
} from 'samlang-core-ast/mir-expressions';
import { isNotNull } from 'samlang-core-utils';

type LoopInvariantCodeMotionOptimizationResult = {
  readonly hoistedStatementsBeforeWhile: readonly MidIRStatement[];
  readonly optimizedWhileStatement: MidIRWhileStatement;
  readonly nonLoopInvariantVariables: ReadonlySet<string>;
};

const optimizeMidIRWhileStatementByLoopInvariantCodeMotion = ({
  loopVariables,
  statements,
  breakCollector,
}: MidIRWhileStatement): LoopInvariantCodeMotionOptimizationResult => {
  const nonLoopInvariantVariables = new Set(loopVariables.map((it) => it.name));

  const expressionIsNotLoopInvariant = (expression: MidIRExpression): boolean => {
    if (expression.__type__ === 'MidIRVariableExpression') {
      return nonLoopInvariantVariables.has(expression.name);
    }
    return false;
  };

  const hoistedStatementsBeforeWhile: MidIRStatement[] = [];
  const innerStatements = statements
    .map((statement) => {
      switch (statement.__type__) {
        case 'MidIRIndexAccessStatement':
          if (expressionIsNotLoopInvariant(statement.pointerExpression)) {
            nonLoopInvariantVariables.add(statement.name);
            return statement;
          }
          hoistedStatementsBeforeWhile.push(statement);
          return null;
        case 'MidIRBinaryStatement':
          if (
            expressionIsNotLoopInvariant(statement.e1) ||
            expressionIsNotLoopInvariant(statement.e2)
          ) {
            nonLoopInvariantVariables.add(statement.name);
            return statement;
          }
          hoistedStatementsBeforeWhile.push(statement);
          return null;
        case 'MidIRCastStatement':
          if (expressionIsNotLoopInvariant(statement.assignedExpression)) {
            nonLoopInvariantVariables.add(statement.name);
            return statement;
          }
          hoistedStatementsBeforeWhile.push(statement);
          return null;
        case 'MidIRStructInitializationStatement':
          if (statement.expressionList.some((it) => expressionIsNotLoopInvariant(it))) {
            nonLoopInvariantVariables.add(statement.structVariableName);
            return statement;
          }
          hoistedStatementsBeforeWhile.push(statement);
          return null;
        case 'MidIRFunctionCallStatement':
          if (statement.returnCollector != null) {
            nonLoopInvariantVariables.add(statement.returnCollector);
          }
          return statement;
        case 'MidIRIfElseStatement':
          statement.finalAssignments.forEach((it) => nonLoopInvariantVariables.add(it.name));
          return statement;
        case 'MidIRSingleIfStatement':
        case 'MidIRBreakStatement':
          return statement;
        case 'MidIRWhileStatement':
          if (statement.breakCollector != null) {
            nonLoopInvariantVariables.add(statement.breakCollector.name);
          }
          return statement;
      }
    })
    .filter(isNotNull);

  return {
    hoistedStatementsBeforeWhile,
    optimizedWhileStatement: MIR_WHILE({
      loopVariables,
      statements: innerStatements,
      breakCollector,
    }),
    nonLoopInvariantVariables,
  };
};

export default optimizeMidIRWhileStatementByLoopInvariantCodeMotion;
