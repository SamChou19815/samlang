import { checkNotNull } from 'samlang-core-utils';

export type HighIRPrimitiveType = {
  readonly __type__: 'PrimitiveType';
  readonly type: 'bool' | 'int' | 'any' | 'string';
};

export type HighIRIdentifierType = { readonly __type__: 'IdentifierType'; readonly name: string };

export type HighIRStructType = {
  readonly __type__: 'StructType';
  readonly mappings: readonly HighIRType[];
};

export type HighIRFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly HighIRType[];
  readonly returnType: HighIRType;
};

export type HighIRType =
  | HighIRPrimitiveType
  | HighIRIdentifierType
  | HighIRStructType
  | HighIRFunctionType;

export const HIR_BOOL_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'bool' };
export const HIR_INT_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'int' };
export const HIR_ANY_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'any' };
export const HIR_STRING_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'string' };

export const HIR_IDENTIFIER_TYPE = (name: string): HighIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
});

export const HIR_STRUCT_TYPE = (mappings: readonly HighIRType[]): HighIRStructType => ({
  __type__: 'StructType',
  mappings,
});

export const HIR_FUNCTION_TYPE = (
  argumentTypes: readonly HighIRType[],
  returnType: HighIRType
): HighIRFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export const HIR_CLOSURE_TYPE: HighIRIdentifierType = HIR_IDENTIFIER_TYPE('_builtin_Closure');

export const prettyPrintHighIRType = (type: HighIRType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return type.name;
    case 'StructType':
      return `(${type.mappings.map(prettyPrintHighIRType).join(', ')})`;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map(prettyPrintHighIRType)
        .join(', ')}) -> ${prettyPrintHighIRType(type.returnType)}`;
  }
};

export const isTheSameHighIRType = (t1: HighIRType, t2: HighIRType): boolean => {
  switch (t1.__type__) {
    case 'PrimitiveType':
      return t2.__type__ === 'PrimitiveType' && t1.type === t2.type;
    case 'IdentifierType':
      return t2.__type__ === 'IdentifierType' && t1.name === t2.name;
    case 'StructType':
      return (
        t2.__type__ === 'StructType' &&
        t1.mappings.length === t2.mappings.length &&
        t1.mappings.every((t1Element, index) =>
          isTheSameHighIRType(t1Element, checkNotNull(t2.mappings[index]))
        )
      );
    case 'FunctionType':
      return (
        t2.__type__ === 'FunctionType' &&
        isTheSameHighIRType(t1.returnType, t2.returnType) &&
        t1.argumentTypes.length === t2.argumentTypes.length &&
        t1.argumentTypes.every((t1Argument, index) =>
          isTheSameHighIRType(t1Argument, checkNotNull(t2.argumentTypes[index]))
        )
      );
  }
};
