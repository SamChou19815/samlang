import {
  ifElseOrNull,
  singleIfOrNull,
  LocalValueContextForOptimization,
} from './hir-optimization-common';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HighIRBinaryStatement,
  HighIRStatement,
  HighIRVariableExpression,
  HighIRIntLiteralExpression,
  debugPrintHighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_STRUCT_INITIALIZATION,
  HIR_CAST,
  HIR_RETURN,
  HIR_INT,
} from 'samlang-core-ast/hir-expressions';
import createHighIRFlexibleOrderOperatorNode from 'samlang-core-ast/hir-flexible-op';
import { error, Long, isNotNull, zip3, LocalStackedContext } from 'samlang-core-utils';

const longOfBool = (b: boolean) => (b ? Long.ONE : Long.ZERO);

const evaluateBinaryExpression = (operator: IROperator, v1: Long, v2: Long): Long | null => {
  switch (operator) {
    case '+':
      return v1.add(v2);
    case '-':
      return v1.subtract(v2);
    case '*':
      return v1.multiply(v2);
    case '/':
      return v2.equals(Long.ZERO) ? null : v1.divide(v2);
    case '%':
      return v2.equals(Long.ZERO) ? null : v1.mod(v2);
    case '^':
      return v1.xor(v2);
    case '<':
      return longOfBool(v1.lessThan(v2));
    case '<=':
      return longOfBool(v1.lessThanOrEqual(v2));
    case '>':
      return longOfBool(v1.greaterThan(v2));
    case '>=':
      return longOfBool(v1.greaterThanOrEqual(v2));
    case '==':
      return longOfBool(v1.equals(v2));
    case '!=':
      return longOfBool(v1.notEquals(v2));
  }
};

type BinaryExpression = {
  readonly operator: IROperator;
  readonly e1: HighIRVariableExpression;
  readonly e2: HighIRIntLiteralExpression;
};

const mergeBinaryExpression = (
  outerOperator: IROperator,
  inner: BinaryExpression,
  outerConstant: Long
): BinaryExpression | null => {
  switch (outerOperator) {
    case '+':
      if (inner.operator === '+') {
        return {
          operator: '+',
          e1: inner.e1,
          e2: HIR_INT(inner.e2.value.add(outerConstant)),
        };
      }
      return null;
    case '*':
      if (inner.operator === '*') {
        return {
          operator: '*',
          e1: inner.e1,
          e2: HIR_INT(inner.e2.value.multiply(outerConstant)),
        };
      }
      return null;
    default:
      return null;
  }
};

class BinaryExpressionContext extends LocalStackedContext<BinaryExpression> {}

const optimizeHighIRStatement = (
  statement: HighIRStatement,
  valueContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext
): readonly HighIRStatement[] => {
  const optimizeExpression = (expression: HighIRExpression): HighIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
      case 'HighIRNameExpression':
        return expression;
      case 'HighIRVariableExpression': {
        const binded = valueContext.getLocalValueType(expression.name);
        return binded ?? expression;
      }
    }
  };

  const withNestedScope = <T>(block: () => T): T =>
    valueContext.withNestedScope(() => binaryExpressionContext.withNestedScope(block));

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement': {
      const pointerExpression = optimizeExpression(statement.pointerExpression);
      return [{ ...statement, pointerExpression }];
    }

    case 'HighIRBinaryStatement': {
      const e1 = optimizeExpression(statement.e1);
      const e2 = optimizeExpression(statement.e2);
      const { name, operator } = statement;
      if (e2.__type__ === 'HighIRIntLiteralExpression') {
        const v2 = e2.value;
        if (v2.equals(0)) {
          if (operator === '+') {
            valueContext.bind(name, e1);
            return [];
          }
          if (operator === '*') {
            valueContext.bind(name, HIR_ZERO);
            return [];
          }
        }
        if (v2.equals(1)) {
          if (operator === '%') {
            valueContext.bind(name, HIR_ZERO);
            return [];
          }
          if (operator === '*' || operator === '/') {
            valueContext.bind(name, e1);
            return [];
          }
        }
        if (e1.__type__ === 'HighIRIntLiteralExpression') {
          const v1 = e1.value;
          const value = evaluateBinaryExpression(operator, v1, v2);
          if (value != null) {
            valueContext.bind(name, {
              __type__: 'HighIRIntLiteralExpression',
              value,
              type: statement.type,
            });
            return [];
          }
        }
      }
      if (
        e1.__type__ === 'HighIRVariableExpression' &&
        e2.__type__ === 'HighIRVariableExpression' &&
        e1.name === e2.name
      ) {
        if (operator === '-' || operator === '%') {
          valueContext.bind(name, HIR_ZERO);
          return [];
        }
        if (operator === '/') {
          valueContext.bind(name, HIR_ONE);
          return [];
        }
      }
      const partiallyOptimizedStatement: HighIRBinaryStatement = {
        ...statement,
        ...createHighIRFlexibleOrderOperatorNode(statement.operator, e1, e2),
      };
      if (
        partiallyOptimizedStatement.e1.__type__ === 'HighIRVariableExpression' &&
        partiallyOptimizedStatement.e2.__type__ === 'HighIRIntLiteralExpression'
      ) {
        const existingBinaryForE1 = binaryExpressionContext.getLocalValueType(
          partiallyOptimizedStatement.e1.name
        );
        if (existingBinaryForE1 != null) {
          const merged = mergeBinaryExpression(
            partiallyOptimizedStatement.operator,
            existingBinaryForE1,
            partiallyOptimizedStatement.e2.value
          );
          if (merged != null) return [{ ...partiallyOptimizedStatement, ...merged }];
        }
        binaryExpressionContext.addLocalValueType(
          partiallyOptimizedStatement.name,
          {
            operator: partiallyOptimizedStatement.operator,
            e1: partiallyOptimizedStatement.e1,
            e2: partiallyOptimizedStatement.e2,
          },
          error
        );
      }
      return [partiallyOptimizedStatement];
    }

    case 'HighIRFunctionCallStatement':
      return [
        HIR_FUNCTION_CALL({
          functionExpression: optimizeExpression(statement.functionExpression),
          functionArguments: statement.functionArguments.map(optimizeExpression),
          returnType: statement.returnType,
          returnCollector: statement.returnCollector,
        }),
      ];

    case 'HighIRIfElseStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'HighIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value.toInt());
        const statements = optimizeHighIRStatements(
          isTrue ? statement.s1 : statement.s2,
          valueContext,
          binaryExpressionContext
        );
        statement.finalAssignments.forEach((final) => {
          valueContext.bind(
            final.name,
            isTrue ? optimizeExpression(final.branch1Value) : optimizeExpression(final.branch2Value)
          );
        });
        return statements;
      }
      const [s1, branch1Values] = withNestedScope(() => {
        const statements = optimizeHighIRStatements(
          statement.s1,
          valueContext,
          binaryExpressionContext
        );
        return [
          statements,
          statement.finalAssignments.map((final) => optimizeExpression(final.branch1Value)),
        ] as const;
      });
      const [s2, branch2Values] = withNestedScope(() => {
        const statements = optimizeHighIRStatements(
          statement.s2,
          valueContext,
          binaryExpressionContext
        );
        return [
          statements,
          statement.finalAssignments.map((final) => optimizeExpression(final.branch2Value)),
        ] as const;
      });
      const finalAssignments = zip3(branch1Values, branch2Values, statement.finalAssignments)
        .map(([branch1Value, branch2Value, final]) => {
          if (
            debugPrintHighIRExpression(branch1Value) === debugPrintHighIRExpression(branch2Value)
          ) {
            valueContext.bind(final.name, branch1Value);
            return null;
          }
          return { ...final, branch1Value, branch2Value };
        })
        .filter(isNotNull);
      return ifElseOrNull(HIR_IF_ELSE({ booleanExpression, s1, s2, finalAssignments }));
    }

    case 'HighIRSingleIfStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'HighIRIntLiteralExpression') {
        const isTrue = Boolean(
          booleanExpression.value.xor(Number(statement.invertCondition)).toInt()
        );
        if (isTrue) {
          return optimizeHighIRStatements(
            statement.statements,
            valueContext,
            binaryExpressionContext
          );
        }
        return [];
      }
      const statements = optimizeHighIRStatements(
        statement.statements,
        valueContext,
        binaryExpressionContext
      );
      return singleIfOrNull(
        HIR_SINGLE_IF({ booleanExpression, invertCondition: statement.invertCondition, statements })
      );
    }

    case 'HighIRBreakStatement':
      return [HIR_BREAK(optimizeExpression(statement.breakValue))];

    case 'HighIRWhileStatement': {
      const filteredLoopVariables = statement.loopVariables
        .map((it) => {
          if (
            debugPrintHighIRExpression(it.initialValue) === debugPrintHighIRExpression(it.loopValue)
          ) {
            valueContext.bind(it.name, it.initialValue);
            return null;
          }
          return it;
        })
        .filter(isNotNull);
      const loopVariableInitialValues = filteredLoopVariables.map((it) =>
        optimizeExpression(it.initialValue)
      );
      const [statements, loopVariableLoopValues] = withNestedScope(() => {
        const newStatements = optimizeHighIRStatements(
          statement.statements,
          valueContext,
          binaryExpressionContext
        );
        return [
          newStatements,
          filteredLoopVariables.map((it) => optimizeExpression(it.loopValue)),
        ] as const;
      });
      const loopVariables = zip3(
        loopVariableInitialValues,
        loopVariableLoopValues,
        filteredLoopVariables
      ).map(([initialValue, loopValue, variable]) => ({ ...variable, initialValue, loopValue }));
      return [HIR_WHILE({ loopVariables, statements, breakCollector: statement.breakCollector })];
    }

    case 'HighIRCastStatement':
      return [
        HIR_CAST({
          name: statement.name,
          type: statement.type,
          assignedExpression: optimizeExpression(statement.assignedExpression),
        }),
      ];

    case 'HighIRStructInitializationStatement':
      return [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type: statement.type,
          expressionList: statement.expressionList.map(optimizeExpression),
        }),
      ];

    case 'HighIRReturnStatement':
      return [HIR_RETURN(optimizeExpression(statement.expression))];
  }
};

const optimizeHighIRStatements = (
  statements: readonly HighIRStatement[],
  valueContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext
): readonly HighIRStatement[] =>
  statements.flatMap((it) => optimizeHighIRStatement(it, valueContext, binaryExpressionContext));

const optimizeHighIRStatementsByConditionalConstantPropagation = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] =>
  optimizeHighIRStatements(
    statements,
    new LocalValueContextForOptimization(),
    new LocalStackedContext()
  );

export default optimizeHighIRStatementsByConditionalConstantPropagation;
