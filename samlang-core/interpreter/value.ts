import { SamlangExpression } from '../ast/samlang-expressions';
import { InterpretationContext } from './interpretation-context';

export type Value =
  | UnitValue
  | bigint
  | string
  | boolean
  | TupleValue
  | ObjectValue
  | VariantValue
  | FunctionValue;

export type UnitValue = {
  readonly type: 'unit';
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
