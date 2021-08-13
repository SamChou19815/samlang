import type { IROperator } from 'samlang-core-ast/common-operators';
import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import {
  MidIRExpression,
  MidIRBinaryStatement,
  MidIRStatement,
  MidIRVariableExpression,
  MidIRIntLiteralExpression,
  debugPrintMidIRExpression,
  MIR_ZERO,
  MIR_ONE,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_STRUCT_INITIALIZATION,
  MIR_CAST,
  MIR_INT,
  MidIRWhileStatement,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction } from 'samlang-core-ast/mir-nodes';
import {
  LocalStackedContext,
  assert,
  checkNotNull,
  isNotNull,
  ignore,
  zip3,
} from 'samlang-core-utils';

import {
  ifElseOrNull,
  singleIfOrNull,
  LocalValueContextForOptimization,
} from './mir-optimization-common';

const longOfBool = (b: boolean) => (b ? 1 : 0);

const evaluateBinaryExpression = (operator: IROperator, v1: number, v2: number): number | null => {
  switch (operator) {
    case '+':
      return v1 + v2;
    case '-':
      return v1 - v2;
    case '*':
      return v1 * v2;
    case '/': {
      if (v2 === 0) return null;
      const result = v1 / v2;
      return result >= 0 ? Math.floor(result) : Math.ceil(result);
    }
    case '%':
      return v2 === 0 ? null : v1 % v2;
    case '^':
      return v1 ^ v2;
    case '<':
      return longOfBool(v1 < v2);
    case '<=':
      return longOfBool(v1 <= v2);
    case '>':
      return longOfBool(v1 > v2);
    case '>=':
      return longOfBool(v1 >= v2);
    case '==':
      return longOfBool(v1 === v2);
    case '!=':
      return longOfBool(v1 !== v2);
  }
};

type BinaryExpression = {
  readonly operator: IROperator;
  readonly e1: MidIRVariableExpression;
  readonly e2: MidIRIntLiteralExpression;
};

const mergeBinaryExpression = (
  outerOperator: IROperator,
  inner: BinaryExpression,
  outerConstant: number
): BinaryExpression | null => {
  switch (outerOperator) {
    case '+':
      if (inner.operator === '+') {
        return {
          operator: '+',
          e1: inner.e1,
          e2: MIR_INT(inner.e2.value + outerConstant),
        };
      }
      return null;
    case '*':
      if (inner.operator === '*') {
        return {
          operator: '*',
          e1: inner.e1,
          e2: MIR_INT(inner.e2.value * outerConstant),
        };
      }
      return null;
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '==':
    case '!=':
      if (inner.operator === '+') {
        return {
          operator: outerOperator,
          e1: inner.e1,
          e2: MIR_INT(outerConstant - inner.e2.value),
        };
      }
      return null;
    default:
      return null;
  }
};

class BinaryExpressionContext extends LocalStackedContext<BinaryExpression> {}

const optimizeMidIRExpression = (
  valueContext: LocalValueContextForOptimization,
  expression: MidIRExpression
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
    case 'MidIRNameExpression':
      return expression;
    case 'MidIRVariableExpression': {
      const binded = valueContext.getLocalValueType(expression.name);
      return binded ?? expression;
    }
  }
};

const optimizeMidIRStatement = (
  statement: MidIRStatement,
  valueContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext
): readonly MidIRStatement[] => {
  const optimizeExpression = (expression: MidIRExpression) =>
    optimizeMidIRExpression(valueContext, expression);

  const withNestedScope = <T>(block: () => T): T =>
    valueContext.withNestedScope(() => binaryExpressionContext.withNestedScope(block));

  const tryOptimizeLoopByRunForSomeIterations = (
    { loopVariables, statements, breakCollector }: MidIRWhileStatement,
    maxDepth = 5
  ): readonly MidIRStatement[] | null => {
    const firstIterationOptimizationTrial = withNestedScope(() => {
      loopVariables.forEach((it) => valueContext.bind(it.name, it.initialValue));
      const firstRunOptimizedStatements = optimizeMidIRStatements(
        statements,
        valueContext,
        binaryExpressionContext
      );
      const lastStatementOfFirstRunOptimizedStatements =
        firstRunOptimizedStatements[firstRunOptimizedStatements.length - 1];
      if (lastStatementOfFirstRunOptimizedStatements == null) {
        // Empty loop in first run except new loop values, so we can change the initial values!
        const advancedLoopVariables = loopVariables.map((it) => ({
          ...it,
          initialValue: optimizeExpression(it.loopValue),
        }));
        return [
          MIR_WHILE({
            loopVariables: advancedLoopVariables,
            statements,
            breakCollector,
          }),
        ];
      }
      if (lastStatementOfFirstRunOptimizedStatements.__type__ !== 'MidIRBreakStatement') {
        return null;
      }
      return firstRunOptimizedStatements;
    });
    if (firstIterationOptimizationTrial == null) return null;
    const lastStatementOfFirstRunOptimizedStatements = checkNotNull(
      firstIterationOptimizationTrial[firstIterationOptimizationTrial.length - 1]
    );
    if (lastStatementOfFirstRunOptimizedStatements.__type__ !== 'MidIRBreakStatement') {
      assert(
        firstIterationOptimizationTrial.length === 1 &&
          lastStatementOfFirstRunOptimizedStatements.__type__ === 'MidIRWhileStatement'
      );
      if (maxDepth === 0) return firstIterationOptimizationTrial;
      return tryOptimizeLoopByRunForSomeIterations(
        lastStatementOfFirstRunOptimizedStatements,
        maxDepth - 1
      );
    }
    if (breakCollector != null) {
      valueContext.bind(
        breakCollector.name,
        optimizeExpression(lastStatementOfFirstRunOptimizedStatements.breakValue)
      );
    }
    return firstIterationOptimizationTrial.slice(0, firstIterationOptimizationTrial.length - 1);
  };

  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement': {
      const pointerExpression = optimizeExpression(statement.pointerExpression);
      return [{ ...statement, pointerExpression }];
    }

    case 'MidIRBinaryStatement': {
      const e1 = optimizeExpression(statement.e1);
      const e2 = optimizeExpression(statement.e2);
      const { name, operator } = statement;
      if (e2.__type__ === 'MidIRIntLiteralExpression') {
        const v2 = e2.value;
        if (v2 === 0) {
          if (operator === '+') {
            valueContext.bind(name, e1);
            return [];
          }
          if (operator === '*') {
            valueContext.bind(name, MIR_ZERO);
            return [];
          }
        }
        if (v2 === 1) {
          if (operator === '%') {
            valueContext.bind(name, MIR_ZERO);
            return [];
          }
          if (operator === '*' || operator === '/') {
            valueContext.bind(name, e1);
            return [];
          }
        }
        if (e1.__type__ === 'MidIRIntLiteralExpression') {
          const v1 = e1.value;
          const value = evaluateBinaryExpression(operator, v1, v2);
          if (value != null) {
            valueContext.bind(name, {
              __type__: 'MidIRIntLiteralExpression',
              value,
              type: statement.type,
            });
            return [];
          }
        }
      }
      if (
        e1.__type__ === 'MidIRVariableExpression' &&
        e2.__type__ === 'MidIRVariableExpression' &&
        e1.name === e2.name
      ) {
        if (operator === '-' || operator === '%') {
          valueContext.bind(name, MIR_ZERO);
          return [];
        }
        if (operator === '/') {
          valueContext.bind(name, MIR_ONE);
          return [];
        }
      }
      const partiallyOptimizedStatement: MidIRBinaryStatement = {
        ...statement,
        ...createMidIRFlexibleOrderOperatorNode(statement.operator, e1, e2),
      };
      if (
        partiallyOptimizedStatement.e1.__type__ === 'MidIRVariableExpression' &&
        partiallyOptimizedStatement.e2.__type__ === 'MidIRIntLiteralExpression'
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
          ignore
        );
      }
      return [partiallyOptimizedStatement];
    }

    case 'MidIRFunctionCallStatement':
      return [
        MIR_FUNCTION_CALL({
          functionExpression: optimizeExpression(statement.functionExpression),
          functionArguments: statement.functionArguments.map(optimizeExpression),
          returnType: statement.returnType,
          returnCollector: statement.returnCollector,
        }),
      ];

    case 'MidIRIfElseStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'MidIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value);
        const statements = optimizeMidIRStatements(
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
        const statements = optimizeMidIRStatements(
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
        const statements = optimizeMidIRStatements(
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
          if (debugPrintMidIRExpression(branch1Value) === debugPrintMidIRExpression(branch2Value)) {
            valueContext.bind(final.name, branch1Value);
            return null;
          }
          return { ...final, branch1Value, branch2Value };
        })
        .filter(isNotNull);
      return ifElseOrNull(MIR_IF_ELSE({ booleanExpression, s1, s2, finalAssignments }));
    }

    case 'MidIRSingleIfStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'MidIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value ^ Number(statement.invertCondition));
        if (isTrue) {
          return optimizeMidIRStatements(
            statement.statements,
            valueContext,
            binaryExpressionContext
          );
        }
        return [];
      }
      const statements = optimizeMidIRStatements(
        statement.statements,
        valueContext,
        binaryExpressionContext
      );
      return singleIfOrNull(
        MIR_SINGLE_IF({ booleanExpression, invertCondition: statement.invertCondition, statements })
      );
    }

    case 'MidIRBreakStatement':
      return [MIR_BREAK(optimizeExpression(statement.breakValue))];

    case 'MidIRWhileStatement': {
      const filteredLoopVariables = statement.loopVariables
        .map((it) => {
          if (
            debugPrintMidIRExpression(it.initialValue) === debugPrintMidIRExpression(it.loopValue)
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
        const newStatements = optimizeMidIRStatements(
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
      const lastStatement = statements[statements.length - 1];
      if (lastStatement != null && lastStatement.__type__ === 'MidIRBreakStatement') {
        // Now we know that the loop will only loop once!
        loopVariables.forEach((it) => valueContext.bind(it.name, it.initialValue));
        const movedStatements = optimizeMidIRStatements(
          statements.slice(0, statements.length - 1),
          valueContext,
          binaryExpressionContext
        );
        if (statement.breakCollector != null) {
          valueContext.bind(
            statement.breakCollector.name,
            optimizeExpression(lastStatement.breakValue)
          );
        }
        return movedStatements;
      }
      const optimizedWhile = MIR_WHILE({
        loopVariables,
        statements,
        breakCollector: statement.breakCollector,
      });
      return tryOptimizeLoopByRunForSomeIterations(optimizedWhile) ?? [optimizedWhile];
    }

    case 'MidIRCastStatement':
      return [
        MIR_CAST({
          name: statement.name,
          type: statement.type,
          assignedExpression: optimizeExpression(statement.assignedExpression),
        }),
      ];

    case 'MidIRStructInitializationStatement':
      return [
        MIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type: statement.type,
          expressionList: statement.expressionList.map(optimizeExpression),
        }),
      ];
  }
};

const optimizeMidIRStatements = (
  statements: readonly MidIRStatement[],
  valueContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext
): readonly MidIRStatement[] => {
  const collector: MidIRStatement[] = [];
  outer: for (let i = 0; i < statements.length; i += 1) {
    const optimized = optimizeMidIRStatement(
      checkNotNull(statements[i]),
      valueContext,
      binaryExpressionContext
    );
    for (let j = 0; j < optimized.length; j += 1) {
      const s = checkNotNull(optimized[j]);
      collector.push(s);
      if (s.__type__ === 'MidIRBreakStatement') break outer;
    }
  }
  return collector;
};

const optimizeMidIRFunctionByConditionalConstantPropagation = (
  midIRFunction: MidIRFunction
): MidIRFunction => {
  const valueContext = new LocalValueContextForOptimization();
  const binaryExpressionContext = new BinaryExpressionContext();
  const body = optimizeMidIRStatements(midIRFunction.body, valueContext, binaryExpressionContext);
  const returnValue = optimizeMidIRExpression(valueContext, midIRFunction.returnValue);
  return { ...midIRFunction, body, returnValue };
};

export default optimizeMidIRFunctionByConditionalConstantPropagation;
