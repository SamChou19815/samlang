import type { IROperator } from '../ast/common-operators';
import {
  debugPrintHighIRExpression as expressionToString,
  HighIRExpression,
  HighIRIfElseStatement,
  HighIRSingleIfStatement,
  HighIRStatement,
  HighIRType,
} from '../ast/hir-nodes';
import { error, LocalStackedContext } from '../utils';

export type IndexAccessBindedValue = {
  readonly __type__: 'IndexAccess';
  readonly type: HighIRType;
  readonly pointerExpression: HighIRExpression;
  readonly index: number;
};

export type BinaryBindedValue = {
  readonly __type__: 'Binary';
  readonly operator: IROperator;
  readonly e1: HighIRExpression;
  readonly e2: HighIRExpression;
};

export type BindedValue = IndexAccessBindedValue | BinaryBindedValue;

export function bindedValueToString(value: BindedValue): string {
  switch (value.__type__) {
    case 'IndexAccess':
      return `${expressionToString(value.pointerExpression)}[${value.index}]`;
    case 'Binary':
      return `(${expressionToString(value.e1)}${value.operator}${expressionToString(value.e2)})`;
  }
}

export class LocalValueContextForOptimization extends LocalStackedContext<HighIRExpression> {
  bind(name: string, expression: HighIRExpression): void {
    this.addLocalValueType(name, expression, error);
  }
}

export function ifElseOrNull(ifElse: HighIRIfElseStatement): readonly HighIRStatement[] {
  if (ifElse.s1.length === 0 && ifElse.s2.length === 0 && ifElse.finalAssignments.length === 0) {
    return [];
  }
  return [ifElse];
}

export function singleIfOrNull(singleIf: HighIRSingleIfStatement): readonly HighIRStatement[] {
  if (singleIf.statements.length === 0) return [];
  return [singleIf];
}
