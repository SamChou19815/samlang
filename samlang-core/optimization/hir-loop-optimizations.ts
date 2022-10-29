import createHighIRFlexibleOrderOperatorNode from "../ast/hir-flexible-op";
import {
  HighIRFunction,
  HighIRStatement,
  HighIRWhileStatement,
  HIR_BINARY,
  HIR_BOOL_TYPE,
  HIR_BREAK,
  HIR_INT_TYPE,
  HIR_SINGLE_IF,
  HIR_VARIABLE,
  HIR_WHILE,
  HIR_ZERO,
} from "../ast/hir-nodes";
import optimizeHighIRStatementsByConditionalConstantPropagation from "./hir-conditional-constant-propagation-optimization";
import {
  collectUseFromHighIRExpression,
  collectUseFromHighIRStatement,
} from "./hir-dead-code-elimination-optimization";
import highIRLoopAlgebraicOptimization from "./hir-loop-algebraic-optimization";
import extractOptimizableWhileLoop, {
  HighIROptimizableWhileLoop,
  invertGuardOperator,
} from "./hir-loop-induction-analysis";
import highIRLoopInductionVariableEliminationOptimization from "./hir-loop-induction-variable-elimination";
import optimizeHighIRWhileStatementByLoopInvariantCodeMotion from "./hir-loop-invariant-code-motion";
import highIRLoopStrengthReductionOptimization from "./hir-loop-strength-reduction";
import type OptimizationResourceAllocator from "./optimization-resource-allocator";

function expandOptimizableWhileLoop(
  {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements,
    breakCollector,
  }: HighIROptimizableWhileLoop,
  allocator: OptimizationResourceAllocator,
): HighIRWhileStatement {
  const basicInductionVariableWithLoopGuardLoopValueCollector = allocator.allocateLoopTemporary();
  const breakValue = breakCollector?.value ?? HIR_ZERO;
  const usefulUsedSet = new Set<string>([basicInductionVariableWithLoopGuard.name]);
  collectUseFromHighIRExpression(breakValue, usefulUsedSet);
  loopVariablesThatAreNotBasicInductionVariables.forEach((it) =>
    collectUseFromHighIRExpression(it.loopValue, usefulUsedSet),
  );
  statements.forEach((it) => collectUseFromHighIRStatement(it, usefulUsedSet));
  const generalBasicInductionVariablesWithLoopValueCollectors = generalInductionVariables
    .filter((it) => usefulUsedSet.has(it.name))
    .map((it) => [it, allocator.allocateLoopTemporary()] as const);
  const loopConditionVariable = allocator.allocateLoopTemporary();
  const loopVariables = [
    ...loopVariablesThatAreNotBasicInductionVariables.filter((it) => usefulUsedSet.has(it.name)),
    {
      name: basicInductionVariableWithLoopGuard.name,
      type: HIR_INT_TYPE,
      initialValue: basicInductionVariableWithLoopGuard.initialValue,
      loopValue: HIR_VARIABLE(basicInductionVariableWithLoopGuardLoopValueCollector, HIR_INT_TYPE),
    },
    ...generalBasicInductionVariablesWithLoopValueCollectors.map(([v, collector]) => ({
      name: v.name,
      type: HIR_INT_TYPE,
      initialValue: v.initialValue,
      loopValue: HIR_VARIABLE(collector, HIR_INT_TYPE),
    })),
  ];
  return HIR_WHILE({
    loopVariables,
    statements: [
      HIR_BINARY({
        name: loopConditionVariable,
        operator: invertGuardOperator(basicInductionVariableWithLoopGuard.guardOperator),
        e1: HIR_VARIABLE(basicInductionVariableWithLoopGuard.name, HIR_INT_TYPE),
        e2: basicInductionVariableWithLoopGuard.guardExpression,
      }),
      HIR_SINGLE_IF({
        booleanExpression: HIR_VARIABLE(loopConditionVariable, HIR_BOOL_TYPE),
        invertCondition: false,
        statements: [HIR_BREAK(breakValue)],
      }),
      ...statements,
      HIR_BINARY({
        name: basicInductionVariableWithLoopGuardLoopValueCollector,
        operator: "+",
        e1: HIR_VARIABLE(basicInductionVariableWithLoopGuard.name, HIR_INT_TYPE),
        e2: basicInductionVariableWithLoopGuard.incrementAmount,
      }),
      ...generalBasicInductionVariablesWithLoopValueCollectors.map(([v, collector]) =>
        HIR_BINARY({
          name: collector,
          operator: "+",
          e1: HIR_VARIABLE(v.name, HIR_INT_TYPE),
          e2: v.incrementAmount,
        }),
      ),
      ...derivedInductionVariables.flatMap((derivedInductionVariable) => {
        const step1Temp = allocator.allocateLoopTemporary();
        return [
          HIR_BINARY({
            name: step1Temp,
            ...createHighIRFlexibleOrderOperatorNode(
              "*",
              HIR_VARIABLE(derivedInductionVariable.baseName, HIR_INT_TYPE),
              derivedInductionVariable.multiplier,
            ),
          }),
          HIR_BINARY({
            name: derivedInductionVariable.name,
            ...createHighIRFlexibleOrderOperatorNode(
              "+",
              HIR_VARIABLE(step1Temp, HIR_INT_TYPE),
              derivedInductionVariable.immediate,
            ),
          }),
        ];
      }),
    ],
    breakCollector:
      breakCollector == null ? undefined : { name: breakCollector.name, type: breakCollector.type },
  });
}

export function optimizeHighIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
  highIRWhileStatement: HighIRWhileStatement,
  allocator: OptimizationResourceAllocator,
): readonly HighIRStatement[] {
  const { hoistedStatementsBeforeWhile, optimizedWhileStatement, nonLoopInvariantVariables } =
    optimizeHighIRWhileStatementByLoopInvariantCodeMotion(highIRWhileStatement);
  const optimizableWhileStatement = extractOptimizableWhileLoop(
    optimizedWhileStatement,
    nonLoopInvariantVariables,
  );
  const finalStatements = [...hoistedStatementsBeforeWhile];
  if (optimizableWhileStatement == null) {
    finalStatements.push(optimizedWhileStatement);
    return finalStatements;
  }
  const algebraicallyOptimizedStatements = highIRLoopAlgebraicOptimization(
    optimizableWhileStatement,
    allocator,
  );
  if (algebraicallyOptimizedStatements != null) {
    finalStatements.push(...algebraicallyOptimizedStatements);
    return finalStatements;
  }
  const inductionVariableEliminationResult = highIRLoopInductionVariableEliminationOptimization(
    optimizableWhileStatement,
    allocator,
  );
  let newOptimizableWhileStatement = optimizableWhileStatement;
  if (inductionVariableEliminationResult != null) {
    finalStatements.push(...inductionVariableEliminationResult.prefixStatements);
    newOptimizableWhileStatement = inductionVariableEliminationResult.optimizableWhileLoop;
  }
  const strengthReductionResult = highIRLoopStrengthReductionOptimization(
    newOptimizableWhileStatement,
    allocator,
  );
  finalStatements.push(...strengthReductionResult.prefixStatements);
  const alreadyHandledInductionVariableNames = new Set(
    strengthReductionResult.optimizableWhileLoop.generalInductionVariables.map((it) => it.name),
  );
  newOptimizableWhileStatement = {
    ...strengthReductionResult.optimizableWhileLoop,
    statements: strengthReductionResult.optimizableWhileLoop.statements.filter(
      (it) =>
        it.__type__ !== "HighIRBinaryStatement" ||
        !alreadyHandledInductionVariableNames.has(it.name),
    ),
  };
  finalStatements.push(expandOptimizableWhileLoop(newOptimizableWhileStatement, allocator));
  return finalStatements;
}

function recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(
  statement: HighIRStatement,
  allocator: OptimizationResourceAllocator,
): readonly HighIRStatement[] {
  switch (statement.__type__) {
    case "HighIRIfElseStatement":
      return [
        {
          ...statement,
          s1: statement.s1.flatMap((it) =>
            recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(it, allocator),
          ),
          s2: statement.s2.flatMap((it) =>
            recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(it, allocator),
          ),
        },
      ];
    case "HighIRSingleIfStatement":
      return [
        {
          ...statement,
          statements: statement.statements.flatMap((it) =>
            recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(it, allocator),
          ),
        },
      ];
    case "HighIRWhileStatement": {
      const optimizedStatements = statement.statements.flatMap((it) =>
        recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(it, allocator),
      );
      return optimizeHighIRWhileStatementWithAllLoopOptimizations_EXPOSED_FOR_TESTING(
        { ...statement, statements: optimizedStatements },
        allocator,
      );
    }
    default:
      return [statement];
  }
}

export default function optimizeHighIRFunctionWithAllLoopOptimizations(
  highIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator,
): HighIRFunction {
  return optimizeHighIRStatementsByConditionalConstantPropagation({
    ...highIRFunction,
    body: highIRFunction.body.flatMap((it) =>
      recursivelyOptimizeHighIRStatementWithAllLoopOptimizations(it, allocator),
    ),
  });
}
