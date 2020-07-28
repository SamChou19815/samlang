import { SamlangExpression } from "../ast/lang/samlang-expressions";
import { InterpretationContext } from "./interpretation-context";

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
  readonly value: void;
}

export type IntValue = {
  readonly type: 'int';
  readonly value: number;
};

export type StringValue = {
  readonly type: 'string';
  readonly value: string;
}

export type BoolValue = {
  readonly type: 'bool';
  readonly value: boolean;
}

export type TupleValue = {
  readonly type: 'tuple';
  readonly tupleContent: Value[];
}

export type ObjectValue = {
  readonly type: 'object';
  readonly objectContent: Map<String, Value>;
}

export type VariantValue = {
  readonly type: 'variant';
  readonly tag: string;
  data: Value
}

export type FunctionValue = {
  readonly type: 'functionValue';
  readonly arguments: string[];
  readonly body: SamlangExpression;
  readonly context: InterpretationContext;
}