import {
  MidIRExpression,
  MidIRStatement,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_STRUCT_INITIALIZATION,
  MIR_CAST,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction } from 'samlang-core-ast/mir-nodes';
import { error, isNotNull, LocalStackedContext, zip, zip3 } from 'samlang-core-utils';

import {
  IndexAccessBindedValue,
  BinaryBindedValue,
  BindedValue,
  bindedValueToString,
} from './mir-optimization-common';

class LocalVariableContext extends LocalStackedContext<string> {
  addLocalValueType(name: string, value: string, onCollision: () => void): void {
    super.addLocalValueType(name, this.getLocalValueType(value) ?? value, onCollision);
  }

  bind(name: string, value: string): void {
    this.addLocalValueType(name, value, error);
  }
}

class LocalBindedValueContext extends LocalStackedContext<string> {
  get(value: BindedValue): string | undefined {
    return this.getLocalValueType(bindedValueToString(value));
  }

  bind(value: BindedValue, name: string) {
    this.addLocalValueType(bindedValueToString(value), name, error);
  }
}

const optimizeMidIRExpression = (
  expression: MidIRExpression,
  variableContext: LocalVariableContext
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
    case 'MidIRNameExpression':
      return expression;
    case 'MidIRVariableExpression': {
      const binded = variableContext.getLocalValueType(expression.name);
      return { ...expression, name: binded ?? expression.name };
    }
  }
};

const optimizeMidIRStatement = (
  statement: MidIRStatement,
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): MidIRStatement | null => {
  const getExpressionUnderContext = (expression: MidIRExpression) =>
    optimizeMidIRExpression(expression, variableContext);

  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement': {
      const pointerExpression = getExpressionUnderContext(statement.pointerExpression);
      const value: IndexAccessBindedValue = {
        __type__: 'IndexAccess',
        type: statement.type,
        pointerExpression,
        index: statement.index,
      };
      const binded = bindedValueContext.get(value);
      if (binded == null) {
        bindedValueContext.bind(value, statement.name);
        return { ...statement, pointerExpression };
      }
      variableContext.bind(statement.name, binded);
      return null;
    }

    case 'MidIRBinaryStatement': {
      const e1 = getExpressionUnderContext(statement.e1);
      const e2 = getExpressionUnderContext(statement.e2);
      const value: BinaryBindedValue = { __type__: 'Binary', operator: statement.operator, e1, e2 };
      const binded = bindedValueContext.get(value);
      if (binded == null) {
        bindedValueContext.bind(value, statement.name);
        return { ...statement, e1, e2 };
      }
      variableContext.bind(statement.name, binded);
      return null;
    }

    case 'MidIRFunctionCallStatement':
      return MIR_FUNCTION_CALL({
        functionExpression: getExpressionUnderContext(statement.functionExpression),
        functionArguments: statement.functionArguments.map(getExpressionUnderContext),
        returnType: statement.returnType,
        returnCollector: statement.returnCollector,
      });

    case 'MidIRIfElseStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      const [s1, branch1Values] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const statements = optimizeMidIRStatements(
            statement.s1,
            variableContext,
            bindedValueContext
          );
          return [
            statements,
            statement.finalAssignments.map((final) =>
              getExpressionUnderContext(final.branch1Value)
            ),
          ] as const;
        })
      );
      const [s2, branch2Values] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const statements = optimizeMidIRStatements(
            statement.s2,
            variableContext,
            bindedValueContext
          );
          return [
            statements,
            statement.finalAssignments.map((final) =>
              getExpressionUnderContext(final.branch2Value)
            ),
          ] as const;
        })
      );
      return MIR_IF_ELSE({
        booleanExpression,
        s1,
        s2,
        finalAssignments: zip3(branch1Values, branch2Values, statement.finalAssignments).map(
          ([branch1Value, branch2Value, final]) => ({
            ...final,
            branch1Value,
            branch2Value,
          })
        ),
      });
    }

    case 'MidIRSingleIfStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      const statements = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() =>
          optimizeMidIRStatements(statement.statements, variableContext, bindedValueContext)
        )
      );
      return MIR_SINGLE_IF({
        booleanExpression,
        invertCondition: statement.invertCondition,
        statements,
      });
    }

    case 'MidIRBreakStatement':
      return MIR_BREAK(getExpressionUnderContext(statement.breakValue));

    case 'MidIRWhileStatement': {
      const loopVariableWithoutLoopValues = statement.loopVariables.map(
        ({ name, type, initialValue }) => ({
          name,
          type,
          initialValue: getExpressionUnderContext(initialValue),
        })
      );
      const [statements, loopVariableLoopValues] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const newStatements = optimizeMidIRStatements(
            statement.statements,
            variableContext,
            bindedValueContext
          );
          return [
            newStatements,
            statement.loopVariables.map((it) => getExpressionUnderContext(it.loopValue)),
          ];
        })
      );
      const loopVariables = zip(loopVariableWithoutLoopValues, loopVariableLoopValues).map(
        ([rest, loopValue]) => ({ ...rest, loopValue })
      );
      return MIR_WHILE({ loopVariables, statements, breakCollector: statement.breakCollector });
    }

    case 'MidIRCastStatement':
      return MIR_CAST({
        name: statement.name,
        type: statement.type,
        assignedExpression: getExpressionUnderContext(statement.assignedExpression),
      });

    case 'MidIRStructInitializationStatement':
      return MIR_STRUCT_INITIALIZATION({
        structVariableName: statement.structVariableName,
        type: statement.type,
        expressionList: statement.expressionList.map(getExpressionUnderContext),
      });
  }
};

const optimizeMidIRStatements = (
  statements: readonly MidIRStatement[],
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): readonly MidIRStatement[] =>
  statements
    .map((it) => optimizeMidIRStatement(it, variableContext, bindedValueContext))
    .filter(isNotNull);

const optimizeMidIRFunctionByLocalValueNumbering = (
  midIRFunction: MidIRFunction
): MidIRFunction => {
  const variableContext = new LocalVariableContext();
  const bindedValueContext = new LocalBindedValueContext();
  const body = optimizeMidIRStatements(midIRFunction.body, variableContext, bindedValueContext);
  const returnValue = optimizeMidIRExpression(midIRFunction.returnValue, variableContext);
  return { ...midIRFunction, body, returnValue };
};

export default optimizeMidIRFunctionByLocalValueNumbering;
