import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  MidIRStatement,
  MidIRExpression,
  debugPrintMidIRExpression as expressionToString,
  MidIRIfElseStatement,
  MidIRSingleIfStatement,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRType } from 'samlang-core-ast/mir-nodes';
import { error, LocalStackedContext } from 'samlang-core-utils';

export type IndexAccessBindedValue = {
  readonly __type__: 'IndexAccess';
  readonly type: MidIRType;
  readonly pointerExpression: MidIRExpression;
  readonly index: number;
};

export type BinaryBindedValue = {
  readonly __type__: 'Binary';
  readonly operator: IROperator;
  readonly e1: MidIRExpression;
  readonly e2: MidIRExpression;
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

export class LocalValueContextForOptimization extends LocalStackedContext<MidIRExpression> {
  bind(name: string, expression: MidIRExpression): void {
    this.addLocalValueType(name, expression, error);
  }
}

export const ifElseOrNull = (ifElse: MidIRIfElseStatement): readonly MidIRStatement[] => {
  if (ifElse.s1.length === 0 && ifElse.s2.length === 0 && ifElse.finalAssignments.length === 0) {
    return [];
  }
  return [ifElse];
};

export const singleIfOrNull = (singleIf: MidIRSingleIfStatement): readonly MidIRStatement[] => {
  if (singleIf.statements.length === 0) return [];
  return [singleIf];
};
