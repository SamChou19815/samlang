import { SamlangExpression } from '../ast/lang/samlang-expressions';
import { mapEquals } from '../util/collections';
import { InterpretationContext } from './interpretation-context';

export type Value =
  | UnitValue
  | IntValue
  | StringValue
  | BoolValue
  | TupleValue
  | ObjectValue
  | VariantValue
  | FunctionValue;

export type UnitValue = {
  readonly type: 'unit';
};

export type IntValue = {
  readonly type: 'int';
  readonly value: number;
};

export type StringValue = {
  readonly type: 'string';
  readonly value: string;
};

export type BoolValue = {
  readonly type: 'bool';
  readonly value: boolean;
};

export type TupleValue = {
  readonly type: 'tuple';
  readonly tupleContent: Value[];
};

export type ObjectValue = {
  readonly type: 'object';
  readonly objectContent: Map<string, Value>;
};

export type VariantValue = {
  readonly type: 'variant';
  readonly tag: string;
  data: Value;
};

export type FunctionValue = {
  readonly type: 'functionValue';
  readonly arguments: string[];
  readonly body: SamlangExpression;
  context: InterpretationContext;
};

export const isSameValue = (v1: Value, v2: Value): boolean => {
  switch (v1.type) {
    case 'unit':
      return v2.type === 'unit';
    case 'int':
      return v2.type === 'int' && v1.value === v2.value;
    case 'string':
      return v2.type === 'string' && v1.value === v2.value;
    case 'bool':
      return v2.type === 'bool' && v1.value === v2.value;
    case 'tuple':
      return (
        v2.type === 'tuple' &&
        v1.tupleContent.length === v2.tupleContent.length &&
        v1.tupleContent.every((v1Element, index) => isSameValue(v1Element, v2.tupleContent[index]))
      );
    case 'object':
      return v2.type === 'object' && mapEquals(v1.objectContent, v2.objectContent, isSameValue);
    case 'variant':
      return v2.type === 'variant' && v1.tag === v2.tag && isSameValue(v1.data, v2.data);
    case 'functionValue':
      return v2.type === 'functionValue' && v1.arguments.every((arg, i) => arg === v2.arguments[i]);
  }
};
