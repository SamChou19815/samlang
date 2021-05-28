/* eslint-disable no-param-reassign */

import { internalOptimizeMidIRStatementsByDCE } from './mir-dead-code-elimination-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  MidIRStatement,
  GeneralMidIRLoopVariables,
  MidIRExpression,
  MidIRIntLiteralExpression,
  MidIRVariableExpression,
  MidIRWhileStatement,
  MidIRBinaryStatement,
  MIR_INT,
  MIR_ONE,
  MIR_ZERO,
} from 'samlang-core-ast/mir-expressions';
import type { MidIRType } from 'samlang-core-ast/mir-types';
import { assert, checkNotNull, isNotNull } from 'samlang-core-utils';

export type PotentialLoopInvariantExpression = MidIRIntLiteralExpression | MidIRVariableExpression;

type BasicInductionVariableWithLoopGuard = {
  readonly name: string;
  readonly initialValue: MidIRExpression;
  readonly incrementAmount: PotentialLoopInvariantExpression;
  readonly guardOperator: '<' | '<=' | '>' | '>=';
  readonly guardExpression: PotentialLoopInvariantExpression;
};

export type GeneralBasicInductionVariable = {
  readonly name: string;
  readonly initialValue: MidIRExpression;
  readonly incrementAmount: PotentialLoopInvariantExpression;
};

export type GeneralBasicInductionVariableWithLoopValueCollector = GeneralBasicInductionVariable & {
  readonly loopValueCollector: string;
};

type DerivedInductionVariable = {
  readonly baseName: string;
  readonly multiplier: PotentialLoopInvariantExpression;
  readonly immediate: PotentialLoopInvariantExpression;
};

export type DerivedInductionVariableWithName = { readonly name: string } & DerivedInductionVariable;

export type MidIROptimizableWhileLoop = {
  readonly basicInductionVariableWithLoopGuard: BasicInductionVariableWithLoopGuard;
  readonly generalInductionVariables: readonly GeneralBasicInductionVariable[];
  readonly loopVariablesThatAreNotBasicInductionVariables: readonly GeneralMidIRLoopVariables[];
  readonly derivedInductionVariables: readonly DerivedInductionVariableWithName[];
  readonly statements: readonly MidIRStatement[];
  readonly breakCollector?: {
    readonly name: string;
    readonly type: MidIRType;
    readonly value: MidIRExpression;
  };
};

const statementContainsBreak = (statement: MidIRStatement): boolean => {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
    case 'MidIRBinaryStatement':
    case 'MidIRFunctionCallStatement':
    case 'MidIRCastStatement':
    case 'MidIRStructInitializationStatement':
      return false;
    case 'MidIRBreakStatement':
      return true;
    case 'MidIRIfElseStatement':
      return statementsContainsBreak(statement.s1) || statementsContainsBreak(statement.s2);
    case 'MidIRSingleIfStatement':
      return statementsContainsBreak(statement.statements);
    case 'MidIRWhileStatement':
      // Although it might contain break, the break never affects the outer loop,
      return false;
  }
};

const statementsContainsBreak = (statements: readonly MidIRStatement[]): boolean =>
  statements.some(statementContainsBreak);

const mergeInvariantAdditionForLoopOptimization = (
  existingValue: PotentialLoopInvariantExpression,
  addedValue: PotentialLoopInvariantExpression
): PotentialLoopInvariantExpression | null => {
  if (
    existingValue.__type__ === 'MidIRIntLiteralExpression' &&
    addedValue.__type__ === 'MidIRIntLiteralExpression'
  ) {
    return MIR_INT(existingValue.value + addedValue.value);
  }
  if (addedValue.__type__ === 'MidIRIntLiteralExpression' && addedValue.value === 0) {
    return existingValue;
  }
  if (existingValue.__type__ === 'MidIRIntLiteralExpression' && existingValue.value === 0) {
    return addedValue;
  }
  return null;
};

export const mergeInvariantMultiplicationForLoopOptimization = (
  existingValue: PotentialLoopInvariantExpression,
  addedValue: PotentialLoopInvariantExpression
): PotentialLoopInvariantExpression | null => {
  if (
    existingValue.__type__ === 'MidIRIntLiteralExpression' &&
    addedValue.__type__ === 'MidIRIntLiteralExpression'
  ) {
    return MIR_INT(existingValue.value * addedValue.value);
  }
  if (addedValue.__type__ === 'MidIRIntLiteralExpression' && addedValue.value === 1) {
    return existingValue;
  }
  if (existingValue.__type__ === 'MidIRIntLiteralExpression' && existingValue.value === 1) {
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
    const mergedImmediate = mergeInvariantAdditionForLoopOptimization(
      existing.immediate,
      loopInvariantExpression
    );
    if (mergedImmediate == null) return null;
    return { ...existing, immediate: mergedImmediate };
  }
  if (loopInvariantExpression.__type__ === 'MidIRIntLiteralExpression') {
    const loopInvariantExpressionValue = loopInvariantExpression.value;
    if (
      existing.multiplier.__type__ === 'MidIRIntLiteralExpression' &&
      existing.immediate.__type__ === 'MidIRIntLiteralExpression'
    ) {
      return {
        baseName: existing.baseName,
        multiplier: MIR_INT(existing.multiplier.value * loopInvariantExpressionValue),
        immediate: MIR_INT(existing.immediate.value * loopInvariantExpressionValue),
      };
    }
    if (loopInvariantExpressionValue === 1) return existing;
    return null;
  }
  if (
    existing.multiplier.__type__ === 'MidIRIntLiteralExpression' &&
    existing.immediate.__type__ === 'MidIRIntLiteralExpression' &&
    existing.multiplier.value === 1 &&
    existing.immediate.value === 1
  ) {
    return {
      baseName: existing.baseName,
      multiplier: loopInvariantExpression,
      immediate: loopInvariantExpression,
    };
  }
  return null;
};

export const mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING = (
  existing: DerivedInductionVariable,
  anotherVariable: DerivedInductionVariable
): DerivedInductionVariable | null => {
  if (existing.baseName !== anotherVariable.baseName) return null;
  const mergedMultiplier = mergeInvariantAdditionForLoopOptimization(
    existing.multiplier,
    anotherVariable.multiplier
  );
  const mergedImmediate = mergeInvariantAdditionForLoopOptimization(
    existing.immediate,
    anotherVariable.immediate
  );
  return mergedMultiplier == null || mergedImmediate == null
    ? null
    : { baseName: existing.baseName, multiplier: mergedMultiplier, immediate: mergedImmediate };
};

const tryMergeIntoDerivedInductionVariableWithoutSwap = (
  existingSet: Record<string, DerivedInductionVariable>,
  expressionIsLoopInvariant: (expression: MidIRExpression) => boolean,
  binaryStatement: MidIRBinaryStatement
): boolean => {
  if (binaryStatement.e1.__type__ !== 'MidIRVariableExpression') return false;
  const existing = existingSet[binaryStatement.e1.name];
  if (existing == null) return false;
  if (
    binaryStatement.e2.__type__ === 'MidIRVariableExpression' &&
    binaryStatement.operator === '+'
  ) {
    const anotherVariable = existingSet[binaryStatement.e2.name];
    if (anotherVariable != null) {
      const merged = mergeVariableAdditionIntoDerivedInductionVariable_EXPOSED_FOR_TESTING(
        existing,
        anotherVariable
      );
      if (merged != null) {
        existingSet[binaryStatement.name] = merged;
        return true;
      }
    }
  }
  if (
    binaryStatement.e2.__type__ === 'MidIRNameExpression' ||
    !expressionIsLoopInvariant(binaryStatement.e2)
  ) {
    return false;
  }
  switch (binaryStatement.operator) {
    case '+':
    case '*': {
      const merged = mergeConstantOperationIntoDerivedInductionVariable(
        existing,
        binaryStatement.operator,
        binaryStatement.e2
      );
      if (merged != null) {
        existingSet[binaryStatement.name] = merged;
        return true;
      }
    }
  }
  return false;
};

const tryMergeIntoDerivedInductionVariable = (
  existingSet: Record<string, DerivedInductionVariable>,
  expressionIsLoopInvariant: (expression: MidIRExpression) => boolean,
  binaryStatement: MidIRBinaryStatement
): void => {
  if (
    tryMergeIntoDerivedInductionVariableWithoutSwap(
      existingSet,
      expressionIsLoopInvariant,
      binaryStatement
    )
  ) {
    return;
  }
  switch (binaryStatement.operator) {
    case '+':
    case '*':
      break;
    default:
      return;
  }
  tryMergeIntoDerivedInductionVariableWithoutSwap(existingSet, expressionIsLoopInvariant, {
    ...binaryStatement,
    e1: binaryStatement.e2,
    e2: binaryStatement.e1,
  });
};

type LoopGuardStructure = {
  readonly potentialBasicInductionVariableNameWithLoopGuard: string;
  readonly guardOperator: '<' | '<=' | '>' | '>=';
  readonly guardExpression: PotentialLoopInvariantExpression;
  readonly restStatements: readonly MidIRStatement[];
  readonly breakCollector?: {
    readonly name: string;
    readonly type: MidIRType;
    readonly value: MidIRExpression;
  };
};

export const invertGuardOperator = (operator: '<' | '<=' | '>' | '>='): '<' | '<=' | '>' | '>=' => {
  switch (operator) {
    case '<':
      return '>=';
    case '<=':
      return '>';
    case '>':
      return '<=';
    case '>=':
      return '<';
  }
};

export const getGuardOperator_EXPOSED_FOR_TESTING = (
  operator: IROperator,
  invertCondition: boolean
): '<' | '<=' | '>' | '>=' | null => {
  switch (operator) {
    case '<':
      break;
    case '<=':
      break;
    case '>':
      break;
    case '>=':
      break;
    default:
      return null;
  }
  if (invertCondition) return operator;
  return invertGuardOperator(operator);
};

export const extractLoopGuardStructure_EXPOSED_FOR_TESTING = (
  { statements, breakCollector: originalBreakCollector }: MidIRWhileStatement,
  expressionIsLoopInvariant: (expression: MidIRExpression) => boolean
): LoopGuardStructure | null => {
  if (statements.length < 2) return null;
  const [firstBinaryStatement, secondSingleIfStatement, ...restStatements] = statements;
  if (
    firstBinaryStatement == null ||
    secondSingleIfStatement == null ||
    firstBinaryStatement.__type__ !== 'MidIRBinaryStatement' ||
    firstBinaryStatement.e1.__type__ !== 'MidIRVariableExpression' ||
    !expressionIsLoopInvariant(firstBinaryStatement.e2) ||
    secondSingleIfStatement.__type__ !== 'MidIRSingleIfStatement' ||
    secondSingleIfStatement.booleanExpression.__type__ !== 'MidIRVariableExpression' ||
    firstBinaryStatement.name !== secondSingleIfStatement.booleanExpression.name ||
    secondSingleIfStatement.statements.length !== 1 ||
    statementsContainsBreak(restStatements)
  ) {
    return null;
  }
  const onlyBreakStatement = checkNotNull(secondSingleIfStatement.statements[0]);
  if (onlyBreakStatement.__type__ !== 'MidIRBreakStatement') return null;
  const guardOperator = getGuardOperator_EXPOSED_FOR_TESTING(
    firstBinaryStatement.operator,
    secondSingleIfStatement.invertCondition
  );
  if (guardOperator == null) return null;
  const potentialBasicInductionVariableNameWithLoopGuard = firstBinaryStatement.e1.name;
  const guardExpression = firstBinaryStatement.e2;
  assert(guardExpression.__type__ !== 'MidIRNameExpression');

  const breakCollector =
    originalBreakCollector == null
      ? undefined
      : { ...originalBreakCollector, value: onlyBreakStatement.breakValue };

  return {
    potentialBasicInductionVariableNameWithLoopGuard,
    guardOperator,
    guardExpression,
    restStatements,
    breakCollector,
  };
};

type ExtractedBasicInductionVariables = {
  readonly loopVariablesThatAreNotBasicInductionVariables: GeneralMidIRLoopVariables[];
  readonly allBasicInductionVariables: readonly GeneralBasicInductionVariableWithLoopValueCollector[];
  readonly basicInductionVariableWithAssociatedLoopGuard: GeneralBasicInductionVariableWithLoopValueCollector;
};

export const extractBasicInductionVariables_EXPOSED_FOR_TESTING = (
  potentialBasicInductionVariableNameWithLoopGuard: string,
  loopVariables: readonly GeneralMidIRLoopVariables[],
  restStatements: readonly MidIRStatement[],
  expressionIsLoopInvariant: (expression: MidIRExpression) => boolean
): ExtractedBasicInductionVariables | null => {
  const allBasicInductionVariables: GeneralBasicInductionVariableWithLoopValueCollector[] = [];
  const loopVariablesThatAreNotBasicInductionVariables: GeneralMidIRLoopVariables[] = [];
  loopVariables.forEach((loopVariable) => {
    if (loopVariable.loopValue.__type__ !== 'MidIRVariableExpression') {
      loopVariablesThatAreNotBasicInductionVariables.push(loopVariable);
      return;
    }
    const basicInductionLoopIncrementCollector = loopVariable.loopValue.name;
    const incrementAmount = restStatements
      .map((statement) => {
        if (
          statement.__type__ === 'MidIRBinaryStatement' &&
          statement.name === basicInductionLoopIncrementCollector &&
          statement.e1.__type__ === 'MidIRVariableExpression' &&
          statement.e1.name === loopVariable.name &&
          expressionIsLoopInvariant(statement.e2)
        ) {
          assert(statement.e2.__type__ !== 'MidIRNameExpression');
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
        loopValueCollector: basicInductionLoopIncrementCollector,
        initialValue: loopVariable.initialValue,
        incrementAmount,
      });
    }
  });

  // Extract the ONE basic induction variable associated with the loopGuard.
  const basicInductionVariableWithAssociatedLoopGuard = allBasicInductionVariables.find(
    (it) => it.name === potentialBasicInductionVariableNameWithLoopGuard
  );
  if (basicInductionVariableWithAssociatedLoopGuard == null) return null;

  return {
    loopVariablesThatAreNotBasicInductionVariables,
    allBasicInductionVariables,
    basicInductionVariableWithAssociatedLoopGuard,
  };
};

export const extractDerivedInductionVariables_EXPOSED_FOR_TESTING = (
  allBasicInductionVariables: readonly GeneralBasicInductionVariableWithLoopValueCollector[],
  restStatements: readonly MidIRStatement[],
  expressionIsLoopInvariant: (expression: MidIRExpression) => boolean
): readonly DerivedInductionVariableWithName[] => {
  const existingDerivedInductionVariableSet: Record<string, DerivedInductionVariable> = {};
  allBasicInductionVariables.forEach((it) => {
    existingDerivedInductionVariableSet[it.name] = {
      baseName: it.name,
      multiplier: MIR_ONE,
      immediate: MIR_ZERO,
    };
  });
  restStatements.forEach((it) => {
    if (it.__type__ !== 'MidIRBinaryStatement') return;
    tryMergeIntoDerivedInductionVariable(
      existingDerivedInductionVariableSet,
      expressionIsLoopInvariant,
      it
    );
  });
  const inductionLoopVariablesCollectorNames = new Set(
    allBasicInductionVariables.map((it) => it.loopValueCollector)
  );
  return restStatements
    .map((it) => {
      if (it.__type__ !== 'MidIRBinaryStatement') return null;
      const derivedInductionVariable = existingDerivedInductionVariableSet[it.name];
      if (derivedInductionVariable == null) return null;
      if (inductionLoopVariablesCollectorNames.has(it.name)) return null;
      return { name: it.name, ...derivedInductionVariable };
    })
    .filter(isNotNull);
};

export const removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING = (
  otherLoopVariables: readonly GeneralMidIRLoopVariables[],
  restStatements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const liveVariableSet = new Set<string>();
  otherLoopVariables.forEach((it) => {
    if (it.loopValue.__type__ !== 'MidIRVariableExpression') return;
    liveVariableSet.add(it.loopValue.name);
  });
  return internalOptimizeMidIRStatementsByDCE(restStatements, liveVariableSet);
};

export const expressionIsLoopInvariant_EXPOSED_FOR_TESTING = (
  expression: MidIRExpression,
  nonLoopInvariantVariables: ReadonlySet<string>
): boolean => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
      return true;
    case 'MidIRNameExpression':
      // We are doing algebraic operations here. Name is hopeless.
      return false;
    case 'MidIRVariableExpression':
      return !nonLoopInvariantVariables.has(expression.name);
  }
};

/**
 * @param whileStatement a while statement assuming all the loop invariant statements are already
 * hoisted out.
 * @param nonLoopInvariantVariables a set of variables that are not guaranteed to be loop invariant.
 * (for the purpose of analysis, they are not considered as loop invariant.)
 */
const extractOptimizableWhileLoop = (
  whileStatement: MidIRWhileStatement,
  nonLoopInvariantVariables: ReadonlySet<string>
): MidIROptimizableWhileLoop | null => {
  const expressionIsLoopInvariant = (expression: MidIRExpression): boolean =>
    expressionIsLoopInvariant_EXPOSED_FOR_TESTING(expression, nonLoopInvariantVariables);

  // Phase 1: Check the structure for loop guard.
  const loopGuardStructure = extractLoopGuardStructure_EXPOSED_FOR_TESTING(
    whileStatement,
    expressionIsLoopInvariant
  );
  if (loopGuardStructure == null) return null;
  const {
    potentialBasicInductionVariableNameWithLoopGuard,
    guardOperator,
    guardExpression,
    restStatements,
    breakCollector,
  } = loopGuardStructure;

  // Phase 2: Extract basic induction variables.
  const extractedBasicInductionVariables = extractBasicInductionVariables_EXPOSED_FOR_TESTING(
    potentialBasicInductionVariableNameWithLoopGuard,
    whileStatement.loopVariables,
    restStatements,
    expressionIsLoopInvariant
  );
  if (extractedBasicInductionVariables == null) return null;
  const {
    loopVariablesThatAreNotBasicInductionVariables,
    allBasicInductionVariables,
    basicInductionVariableWithAssociatedLoopGuard,
  } = extractedBasicInductionVariables;
  const basicInductionVariableWithLoopGuard: BasicInductionVariableWithLoopGuard = {
    name: basicInductionVariableWithAssociatedLoopGuard.name,
    initialValue: basicInductionVariableWithAssociatedLoopGuard.initialValue,
    incrementAmount: basicInductionVariableWithAssociatedLoopGuard.incrementAmount,
    guardOperator,
    guardExpression,
  };
  const generalInductionVariables = allBasicInductionVariables
    .filter((it) => it.name !== potentialBasicInductionVariableNameWithLoopGuard)
    .map(({ loopValueCollector, ...rest }) => ({ ...rest }));

  // Phase 3: Compute all the derived induction variables.
  const derivedInductionVariables = extractDerivedInductionVariables_EXPOSED_FOR_TESTING(
    allBasicInductionVariables,
    restStatements,
    expressionIsLoopInvariant
  );
  const derivedInductionVariableNames = new Set(derivedInductionVariables.map((it) => it.name));

  // Phase 4: Remove undundant statements after getting all the induction variables.
  const optimizedStatements = removeDeadCodeInsideLoop_EXPOSED_FOR_TESTING(
    loopVariablesThatAreNotBasicInductionVariables.filter(
      (it) =>
        it.loopValue.__type__ !== 'MidIRVariableExpression' ||
        !derivedInductionVariableNames.has(it.loopValue.name)
    ),
    restStatements
  );

  return {
    basicInductionVariableWithLoopGuard,
    generalInductionVariables,
    loopVariablesThatAreNotBasicInductionVariables,
    derivedInductionVariables,
    statements: optimizedStatements,
    breakCollector,
  };
};

export default extractOptimizableWhileLoop;
