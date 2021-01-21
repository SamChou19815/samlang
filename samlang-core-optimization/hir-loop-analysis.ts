/* eslint-disable no-param-reassign */

import { internalOptimizeHighIRStatementsByDCE } from './hir-dead-code-elimination-optimization';

import type {
  HighIRStatement,
  GeneralHighIRLoopVariables,
  HighIRWhileStatement,
  HighIRExpression,
  HighIRBinaryStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRType } from 'samlang-core-ast/hir-types';
import { checkNotNull, isNotNull, Long } from 'samlang-core-utils';

type BasicInductionVariableWithLoopGuard = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly incrementAmount: Long;
  readonly guardOperator: '<' | '<=' | '>' | '>=';
  readonly guardExpresssion: HighIRExpression;
};

type GeneralBasicInductionVariable = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly incrementAmount: Long;
};

type DerivedInductionVariable = {
  readonly baseName: string;
  readonly multiplier: Long;
  readonly immediate: Long;
};

type DerivedInductionVariableWithInitialValue = {
  readonly name: string;
  readonly initialValue: HighIRExpression;
  readonly baseName: string;
  readonly multiplier: Long;
  readonly immediate: Long;
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

const mergeConstantOperationIntoDerivedInductionVariable = (
  existing: DerivedInductionVariable,
  operator: '+' | '*',
  value: Long
): DerivedInductionVariable => {
  if (operator === '+') return { ...existing, immediate: existing.immediate.add(value) };
  return {
    baseName: existing.baseName,
    multiplier: existing.multiplier.multiply(value),
    immediate: existing.immediate.multiply(value),
  };
};

const mergeVariableAdditionIntoDerivedInductionVariable = (
  existing: DerivedInductionVariable,
  anotherVariable: DerivedInductionVariable
): DerivedInductionVariable | null => {
  if (existing.baseName !== anotherVariable.baseName) return null;
  return {
    baseName: existing.baseName,
    multiplier: existing.multiplier.add(anotherVariable.multiplier),
    immediate: existing.immediate.add(anotherVariable.immediate),
  };
};

const tryMergeIntoDerivedInductionVariable = (
  existingSet: Record<string, DerivedInductionVariable>,
  binaryStatement: HighIRBinaryStatement
): void => {
  if (binaryStatement.e1.__type__ !== 'HighIRVariableExpression') return;
  const existing = existingSet[binaryStatement.e1.name];
  if (existing == null) return;
  if (binaryStatement.e2.__type__ === 'HighIRIntLiteralExpression') {
    switch (binaryStatement.operator) {
      case '+':
      case '*': {
        existingSet[binaryStatement.name] = mergeConstantOperationIntoDerivedInductionVariable(
          existing,
          binaryStatement.operator,
          binaryStatement.e2.value
        );
      }
    }
    return;
  }
  if (
    binaryStatement.e2.__type__ !== 'HighIRVariableExpression' ||
    binaryStatement.operator !== '+'
  ) {
    return;
  }
  const anotherVariable = existingSet[binaryStatement.e2.name];
  if (anotherVariable == null) return;
  const merged = mergeVariableAdditionIntoDerivedInductionVariable(existing, anotherVariable);
  if (merged != null) existingSet[binaryStatement.name] = merged;
};

const extractOptimizableWhileLoop = ({
  loopVariables,
  statements,
  breakCollector: originalBreakCollector,
}: HighIRWhileStatement): HighIROptimizableWhileLoop | null => {
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
          statement.e2.__type__ === 'HighIRIntLiteralExpression'
        ) {
          return statement.e2.value;
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
      multiplier: Long.ONE,
      immediate: it.incrementAmount,
    };
  });
  restStatements.forEach((it) => {
    if (it.__type__ !== 'HighIRBinaryStatement') return;
    tryMergeIntoDerivedInductionVariable(existingDerivedInductionVariableSet, it);
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
