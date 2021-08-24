import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import {
  MidIRStatement,
  MidIRWhileStatement,
  MIR_ZERO,
  MIR_VARIABLE,
  MIR_BINARY,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction } from 'samlang-core-ast/mir-nodes';

import optimizeMidIRStatementsByConditionalConstantPropagation from './mir-conditional-constant-propagation-optimization';
import {
  collectUseFromMidIRExpression,
  collectUseFromMidIRStatement,
} from './mir-dead-code-elimination-optimization';
import midIRLoopAlgebraicOptimization from './mir-loop-algebraic-optimization';
import extractOptimizableWhileLoop, {
  MidIROptimizableWhileLoop,
  invertGuardOperator,
} from './mir-loop-induction-analysis';
import midIRLoopInductionVariableEliminationOptimization from './mir-loop-induction-variable-elimination';
import optimizeMidIRWhileStatementByLoopInvariantCodeMotion from './mir-loop-invariant-code-motion';
import midIRLoopStrengthReductionOptimization from './mir-loop-strength-reduction';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

function expandOptimizableWhileLoop(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: MidIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator
): MidIRWhileStatement {
  const basicInductionVariableWithLoopGuardLoopValueCollector = allocator.allocateLoopTemporary();
  const breakValue = breakCollector?.value ?? MIR_ZERO;
  const usefulUsedSet = new Set<string>([basicInductionVariableWithLoopGuard.name]);
  collectUseFromMidIRExpression(breakValue, usefulUsedSet);
  loopVariablesThatAreNotBasicInductionVariables.forEach((it) =>
    collectUseFromMidIRExpression(it.loopValue, usefulUsedSet)
  );
  statements.forEach((it) => collectUseFromMidIRStatement(it, usefulUsedSet));
  const generalBasicInductionVariablesWithLoopValueCollectors = generalInductionVariables
    .filter((it) => usefulUsedSet.has(it.name))
    .map((it) => [it, allocator.allocateLoopTemporary()] as const);
  const loopConditionVariable = allocator.allocateLoopTemporary();
  const loopVariables = [
    ...loopVariablesThatAreNotBasicInductionVariables.filter((it) => usefulUsedSet.has(it.name)),
    {
      name: basicInductionVariableWithLoopGuard.name,
      type: MIR_INT_TYPE,
      initialValue: basicInductionVariableWithLoopGuard.initialValue,
      loopValue: MIR_VARIABLE(basicInductionVariableWithLoopGuardLoopValueCollector, MIR_INT_TYPE),
    },
    ...generalBasicInductionVariablesWithLoopValueCollectors.map(([v, collector]) => ({
      name: v.name,
      type: MIR_INT_TYPE,
      initialValue: v.initialValue,
      loopValue: MIR_VARIABLE(collector, MIR_INT_TYPE),
    })),
  ];
  return MIR_WHILE({
    loopVariables,
    statements: [
      MIR_BINARY({
        name: loopConditionVariable,
        operator: invertGuardOperator(basicInductionVariableWithLoopGuard.guardOperator),
        e1: MIR_VARIABLE(basicInductionVariableWithLoopGuard.name, MIR_INT_TYPE),
        e2: basicInductionVariableWithLoopGuard.guardExpression,
      }),
      MIR_SINGLE_IF({
        booleanExpression: MIR_VARIABLE(loopConditionVariable, MIR_BOOL_TYPE),
        invertCondition: false,
        statements: [MIR_BREAK(breakValue)],
      }),
      ...statements,
      MIR_BINARY({
        name: basicInductionVariableWithLoopGuardLoopValueCollector,
        operator: '+',
        e1: MIR_VARIABLE(basicInductionVariableWithLoopGuard.name, MIR_INT_TYPE),
        e2: basicInductionVariableWithLoopGuard.incrementAmount,
      }),
      ...generalBasicInductionVariablesWithLoopValueCollectors.map(([v, collector]) =>
        MIR_BINARY({
          name: collector,
          operator: '+',
          e1: MIR_VARIABLE(v.name, MIR_INT_TYPE),
          e2: v.incrementAmount,
        })
      ),
      ...derivedInductionVariables.flatMap((derivedInductionVariable) => {
        const step1Temp = allocator.allocateLoopTemporary();
        return [
          MIR_BINARY({
            name: step1Temp,
            ...createMidIRFlexibleOrderOperatorNode(
              '*',
              MIR_VARIABLE(derivedInductionVariable.baseName, MIR_INT_TYPE),
              derivedInductionVariable.multiplier
            ),
          }),
          MIR_BINARY({
            name: derivedInductionVariable.name,
            ...createMidIRFlexibleOrderOperatorNode(
              '+',
              MIR_VARIABLE(step1Temp, MIR_INT_TYPE),
              derivedInductionVariable.immediate
            ),
          }),
        ];
      }),
    ],
    breakCollector:
      breakCollector == null ? undefined : { name: breakCollector.name, type: breakCollector.type },
  });
}

export function optimizeMidIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
  midIRWhileStatement: MidIRWhileStatement,
  allocator: OptimizationResourceAllocator
): readonly MidIRStatement[] {
  const { hoistedStatementsBeforeWhile, optimizedWhileStatement, nonLoopInvariantVariables } =
    optimizeMidIRWhileStatementByLoopInvariantCodeMotion(midIRWhileStatement);
  const optimizableWhileStatement = extractOptimizableWhileLoop(
    optimizedWhileStatement,
    nonLoopInvariantVariables
  );
  const finalStatements = [...hoistedStatementsBeforeWhile];
  if (optimizableWhileStatement == null) {
    finalStatements.push(optimizedWhileStatement);
    return finalStatements;
  }
  const algebraicallyOptimizedStatements = midIRLoopAlgebraicOptimization(
    optimizableWhileStatement,
    allocator
  );
  if (algebraicallyOptimizedStatements != null) {
    finalStatements.push(...algebraicallyOptimizedStatements);
    return finalStatements;
  }
  const inductionVariableEliminationResult = midIRLoopInductionVariableEliminationOptimization(
    optimizableWhileStatement,
    allocator
  );
  let newOptimizableWhileStatement = optimizableWhileStatement;
  if (inductionVariableEliminationResult != null) {
    finalStatements.push(...inductionVariableEliminationResult.prefixStatements);
    newOptimizableWhileStatement = inductionVariableEliminationResult.optimizableWhileLoop;
  }
  const strengthReductionResult = midIRLoopStrengthReductionOptimization(
    newOptimizableWhileStatement,
    allocator
  );
  finalStatements.push(...strengthReductionResult.prefixStatements);
  const alreadyHandledInductionVariableNames = new Set(
    strengthReductionResult.optimizableWhileLoop.generalInductionVariables.map((it) => it.name)
  );
  newOptimizableWhileStatement = {
    ...strengthReductionResult.optimizableWhileLoop,
    statements: strengthReductionResult.optimizableWhileLoop.statements.filter(
      (it) =>
        it.__type__ !== 'MidIRBinaryStatement' || !alreadyHandledInductionVariableNames.has(it.name)
    ),
  };
  finalStatements.push(expandOptimizableWhileLoop(newOptimizableWhileStatement, allocator));
  return finalStatements;
}

function recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(
  statement: MidIRStatement,
  allocator: OptimizationResourceAllocator
): readonly MidIRStatement[] {
  switch (statement.__type__) {
    case 'MidIRIfElseStatement':
      return [
        {
          ...statement,
          s1: statement.s1.flatMap((it) =>
            recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(it, allocator)
          ),
          s2: statement.s2.flatMap((it) =>
            recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(it, allocator)
          ),
        },
      ];
    case 'MidIRSingleIfStatement':
      return [
        {
          ...statement,
          statements: statement.statements.flatMap((it) =>
            recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(it, allocator)
          ),
        },
      ];
    case 'MidIRWhileStatement': {
      const optimizedStatements = statement.statements.flatMap((it) =>
        recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(it, allocator)
      );
      return optimizeMidIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
        { ...statement, statements: optimizedStatements },
        allocator
      );
    }
    default:
      return [statement];
  }
}

export default function optimizeMidIRFunctionWithAllLoopOptimizations(
  midIRFunction: MidIRFunction,
  allocator: OptimizationResourceAllocator
): MidIRFunction {
  return optimizeMidIRStatementsByConditionalConstantPropagation({
    ...midIRFunction,
    body: midIRFunction.body.flatMap((it) =>
      recursivelyOptimizeMidIRStatementWithAllLoopOptimizations(it, allocator)
    ),
  });
}
