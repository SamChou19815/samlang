import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HighIRStatement,
  debugPrintHighIRExpression as expressionToString,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_STRUCT_INITIALIZATION,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { checkNotNull, error, isNotNull, LocalStackedContext } from 'samlang-core-utils';

type IndexAccessBindedValue = {
  readonly __type__: 'IndexAccess';
  readonly pointerExpression: HighIRExpression;
  readonly index: number;
};

type BinaryBindedValue = {
  readonly __type__: 'Binary';
  readonly operator: IROperator;
  readonly e1: HighIRExpression;
  readonly e2: HighIRExpression;
};

type BindedValue = IndexAccessBindedValue | BinaryBindedValue;

const bindedValueToString = (value: BindedValue): string => {
  switch (value.__type__) {
    case 'IndexAccess':
      return `${expressionToString(value.pointerExpression)}[${value.index}]`;
    case 'Binary':
      return `(${expressionToString(value.e1)}${value.operator}${expressionToString(value.e2)})`;
  }
};

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

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement': {
      const pointerExpression = getExpressionUnderContext(statement.pointerExpression);
      const value: IndexAccessBindedValue = {
        __type__: 'IndexAccess',
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
        returnCollector: statement.returnCollector,
      });

    case 'HighIRIfElseStatement': {
      const booleanExpression = getExpressionUnderContext(statement.booleanExpression);
      if (statement.finalAssignment == null) {
        const s1 = variableContext.withNestedScope(() =>
          bindedValueContext.withNestedScope(() =>
            optimizeHighIRStatements(statement.s1, variableContext, bindedValueContext)
          )
        );
        const s2 = variableContext.withNestedScope(() =>
          bindedValueContext.withNestedScope(() =>
            optimizeHighIRStatements(statement.s2, variableContext, bindedValueContext)
          )
        );
        return HIR_IF_ELSE({ booleanExpression, s1, s2 });
      }
      const final = statement.finalAssignment;
      const [s1, branch1Value] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const statements = optimizeHighIRStatements(
            statement.s1,
            variableContext,
            bindedValueContext
          );
          return [statements, getExpressionUnderContext(final.branch1Value)] as const;
        })
      );
      const [s2, branch2Value] = variableContext.withNestedScope(() =>
        bindedValueContext.withNestedScope(() => {
          const statements = optimizeHighIRStatements(
            statement.s2,
            variableContext,
            bindedValueContext
          );
          return [statements, getExpressionUnderContext(final.branch2Value)] as const;
        })
      );
      return HIR_IF_ELSE({
        booleanExpression,
        s1,
        s2,
        finalAssignment: { ...final, branch1Value, branch2Value },
      });
    }

    case 'HighIRSwitchStatement': {
      const caseVariable =
        variableContext.getLocalValueType(statement.caseVariable) ?? statement.caseVariable;
      const final = statement.finalAssignment;
      if (final == null) {
        const cases = statement.cases.map(({ caseNumber, statements }) => ({
          caseNumber,
          statements: variableContext.withNestedScope(() =>
            bindedValueContext.withNestedScope(() =>
              optimizeHighIRStatements(statements, variableContext, bindedValueContext)
            )
          ),
        }));
        return HIR_SWITCH({ caseVariable, cases });
      }
      const casesWithValue = statement.cases.map(({ caseNumber, statements }, i) =>
        variableContext.withNestedScope(() =>
          bindedValueContext.withNestedScope(() => {
            const newStatements = optimizeHighIRStatements(
              statements,
              variableContext,
              bindedValueContext
            );
            const finalValue = getExpressionUnderContext(checkNotNull(final.branchValues[i]));
            return { caseNumber, newStatements, finalValue };
          })
        )
      );
      return HIR_SWITCH({
        caseVariable,
        cases: casesWithValue.map((it) => ({
          caseNumber: it.caseNumber,
          statements: it.newStatements,
        })),
        finalAssignment: { ...final, branchValues: casesWithValue.map((it) => it.finalValue) },
      });
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