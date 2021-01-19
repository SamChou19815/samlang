import {
  IndexAccessBindedValue,
  BinaryBindedValue,
  BindedValue,
  bindedValueToString,
} from './hir-optimization-common';

import {
  HighIRExpression,
  HighIRStatement,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_WHILE,
  HIR_STRUCT_INITIALIZATION,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { error, isNotNull, LocalStackedContext, zip, zip3 } from 'samlang-core-utils';

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

const optimizeHighIRStatement = (
  statement: HighIRStatement,
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): HighIRStatement | null => {
  const getExpressionUnderContext = (expression: HighIRExpression): HighIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
      case 'HighIRNameExpression':
        return expression;
      case 'HighIRVariableExpression': {
        const binded = variableContext.getLocalValueType(expression.name);
        return { ...expression, name: binded ?? expression.name };
      }
    }
  };

  const getNullableExpressionUnderContext = (
    expression: HighIRExpression | null
  ): HighIRExpression | null => (expression == null ? null : getExpressionUnderContext(expression));

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
        functionExpression: getExpressionUnderContext(statement.functionExpression),
        functionArguments: statement.functionArguments.map(getExpressionUnderContext),
        returnType: statement.returnType,
        returnCollector: statement.returnCollector,
      });

    case 'HighIRIfElseStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      const [s1, branch1Values, s1BreakValue] = variableContext.withNestedScope(() =>
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
            getNullableExpressionUnderContext(statement.s1BreakValue),
          ] as const;
        })
      );
      const [s2, branch2Values, s2BreakValue] = variableContext.withNestedScope(() =>
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
            getNullableExpressionUnderContext(statement.s2BreakValue),
          ] as const;
        })
      );
      return HIR_IF_ELSE({
        booleanExpression,
        s1,
        s2,
        s1BreakValue,
        s2BreakValue,
        finalAssignments: zip3(branch1Values, branch2Values, statement.finalAssignments).map(
          ([branch1Value, branch2Value, final]) => ({
            ...final,
            branch1Value,
            branch2Value,
          })
        ),
      });
    }

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
      const loopVariables = zip(
        loopVariableWithoutLoopValues,
        loopVariableLoopValues
      ).map(([rest, loopValue]) => ({ ...rest, loopValue }));
      return HIR_WHILE({ loopVariables, statements, breakCollector: statement.breakCollector });
    }

    case 'HighIRCastStatement':
      return HIR_CAST({
        name: statement.name,
        type: statement.type,
        assignedExpression: getExpressionUnderContext(statement.assignedExpression),
      });

    case 'HighIRStructInitializationStatement':
      return HIR_STRUCT_INITIALIZATION({
        structVariableName: statement.structVariableName,
        type: statement.type,
        expressionList: statement.expressionList.map(getExpressionUnderContext),
      });

    case 'HighIRReturnStatement':
      return HIR_RETURN(getExpressionUnderContext(statement.expression));
  }
};

const optimizeHighIRStatements = (
  statements: readonly HighIRStatement[],
  variableContext: LocalVariableContext,
  bindedValueContext: LocalBindedValueContext
): readonly HighIRStatement[] =>
  statements
    .map((it) => optimizeHighIRStatement(it, variableContext, bindedValueContext))
    .filter(isNotNull);

const optimizeHighIRStatementsByLocalValueNumbering = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] =>
  optimizeHighIRStatements(statements, new LocalVariableContext(), new LocalBindedValueContext());

export default optimizeHighIRStatementsByLocalValueNumbering;
