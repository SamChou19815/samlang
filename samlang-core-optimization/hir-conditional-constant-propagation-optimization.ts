import {
  ifElseOrNull,
  switchOrNull,
  LocalValueContextForOptimization,
} from './hir-optimization-common';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HighIRStatement,
  debugPrintHighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_STRUCT_INITIALIZATION,
  HIR_CAST,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { Long, checkNotNull } from 'samlang-core-utils';

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

const optimizeHighIRStatement = (
  statement: HighIRStatement,
  context: LocalValueContextForOptimization
): readonly HighIRStatement[] => {
  const optimizeExpression = (expression: HighIRExpression): HighIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
      case 'HighIRNameExpression':
        return expression;
      case 'HighIRVariableExpression': {
        const binded = context.getLocalValueType(expression.name);
        return binded ?? expression;
      }
    }
  };

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
            context.bind(name, e1);
            return [];
          }
          if (operator === '*') {
            context.bind(name, HIR_ZERO);
            return [];
          }
        }
        if (v2.equals(1)) {
          if (operator === '%') {
            context.bind(name, HIR_ZERO);
            return [];
          }
          if (operator === '*' || operator === '/') {
            context.bind(name, e1);
            return [];
          }
        }
        if (e1.__type__ === 'HighIRIntLiteralExpression') {
          const v1 = e1.value;
          const value = evaluateBinaryExpression(operator, v1, v2);
          if (value != null) {
            context.bind(name, {
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
          context.bind(name, HIR_ZERO);
          return [];
        }
        if (operator === '/') {
          context.bind(name, HIR_ONE);
          return [];
        }
      }
      return [{ ...statement, e1, e2 }];
    }

    case 'HighIRFunctionCallStatement':
      return [
        HIR_FUNCTION_CALL({
          functionExpression: optimizeExpression(statement.functionExpression),
          functionArguments: statement.functionArguments.map(optimizeExpression),
          returnCollector: statement.returnCollector,
        }),
      ];

    case 'HighIRIfElseStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'HighIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value.toInt());
        if (statement.finalAssignment == null) {
          return isTrue
            ? optimizeHighIRStatements(statement.s1, context)
            : optimizeHighIRStatements(statement.s2, context);
        }
        const final = statement.finalAssignment;
        const statements = optimizeHighIRStatements(isTrue ? statement.s1 : statement.s2, context);
        context.bind(final.name, isTrue ? final.branch1Value : final.branch2Value);
        return statements;
      }
      if (statement.finalAssignment == null) {
        const s1 = context.withNestedScope(() => optimizeHighIRStatements(statement.s1, context));
        const s2 = context.withNestedScope(() => optimizeHighIRStatements(statement.s2, context));
        return ifElseOrNull(HIR_IF_ELSE({ booleanExpression, s1, s2 }));
      }
      const final = statement.finalAssignment;
      const [s1, branch1Value] = context.withNestedScope(() => {
        const statements = optimizeHighIRStatements(statement.s1, context);
        return [statements, optimizeExpression(final.branch1Value)] as const;
      });
      const [s2, branch2Value] = context.withNestedScope(() => {
        const statements = optimizeHighIRStatements(statement.s2, context);
        return [statements, optimizeExpression(final.branch2Value)] as const;
      });
      if (debugPrintHighIRExpression(branch1Value) === debugPrintHighIRExpression(branch2Value)) {
        const ifElse = ifElseOrNull(HIR_IF_ELSE({ booleanExpression, s1, s2 }));
        context.bind(final.name, branch1Value);
        return ifElse;
      }
      return [
        HIR_IF_ELSE({
          booleanExpression,
          s1,
          s2,
          finalAssignment: { ...final, branch1Value, branch2Value },
        }),
      ];
    }

    case 'HighIRSwitchStatement': {
      const final = statement.finalAssignment;
      if (final == null) {
        const cases = statement.cases.map(({ caseNumber, statements }) => ({
          caseNumber,
          statements: context.withNestedScope(() => optimizeHighIRStatements(statements, context)),
        }));
        return switchOrNull(HIR_SWITCH({ caseVariable: statement.caseVariable, cases }));
      }
      const casesWithValue = statement.cases.map(({ caseNumber, statements }, i) =>
        context.withNestedScope(() => {
          const newStatements = optimizeHighIRStatements(statements, context);
          const finalValue = optimizeExpression(checkNotNull(final.branchValues[i]));
          return { caseNumber, newStatements, finalValue };
        })
      );
      const allValuesAreTheSame =
        new Set(casesWithValue.map((it) => debugPrintHighIRExpression(it.finalValue))).size === 1;
      if (allValuesAreTheSame) {
        const switchStatement = switchOrNull(
          HIR_SWITCH({
            caseVariable: statement.caseVariable,
            cases: casesWithValue.map((it) => ({
              caseNumber: it.caseNumber,
              statements: it.newStatements,
            })),
          })
        );
        context.bind(final.name, checkNotNull(casesWithValue[0]).finalValue);
        return switchStatement;
      }
      return [
        HIR_SWITCH({
          caseVariable: statement.caseVariable,
          cases: casesWithValue.map((it) => ({
            caseNumber: it.caseNumber,
            statements: it.newStatements,
          })),
          finalAssignment: { ...final, branchValues: casesWithValue.map((it) => it.finalValue) },
        }),
      ];
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
  context: LocalValueContextForOptimization
): readonly HighIRStatement[] => statements.flatMap((it) => optimizeHighIRStatement(it, context));

const optimizeHighIRStatementsByConditionalConstantPropagation = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] =>
  optimizeHighIRStatements(statements, new LocalValueContextForOptimization());

export default optimizeHighIRStatementsByConditionalConstantPropagation;
