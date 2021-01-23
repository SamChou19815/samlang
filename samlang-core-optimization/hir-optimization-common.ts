import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRStatement,
  HighIRExpression,
  debugPrintHighIRExpression as expressionToString,
  HighIRIfElseStatement,
  HighIRSingleIfStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRType } from 'samlang-core-ast/hir-types';
import { error, LocalStackedContext } from 'samlang-core-utils';

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

export const bindedValueToString = (value: BindedValue): string => {
  switch (value.__type__) {
    case 'IndexAccess':
      return `${expressionToString(value.pointerExpression)}[${value.index}]`;
    case 'Binary':
      return `(${expressionToString(value.e1)}${value.operator}${expressionToString(value.e2)})`;
  }
};

export class LocalValueContextForOptimization extends LocalStackedContext<HighIRExpression> {
  bind(name: string, expression: HighIRExpression): void {
    // istanbul ignore next
    this.addLocalValueType(name, expression, () => error(`${name} is collided!`));
  }
}

export const ifElseOrNull = (ifElse: HighIRIfElseStatement): readonly HighIRStatement[] => {
  if (ifElse.s1.length === 0 && ifElse.s2.length === 0 && ifElse.finalAssignments.length === 0) {
    return [];
  }
  return [ifElse];
};

export const singleIfOrNull = (singleIf: HighIRSingleIfStatement): readonly HighIRStatement[] => {
  if (singleIf.statements.length === 0) return [];
  return [singleIf];
};
