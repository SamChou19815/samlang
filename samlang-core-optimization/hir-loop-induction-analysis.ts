/* eslint-disable no-param-reassign */

import { internalOptimizeHighIRStatementsByDCE } from './hir-dead-code-elimination-optimization';

import {
  HighIRStatement,
  GeneralHighIRLoopVariables,
  HighIRExpression,
  HighIRIntLiteralExpression,
  HighIRVariableExpression,
  HighIRWhileStatement,
  HighIRBinaryStatement,
  HIR_INT,
  HIR_ONE,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRType } from 'samlang-core-ast/hir-types';
import { assert, checkNotNull, isNotNull } from 'samlang-core-utils';

type PotentialLoopInvariantExpression = HighIRIntLiteralExpression | HighIRVariableExpression;

type BasicInductionVariableWithLoopGuard = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly incrementAmount: PotentialLoopInvariantExpression;
  readonly guardOperator: '<' | '<=' | '>' | '>=';
  readonly guardExpresssion: PotentialLoopInvariantExpression;
};

type GeneralBasicInductionVariable = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly incrementAmount: PotentialLoopInvariantExpression;
};

type DerivedInductionVariable = {
  readonly baseName: string;
  readonly multiplier: PotentialLoopInvariantExpression;
  readonly immediate: PotentialLoopInvariantExpression;
};

type DerivedInductionVariableWithInitialValue = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly baseName: string;
  readonly multiplier: PotentialLoopInvariantExpression;
  readonly immediate: PotentialLoopInvariantExpression;
};

type HighIROptimizableWhileLoop = {
  readonly basicInductionVariableWithLoopGuard: BasicInductionVariableWithLoopGuard;
  readonly generalInductionVariables: readonly GeneralBasicInductionVariable[];
  readonly derivedInductionVariables: readonly DerivedInductionVariableWithInitialValue[];
  readonly otherLoopVariables: readonly GeneralHighIRLoopVariables[];
  readonly statements: readonly HighIRStatement[];
  readonly breakCollector?: {
    readonly name: string;
    readonly type: HighIRType;
    readonly value: HighIRExpression;
  };
};

const statementContainsBreak = (statement: HighIRStatement): boolean => {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
    case 'HighIRBinaryStatement':
    case 'HighIRFunctionCallStatement':
    case 'HighIRCastStatement':
    case 'HighIRStructInitializationStatement':
    case 'HighIRReturnStatement':
      return false;
    case 'HighIRBreakStatement':
      return true;
    case 'HighIRIfElseStatement':
      return statementsContainsBreak(statement.s1) || statementsContainsBreak(statement.s2);
    case 'HighIRSingleIfStatement':
      return statementsContainsBreak(statement.statements);
    case 'HighIRWhileStatement':
      // Although it might contain break, the break never affects the outer loop,
      return false;
  }
};

const statementsContainsBreak = (statements: readonly HighIRStatement[]): boolean =>
  statements.some(statementContainsBreak);

const mergeAddition = (
  existingValue: PotentialLoopInvariantExpression,
  addedValue: PotentialLoopInvariantExpression
): PotentialLoopInvariantExpression | null => {
  if (
    existingValue.__type__ === 'HighIRIntLiteralExpression' &&
    addedValue.__type__ === 'HighIRIntLiteralExpression'
  ) {
    return HIR_INT(existingValue.value.add(addedValue.value));
  }
  if (addedValue.__type__ === 'HighIRIntLiteralExpression' && addedValue.value.equals(0)) {
    return existingValue;
  }
  if (existingValue.__type__ === 'HighIRIntLiteralExpression' && existingValue.value.equals(0)) {
    return addedValue;
  }
  return null;
};

const mergeConstantOperationIntoDerivedInductionVariable = (
  existing: DerivedInductionVariable,
  operator: '+' | '*',
  loopInvariantExpression: PotentialLoopInvariantExpression
): DerivedInductionVariable | null => {
  if (operator === '+') {
    const mergedImmediate = mergeAddition(existing.immediate, loopInvariantExpression);
    if (mergedImmediate == null) return null;
    return { ...existing, immediate: mergedImmediate };
  }
  if (loopInvariantExpression.__type__ === 'HighIRIntLiteralExpression') {
    const loopInvariantExpressionValue = loopInvariantExpression.value;
    if (
      existing.multiplier.__type__ === 'HighIRIntLiteralExpression' &&
      existing.immediate.__type__ === 'HighIRIntLiteralExpression'
    ) {
      return {
        baseName: existing.baseName,
        multiplier: HIR_INT(existing.multiplier.value.multiply(loopInvariantExpressionValue)),
        immediate: HIR_INT(existing.immediate.value.multiply(loopInvariantExpressionValue)),
      };
    }
    if (loopInvariantExpressionValue.equals(1)) return existing;
    return null;
  }
  if (
    existing.multiplier.__type__ === 'HighIRIntLiteralExpression' &&
    existing.immediate.__type__ === 'HighIRIntLiteralExpression' &&
    existing.multiplier.value.equals(1) &&
    existing.immediate.value.equals(1)
  ) {
    return {
      baseName: existing.baseName,
      multiplier: loopInvariantExpression,
      immediate: loopInvariantExpression,
    };
  }
  return null;
};

const mergeVariableAdditionIntoDerivedInductionVariable = (
  existing: DerivedInductionVariable,
  anotherVariable: DerivedInductionVariable
): DerivedInductionVariable | null => {
  if (existing.baseName !== anotherVariable.baseName) return null;
  const mergedMultiplier = mergeAddition(existing.multiplier, anotherVariable.multiplier);
  const mergedImmediate = mergeAddition(existing.immediate, anotherVariable.immediate);
  // istanbul ignore next
  if (mergedMultiplier == null || mergedImmediate == null) return null;
  return { baseName: existing.baseName, multiplier: mergedMultiplier, immediate: mergedImmediate };
};

const tryMergeIntoDerivedInductionVariable = (
  existingSet: Record<string, DerivedInductionVariable>,
  expressionIsLoopInvariant: (expression: HighIRExpression) => boolean,
  binaryStatement: HighIRBinaryStatement
): void => {
  if (binaryStatement.e1.__type__ !== 'HighIRVariableExpression') return;
  const existing = existingSet[binaryStatement.e1.name];
  if (existing == null) return;
  if (
    binaryStatement.e2.__type__ === 'HighIRVariableExpression' &&
    binaryStatement.operator === '+'
  ) {
    const anotherVariable = existingSet[binaryStatement.e2.name];
    if (anotherVariable != null) {
      const merged = mergeVariableAdditionIntoDerivedInductionVariable(existing, anotherVariable);
      if (merged != null) {
        existingSet[binaryStatement.name] = merged;
        return;
      }
    }
  }
  if (
    binaryStatement.e2.__type__ === 'HighIRNameExpression' ||
    !expressionIsLoopInvariant(binaryStatement.e2)
  ) {
    return;
  }
  switch (binaryStatement.operator) {
    case '+':
    case '*': {
      const merged = mergeConstantOperationIntoDerivedInductionVariable(
        existing,
        binaryStatement.operator,
        binaryStatement.e2
      );
      if (merged != null) existingSet[binaryStatement.name] = merged;
    }
  }
};

/**
 * @param whileStatement a while statement assuming all the loop invariant statements are already
 * hoisted out.
 * @param nonLoopInvariantVariables a set of variables that are not guaranteed to be loop invariant.
 * (for the purpose of analysis, they are not considered as loop invariant.)
 */
const extractOptimizableWhileLoop = (
  { loopVariables, statements, breakCollector: originalBreakCollector }: HighIRWhileStatement,
  nonLoopInvariantVariables: ReadonlySet<string>
): HighIROptimizableWhileLoop | null => {
  const expressionIsLoopInvariant = (expression: HighIRExpression): boolean => {
    // istanbul ignore next
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return true;
      case 'HighIRNameExpression':
        // We are doing algebraic operations here. Name is hopeless.
        // istanbul ignore next
        return false;
      case 'HighIRVariableExpression':
        return !nonLoopInvariantVariables.has(expression.name);
    }
  };

  // Phase 1: Check the structure for loop guard.
  if (statements.length < 2) return null;
  const [firstBinaryStatement, secondSingleIfStatement, ...restStatements] = statements;
  if (
    firstBinaryStatement == null ||
    secondSingleIfStatement == null ||
    firstBinaryStatement.__type__ !== 'HighIRBinaryStatement' ||
    firstBinaryStatement.e1.__type__ !== 'HighIRVariableExpression' ||
    secondSingleIfStatement.__type__ !== 'HighIRSingleIfStatement' ||
    secondSingleIfStatement.booleanExpression.__type__ !== 'HighIRVariableExpression' ||
    firstBinaryStatement.name !== secondSingleIfStatement.booleanExpression.name ||
    secondSingleIfStatement.statements.length !== 1 ||
    statementsContainsBreak(restStatements)
  ) {
    return null;
  }
  const onlyBreakStatement = checkNotNull(secondSingleIfStatement.statements[0]);
  if (onlyBreakStatement.__type__ !== 'HighIRBreakStatement') return null;
  let guardOperator: '<' | '<=' | '>' | '>=';
  switch (firstBinaryStatement.operator) {
    case '<':
      guardOperator = secondSingleIfStatement.invertCondition ? '>=' : '<';
      break;
    case '<=':
      guardOperator = secondSingleIfStatement.invertCondition ? '>' : '<=';
      break;
    case '>':
      guardOperator = secondSingleIfStatement.invertCondition ? '<=' : '>';
      break;
    case '>=':
      guardOperator = secondSingleIfStatement.invertCondition ? '<' : '>=';
      break;
    default:
      return null;
  }
  const potentialBasicInductionVariableNameWithLoopGuard = firstBinaryStatement.e1.name;
  assert(firstBinaryStatement.e2.__type__ !== 'HighIRNameExpression');

  // Phase 2: Extract basic induction variables.
  const allBasicInductionVariables: GeneralBasicInductionVariable[] = [];
  const loopVariablesThatAreNotBasicInductionVariables: GeneralHighIRLoopVariables[] = [];
  loopVariables.forEach((loopVariable) => {
    if (loopVariable.loopValue.__type__ !== 'HighIRVariableExpression') {
      loopVariablesThatAreNotBasicInductionVariables.push(loopVariable);
      return;
    }
    const basicInductionLoopIncrementCollector = loopVariable.loopValue.name;
    const incrementAmount = restStatements
      .map((statement) => {
        if (
          statement.__type__ === 'HighIRBinaryStatement' &&
          statement.name === basicInductionLoopIncrementCollector &&
          statement.e1.__type__ === 'HighIRVariableExpression' &&
          statement.e1.name === loopVariable.name &&
          expressionIsLoopInvariant(statement.e2)
        ) {
          assert(statement.e2.__type__ !== 'HighIRNameExpression');
          return statement.e2;
        }
        return null;
      })
      .find(isNotNull);
    if (incrementAmount == null) {
      loopVariablesThatAreNotBasicInductionVariables.push(loopVariable);
    } else {
      allBasicInductionVariables.push({
        name: loopVariable.name,
        initialValue: loopVariable.initialValue,
        incrementAmount,
      });
    }
  });

  // Phase 3: Extract the ONE basic induction variable associated with the loopGuard.
  const basicInductionVariableWithAssociatedLoopGuard = allBasicInductionVariables.find(
    (it) => it.name === potentialBasicInductionVariableNameWithLoopGuard
  );
  if (basicInductionVariableWithAssociatedLoopGuard == null) {
    return null;
  }
  const basicInductionVariableWithLoopGuard: BasicInductionVariableWithLoopGuard = {
    ...basicInductionVariableWithAssociatedLoopGuard,
    guardOperator,
    guardExpresssion: firstBinaryStatement.e2,
  };
  const breakCollector =
    originalBreakCollector == null
      ? undefined
      : { ...originalBreakCollector, value: onlyBreakStatement.breakValue };
  const generalInductionVariables = allBasicInductionVariables.filter(
    (it) => it.name !== potentialBasicInductionVariableNameWithLoopGuard
  );

  // Phase 4: Compute all the derived induction variables.
  const existingDerivedInductionVariableSet: Record<string, DerivedInductionVariable> = {};
  allBasicInductionVariables.forEach((it) => {
    existingDerivedInductionVariableSet[it.name] = {
      baseName: it.name,
      multiplier: HIR_ONE,
      immediate: it.incrementAmount,
    };
  });
  restStatements.forEach((it) => {
    if (it.__type__ !== 'HighIRBinaryStatement') return;
    tryMergeIntoDerivedInductionVariable(
      existingDerivedInductionVariableSet,
      expressionIsLoopInvariant,
      it
    );
  });
  const derivedInductionVariables: DerivedInductionVariableWithInitialValue[] = [];
  const otherLoopVariables: GeneralHighIRLoopVariables[] = [];
  loopVariablesThatAreNotBasicInductionVariables.forEach((loopVariable) => {
    if (loopVariable.loopValue.__type__ !== 'HighIRVariableExpression') {
      otherLoopVariables.push(loopVariable);
      return;
    }
    const loopValueCollector = loopVariable.loopValue.name;
    const derivedInductionVariable = existingDerivedInductionVariableSet[loopValueCollector];
    if (derivedInductionVariable == null) {
      otherLoopVariables.push(loopVariable);
    } else {
      derivedInductionVariables.push({
        ...derivedInductionVariable,
        name: loopVariable.name,
        initialValue: loopVariable.initialValue,
      });
    }
  });

  // Phase 5: Remove undundant statements after getting all the induction variables.
  const liveVariableSet = new Set<string>();
  otherLoopVariables.forEach((it) => {
    if (it.loopValue.__type__ !== 'HighIRVariableExpression') return;
    liveVariableSet.add(it.loopValue.name);
  });
  const optimizedStatements = internalOptimizeHighIRStatementsByDCE(
    restStatements,
    liveVariableSet
  );

  return {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    derivedInductionVariables,
    otherLoopVariables,
    statements: optimizedStatements,
    breakCollector,
  };
};

export default extractOptimizableWhileLoop;
