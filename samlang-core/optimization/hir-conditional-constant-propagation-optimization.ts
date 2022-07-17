import type { IROperator } from '../ast/common-operators';
import createHighIRFlexibleOrderOperatorNode from '../ast/hir-flexible-op';
import {
  debugPrintHighIRExpression,
  HighIRBinaryStatement,
  HighIRExpression,
  HighIRFunction,
  HighIRIntLiteralExpression,
  HighIRNameExpression,
  HighIRStatement,
  HighIRVariableExpression,
  HighIRWhileStatement,
  HIR_BREAK,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_ONE,
  HIR_SINGLE_IF,
  HIR_STRUCT_INITIALIZATION,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_ZERO,
} from '../ast/hir-nodes';
import { assert, checkNotNull, filterMap, ignore, LocalStackedContext, zip3 } from '../utils';
import {
  ifElseOrNull,
  LocalValueContextForOptimization,
  singleIfOrNull,
} from './hir-optimization-common';

const longOfBool = (b: boolean) => (b ? 1 : 0);

function evaluateBinaryExpression(operator: IROperator, v1: number, v2: number): number | null {
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
}

type BinaryExpression = {
  readonly operator: IROperator;
  readonly e1: HighIRVariableExpression;
  readonly e2: HighIRIntLiteralExpression;
};

function mergeBinaryExpression(
  outerOperator: IROperator,
  inner: BinaryExpression,
  outerConstant: number,
): BinaryExpression | null {
  switch (outerOperator) {
    case '+':
      if (inner.operator === '+') {
        return {
          operator: '+',
          e1: inner.e1,
          e2: HIR_INT(inner.e2.value + outerConstant),
        };
      }
      return null;
    case '*':
      if (inner.operator === '*') {
        return {
          operator: '*',
          e1: inner.e1,
          e2: HIR_INT(inner.e2.value * outerConstant),
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
          e2: HIR_INT(outerConstant - inner.e2.value),
        };
      }
      return null;
    default:
      return null;
  }
}

class BinaryExpressionContext extends LocalStackedContext<BinaryExpression> {}

function optimizeHighIRExpression(
  valueContext: LocalValueContextForOptimization,
  expression: HighIRExpression,
): HighIRExpression {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression': {
      const binded = valueContext.getLocalValueType(expression.name);
      return binded ?? expression;
    }
  }
}

function optimizeHighIRStatement(
  statement: HighIRStatement,
  valueContext: LocalValueContextForOptimization,
  indexAccessExpressionContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext,
): readonly HighIRStatement[] {
  const optimizeExpression = (expression: HighIRExpression) =>
    optimizeHighIRExpression(valueContext, expression);

  const withNestedScope = <T>(block: () => T): T =>
    valueContext.withNestedScope(() => binaryExpressionContext.withNestedScope(block));

  const tryOptimizeLoopByRunForSomeIterations = (
    { loopVariables, statements, breakCollector }: HighIRWhileStatement,
    maxDepth = 5,
  ): readonly HighIRStatement[] | null => {
    const firstIterationOptimizationTrial = withNestedScope(() => {
      loopVariables.forEach((it) => valueContext.bind(it.name, it.initialValue));
      const firstRunOptimizedStatements = optimizeHighIRStatements(
        statements,
        valueContext,
        indexAccessExpressionContext,
        binaryExpressionContext,
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
          HIR_WHILE({
            loopVariables: advancedLoopVariables,
            statements,
            breakCollector,
          }),
        ];
      }
      if (lastStatementOfFirstRunOptimizedStatements.__type__ !== 'HighIRBreakStatement') {
        return null;
      }
      return firstRunOptimizedStatements;
    });
    if (firstIterationOptimizationTrial == null) return null;
    const lastStatementOfFirstRunOptimizedStatements = checkNotNull(
      firstIterationOptimizationTrial[firstIterationOptimizationTrial.length - 1],
    );
    if (lastStatementOfFirstRunOptimizedStatements.__type__ !== 'HighIRBreakStatement') {
      assert(
        firstIterationOptimizationTrial.length === 1 &&
          lastStatementOfFirstRunOptimizedStatements.__type__ === 'HighIRWhileStatement',
      );
      if (maxDepth === 0) return firstIterationOptimizationTrial;
      return tryOptimizeLoopByRunForSomeIterations(
        lastStatementOfFirstRunOptimizedStatements,
        maxDepth - 1,
      );
    }
    if (breakCollector != null) {
      valueContext.bind(
        breakCollector.name,
        optimizeExpression(lastStatementOfFirstRunOptimizedStatements.breakValue),
      );
    }
    return firstIterationOptimizationTrial.slice(0, firstIterationOptimizationTrial.length - 1);
  };

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement': {
      const pointerExpression = optimizeExpression(statement.pointerExpression);
      const { name, type, index } = statement;
      const computed = indexAccessExpressionContext.getLocalValueType(
        `${debugPrintHighIRExpression(pointerExpression)}[${index}]`,
      );
      if (computed == null) return [HIR_INDEX_ACCESS({ name, type, pointerExpression, index })];
      valueContext.bind(name, computed);
      return [];
    }

    case 'HighIRBinaryStatement': {
      const e1 = optimizeExpression(statement.e1);
      const e2 = optimizeExpression(statement.e2);
      const { name, operator } = statement;
      if (e2.__type__ === 'HighIRIntLiteralExpression') {
        const v2 = e2.value;
        if (v2 === 0) {
          if (operator === '+') {
            valueContext.bind(name, e1);
            return [];
          }
          if (operator === '*') {
            valueContext.bind(name, HIR_ZERO);
            return [];
          }
        }
        if (v2 === 1) {
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
          partiallyOptimizedStatement.e1.name,
        );
        if (existingBinaryForE1 != null) {
          const merged = mergeBinaryExpression(
            partiallyOptimizedStatement.operator,
            existingBinaryForE1,
            partiallyOptimizedStatement.e2.value,
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
          ignore,
        );
      }
      return [partiallyOptimizedStatement];
    }

    case 'HighIRFunctionCallStatement':
      return [
        HIR_FUNCTION_CALL({
          functionExpression: optimizeExpression(
            statement.functionExpression,
          ) as HighIRNameExpression,
          functionArguments: statement.functionArguments.map(optimizeExpression),
          returnType: statement.returnType,
          returnCollector: statement.returnCollector,
        }),
      ];

    case 'HighIRIfElseStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'HighIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value);
        const statements = optimizeHighIRStatements(
          isTrue ? statement.s1 : statement.s2,
          valueContext,
          indexAccessExpressionContext,
          binaryExpressionContext,
        );
        statement.finalAssignments.forEach((final) => {
          valueContext.bind(
            final.name,
            isTrue
              ? optimizeExpression(final.branch1Value)
              : optimizeExpression(final.branch2Value),
          );
        });
        return statements;
      }
      const [s1, branch1Values] = withNestedScope(() => {
        const statements = optimizeHighIRStatements(
          statement.s1,
          valueContext,
          indexAccessExpressionContext,
          binaryExpressionContext,
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
          indexAccessExpressionContext,
          binaryExpressionContext,
        );
        return [
          statements,
          statement.finalAssignments.map((final) => optimizeExpression(final.branch2Value)),
        ] as const;
      });
      const finalAssignments = filterMap(
        zip3(branch1Values, branch2Values, statement.finalAssignments),
        ([branch1Value, branch2Value, final]) => {
          if (
            debugPrintHighIRExpression(branch1Value) === debugPrintHighIRExpression(branch2Value)
          ) {
            valueContext.bind(final.name, branch1Value);
            return null;
          }
          return { ...final, branch1Value, branch2Value };
        },
      );
      return ifElseOrNull(HIR_IF_ELSE({ booleanExpression, s1, s2, finalAssignments }));
    }

    case 'HighIRSingleIfStatement': {
      const booleanExpression = optimizeExpression(statement.booleanExpression);
      if (booleanExpression.__type__ === 'HighIRIntLiteralExpression') {
        const isTrue = Boolean(booleanExpression.value ^ Number(statement.invertCondition));
        if (isTrue) {
          return optimizeHighIRStatements(
            statement.statements,
            valueContext,
            indexAccessExpressionContext,
            binaryExpressionContext,
          );
        }
        return [];
      }
      const statements = optimizeHighIRStatements(
        statement.statements,
        valueContext,
        indexAccessExpressionContext,
        binaryExpressionContext,
      );
      return singleIfOrNull(
        HIR_SINGLE_IF({
          booleanExpression,
          invertCondition: statement.invertCondition,
          statements,
        }),
      );
    }

    case 'HighIRBreakStatement':
      return [HIR_BREAK(optimizeExpression(statement.breakValue))];

    case 'HighIRWhileStatement': {
      const filteredLoopVariables = filterMap(statement.loopVariables, (it) => {
        if (
          debugPrintHighIRExpression(it.initialValue) === debugPrintHighIRExpression(it.loopValue)
        ) {
          valueContext.bind(it.name, it.initialValue);
          return null;
        }
        return it;
      });
      const loopVariableInitialValues = filteredLoopVariables.map((it) =>
        optimizeExpression(it.initialValue),
      );
      const [statements, loopVariableLoopValues] = withNestedScope(() => {
        const newStatements = optimizeHighIRStatements(
          statement.statements,
          valueContext,
          indexAccessExpressionContext,
          binaryExpressionContext,
        );
        return [
          newStatements,
          filteredLoopVariables.map((it) => optimizeExpression(it.loopValue)),
        ] as const;
      });
      const loopVariables = zip3(
        loopVariableInitialValues,
        loopVariableLoopValues,
        filteredLoopVariables,
      ).map(([initialValue, loopValue, variable]) => ({ ...variable, initialValue, loopValue }));
      const lastStatement = statements[statements.length - 1];
      if (lastStatement != null && lastStatement.__type__ === 'HighIRBreakStatement') {
        // Now we know that the loop will only loop once!
        loopVariables.forEach((it) => valueContext.bind(it.name, it.initialValue));
        const movedStatements = optimizeHighIRStatements(
          statements.slice(0, statements.length - 1),
          valueContext,
          indexAccessExpressionContext,
          binaryExpressionContext,
        );
        if (statement.breakCollector != null) {
          valueContext.bind(
            statement.breakCollector.name,
            optimizeExpression(lastStatement.breakValue),
          );
        }
        return movedStatements;
      }
      const optimizedWhile = HIR_WHILE({
        loopVariables,
        statements,
        breakCollector: statement.breakCollector,
      });
      return tryOptimizeLoopByRunForSomeIterations(optimizedWhile) ?? [optimizedWhile];
    }

    case 'HighIRStructInitializationStatement':
      return [
        HIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type: statement.type,
          expressionList: statement.expressionList.map((it, index) => {
            const optimized = optimizeExpression(it);
            const indexAccessKey = `${debugPrintHighIRExpression(
              HIR_VARIABLE(statement.structVariableName, statement.type),
            )}[${index}]`;
            indexAccessExpressionContext.addLocalValueType(indexAccessKey, optimized, ignore);
            return optimized;
          }),
        }),
      ];

    case 'HighIRClosureInitializationStatement':
      return [
        HIR_CLOSURE_INITIALIZATION({
          closureVariableName: statement.closureVariableName,
          closureType: statement.closureType,
          functionName: statement.functionName,
          functionType: statement.functionType,
          context: optimizeExpression(statement.context),
        }),
      ];
  }
}

function optimizeHighIRStatements(
  statements: readonly HighIRStatement[],
  valueContext: LocalValueContextForOptimization,
  indexAccessExpressionContext: LocalValueContextForOptimization,
  binaryExpressionContext: BinaryExpressionContext,
): readonly HighIRStatement[] {
  const collector: HighIRStatement[] = [];
  outer: for (let i = 0; i < statements.length; i += 1) {
    const optimized = optimizeHighIRStatement(
      checkNotNull(statements[i]),
      valueContext,
      indexAccessExpressionContext,
      binaryExpressionContext,
    );
    for (let j = 0; j < optimized.length; j += 1) {
      const s = checkNotNull(optimized[j]);
      collector.push(s);
      if (s.__type__ === 'HighIRBreakStatement') break outer;
    }
  }
  return collector;
}

export default function optimizeHighIRFunctionByConditionalConstantPropagation(
  highIRFunction: HighIRFunction,
): HighIRFunction {
  const valueContext = new LocalValueContextForOptimization();
  const indexAccessExpressionContext = new LocalValueContextForOptimization();
  const binaryExpressionContext = new BinaryExpressionContext();
  const body = optimizeHighIRStatements(
    highIRFunction.body,
    valueContext,
    indexAccessExpressionContext,
    binaryExpressionContext,
  );
  const returnValue = optimizeHighIRExpression(valueContext, highIRFunction.returnValue);
  return { ...highIRFunction, body, returnValue };
}
