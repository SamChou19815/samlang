import { zip } from 'samlang-core-utils';

export type MidIRPrimitiveType = {
  readonly __type__: 'PrimitiveType';
  readonly type: 'bool' | 'int' | 'any' | 'string';
};

export type MidIRIdentifierType = { readonly __type__: 'IdentifierType'; readonly name: string };

export type MidIRFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly MidIRType[];
  readonly returnType: MidIRType;
};

export type MidIRType = MidIRPrimitiveType | MidIRIdentifierType | MidIRFunctionType;

export const MIR_BOOL_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'bool' };
export const MIR_INT_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'int' };
export const MIR_ANY_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'any' };
export const MIR_STRING_TYPE: MidIRPrimitiveType = { __type__: 'PrimitiveType', type: 'string' };

export const MIR_IDENTIFIER_TYPE = (name: string): MidIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
});

export const MIR_FUNCTION_TYPE = (
  argumentTypes: readonly MidIRType[],
  returnType: MidIRType
): MidIRFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export const prettyPrintMidIRType = (type: MidIRType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return type.name;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map(prettyPrintMidIRType)
        .join(', ')}) -> ${prettyPrintMidIRType(type.returnType)}`;
  }
};

const standardizeMidIRTypeForComparison = (t: MidIRType): MidIRType =>
  t.__type__ === 'PrimitiveType' && t.type === 'string' ? MIR_ANY_TYPE : t;

export const isTheSameMidIRType = (type1: MidIRType, type2: MidIRType): boolean => {
  const t1 = standardizeMidIRTypeForComparison(type1);
  const t2 = standardizeMidIRTypeForComparison(type2);
  switch (t1.__type__) {
    case 'PrimitiveType':
      return t2.__type__ === 'PrimitiveType' && t1.type === t2.type;
    case 'IdentifierType':
      return t2.__type__ === 'IdentifierType' && t1.name === t2.name;
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameMidIRType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        zip(t1.argumentTypes, t2.argumentTypes).every(([t1Element, t2Element]) =>
          isTheSameMidIRType(t1Element, t2Element)
        )
      );
  }
};
