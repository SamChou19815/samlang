import {
  HighIRNameExpression,
  HighIRExpression,
  HighIRStatement,
  HighIRFunction,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_STRUCT_INITIALIZATION,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';
import { error, isNotNull, LocalStackedContext, zip, zip3 } from 'samlang-core-utils';

import {
  IndexAccessBindedValue,
  BinaryBindedValue,
  BindedValue,
  bindedValueToString,
} from './hir-optimization-common';

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

function optimizeHighIRExpression(
  expression: HighIRExpression,
  variableContext: LocalVariableContext
): HighIRExpression {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression': {
      const binded = variableContext.getLocalValueType(expression.name);
      return { ...expression, name: binded ?? expression.name };
    }
  }
}

function optimizeHighIRStatement(
  statement: HighIRStatement,
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): HighIRStatement | null {
  const getExpressionUnderContext = (expression: HighIRExpression) =>
    optimizeHighIRExpression(expression, variableContext);

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement': {
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

    case 'HighIRBinaryStatement': {
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

    case 'HighIRFunctionCallStatement':
      return HIR_FUNCTION_CALL({
        functionExpression: getExpressionUnderContext(
          statement.functionExpression
        ) as HighIRNameExpression,
        functionArguments: statement.functionArguments.map(getExpressionUnderContext),
        returnType: statement.returnType,
        returnCollector: statement.returnCollector,
      });

    case 'HighIRIfElseStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      const [s1, branch1Values] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const statements = optimizeHighIRStatements(
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
          const statements = optimizeHighIRStatements(
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
      return HIR_IF_ELSE({
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

    case 'HighIRSingleIfStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      const statements = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() =>
          optimizeHighIRStatements(statement.statements, variableContext, bindedValueContext)
        )
      );
      return HIR_SINGLE_IF({
        booleanExpression,
        invertCondition: statement.invertCondition,
        statements,
      });
    }

    case 'HighIRBreakStatement':
      return HIR_BREAK(getExpressionUnderContext(statement.breakValue));

    case 'HighIRWhileStatement': {
      const loopVariableWithoutLoopValues = statement.loopVariables.map(
        ({ name, type, initialValue }) => ({
          name,
          type,
          initialValue: getExpressionUnderContext(initialValue),
        })
      );
      const [statements, loopVariableLoopValues] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const newStatements = optimizeHighIRStatements(
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
      return HIR_WHILE({ loopVariables, statements, breakCollector: statement.breakCollector });
    }

    case 'HighIRStructInitializationStatement':
      return HIR_STRUCT_INITIALIZATION({
        structVariableName: statement.structVariableName,
        type: statement.type,
        expressionList: statement.expressionList.map(getExpressionUnderContext),
      });

    case 'HighIRClosureInitializationStatement':
      return HIR_CLOSURE_INITIALIZATION({
        closureVariableName: statement.closureVariableName,
        closureType: statement.closureType,
        functionName: statement.functionName,
        functionType: statement.functionType,
        context: getExpressionUnderContext(statement.context),
      });
  }
}

function optimizeHighIRStatements(
  statements: readonly HighIRStatement[],
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): readonly HighIRStatement[] {
  return statements
    .map((it) => optimizeHighIRStatement(it, variableContext, bindedValueContext))
    .filter(isNotNull);
}

export default function optimizeHighIRFunctionByLocalValueNumbering(
  highIRFunction: HighIRFunction
): HighIRFunction {
  const variableContext = new LocalVariableContext();
  const bindedValueContext = new LocalBindedValueContext();
  const body = optimizeHighIRStatements(highIRFunction.body, variableContext, bindedValueContext);
  const returnValue = optimizeHighIRExpression(highIRFunction.returnValue, variableContext);
  return { ...highIRFunction, body, returnValue };
}
