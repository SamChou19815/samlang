import {
  HighIRStatement,
  HighIRFunction,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-nodes';
import { Hashable, ReadonlyHashSet, HashSet, hashSetOf, isNotNull } from 'samlang-core-utils';

import optimizeHighIRFunctionByLocalValueNumbering from './hir-local-value-numbering-optimization';
import { BindedValue, bindedValueToString } from './hir-optimization-common';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

class ExpressionWrapper implements Hashable {
  constructor(readonly value: BindedValue) {}

  uniqueHash() {
    return bindedValueToString(this.value);
  }
}

function intersectionOf(
  set1: ReadonlyHashSet<ExpressionWrapper>,
  ...others: readonly ReadonlyHashSet<ExpressionWrapper>[]
): readonly BindedValue[] {
  return set1
    .toArray()
    .map((wrapper) => (others.every((it) => it.has(wrapper)) ? wrapper.value : null))
    .filter(isNotNull);
}

function produceHoistedStatement(
  allocator: OptimizationResourceAllocator,
  value: BindedValue
): HighIRStatement {
  switch (value.__type__) {
    case 'IndexAccess':
      return HIR_INDEX_ACCESS({
        name: allocator.allocateCSEHoistedTemporary(),
        type: value.type,
        pointerExpression: value.pointerExpression,
        index: value.index,
      });
    case 'Binary':
      return HIR_BINARY({
        name: allocator.allocateCSEHoistedTemporary(),
        operator: value.operator,
        e1: value.e1,
        e2: value.e2,
      });
  }
}

function optimizeHighIRStatement(
  statement: HighIRStatement,
  allocator: OptimizationResourceAllocator,
  set: HashSet<ExpressionWrapper>
): readonly HighIRStatement[] {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      set.add(
        new ExpressionWrapper({
          __type__: 'IndexAccess',
          type: statement.type,
          pointerExpression: statement.pointerExpression,
          index: statement.index,
        })
      );
      return [statement];

    case 'HighIRBinaryStatement':
      set.add(
        new ExpressionWrapper({
          __type__: 'Binary',
          operator: statement.operator,
          e1: statement.e1,
          e2: statement.e2,
        })
      );
      return [statement];

    case 'HighIRFunctionCallStatement':
    case 'HighIRSingleIfStatement':
    case 'HighIRBreakStatement':
    case 'HighIRWhileStatement': // handle similar optimization in loop-invariant code motion
    case 'HighIRStructInitializationStatement':
    case 'HighIRClosureInitializationStatement':
      return [statement];

    case 'HighIRIfElseStatement': {
      const { statements: s1, set: set1 } = optimizeHighIRStatementsWithSet(
        statement.s1,
        allocator
      );
      const { statements: s2, set: set2 } = optimizeHighIRStatementsWithSet(
        statement.s2,
        allocator
      );
      const commonExpressions = intersectionOf(set1, set2);
      const hoistedStatements = commonExpressions.flatMap((it) =>
        optimizeHighIRStatement(produceHoistedStatement(allocator, it), allocator, set)
      );
      return [{ ...statement, s1, s2 }, ...hoistedStatements.reverse()];
    }
  }
}

function optimizeHighIRStatementsWithSet(
  statements: readonly HighIRStatement[],
  allocator: OptimizationResourceAllocator
): { statements: readonly HighIRStatement[]; set: ReadonlyHashSet<ExpressionWrapper> } {
  const set = hashSetOf<ExpressionWrapper>();
  const optimizedStatements = [...statements]
    .reverse()
    .flatMap((it) => optimizeHighIRStatement(it, allocator, set))
    .reverse();
  return { statements: optimizedStatements, set };
}

export default function optimizeHighIRFunctionByCommonSubExpressionElimination(
  midIRFunction: HighIRFunction,
  allocator: OptimizationResourceAllocator
): HighIRFunction {
  return optimizeHighIRFunctionByLocalValueNumbering({
    ...midIRFunction,
    body: optimizeHighIRStatementsWithSet(midIRFunction.body, allocator).statements,
  });
}
