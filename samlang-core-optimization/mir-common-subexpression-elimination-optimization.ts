import optimizeMidIRFunctionByLocalValueNumbering from './mir-local-value-numbering-optimization';
import { BindedValue, bindedValueToString } from './mir-optimization-common';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

import { MidIRStatement, MIR_INDEX_ACCESS, MIR_BINARY } from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction } from 'samlang-core-ast/mir-nodes';
import { Hashable, ReadonlyHashSet, HashSet, hashSetOf, isNotNull } from 'samlang-core-utils';

class ExpressionWrapper implements Hashable {
  constructor(readonly value: BindedValue) {}

  uniqueHash() {
    return bindedValueToString(this.value);
  }
}

const intersectionOf = (
  set1: ReadonlyHashSet<ExpressionWrapper>,
  ...others: readonly ReadonlyHashSet<ExpressionWrapper>[]
): readonly BindedValue[] =>
  set1
    .toArray()
    .map((wrapper) => (others.every((it) => it.has(wrapper)) ? wrapper.value : null))
    .filter(isNotNull);

const produceHoistedStatement = (
  allocator: OptimizationResourceAllocator,
  value: BindedValue
): MidIRStatement => {
  switch (value.__type__) {
    case 'IndexAccess':
      return MIR_INDEX_ACCESS({
        name: allocator.allocateCSEHoistedTemporary(),
        type: value.type,
        pointerExpression: value.pointerExpression,
        index: value.index,
      });
    case 'Binary':
      return MIR_BINARY({
        name: allocator.allocateCSEHoistedTemporary(),
        operator: value.operator,
        e1: value.e1,
        e2: value.e2,
      });
  }
};

const optimizeMidIRStatement = (
  statement: MidIRStatement,
  allocator: OptimizationResourceAllocator,
  set: HashSet<ExpressionWrapper>
): readonly MidIRStatement[] => {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      set.add(
        new ExpressionWrapper({
          __type__: 'IndexAccess',
          type: statement.type,
          pointerExpression: statement.pointerExpression,
          index: statement.index,
        })
      );
      return [statement];

    case 'MidIRBinaryStatement':
      set.add(
        new ExpressionWrapper({
          __type__: 'Binary',
          operator: statement.operator,
          e1: statement.e1,
          e2: statement.e2,
        })
      );
      return [statement];

    case 'MidIRFunctionCallStatement':
    case 'MidIRSingleIfStatement':
    case 'MidIRBreakStatement':
    case 'MidIRWhileStatement': // handle similar optimization in loop-invariant code motion
    case 'MidIRCastStatement':
    case 'MidIRStructInitializationStatement':
      return [statement];

    case 'MidIRIfElseStatement': {
      const { statements: s1, set: set1 } = optimizeMidIRStatementsWithSet(statement.s1, allocator);
      const { statements: s2, set: set2 } = optimizeMidIRStatementsWithSet(statement.s2, allocator);
      const commonExpressions = intersectionOf(set1, set2);
      const hoistedStatements = commonExpressions.flatMap((it) =>
        optimizeMidIRStatement(produceHoistedStatement(allocator, it), allocator, set)
      );
      return [{ ...statement, s1, s2 }, ...hoistedStatements.reverse()];
    }
  }
};

const optimizeMidIRStatementsWithSet = (
  statements: readonly MidIRStatement[],
  allocator: OptimizationResourceAllocator
): { statements: readonly MidIRStatement[]; set: ReadonlyHashSet<ExpressionWrapper> } => {
  const set = hashSetOf<ExpressionWrapper>();
  const optimizedStatements = [...statements]
    .reverse()
    .flatMap((it) => optimizeMidIRStatement(it, allocator, set))
    .reverse();
  return { statements: optimizedStatements, set };
};

const optimizeMidIRFunctionByCommonSubExpressionElimination = (
  midIRFunction: MidIRFunction,
  allocator: OptimizationResourceAllocator
): MidIRFunction =>
  optimizeMidIRFunctionByLocalValueNumbering({
    ...midIRFunction,
    body: optimizeMidIRStatementsWithSet(midIRFunction.body, allocator).statements,
  });

export default optimizeMidIRFunctionByCommonSubExpressionElimination;
