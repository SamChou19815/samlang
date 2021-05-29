export type HighIRPrimitiveType = {
  readonly __type__: 'PrimitiveType';
  readonly type: 'bool' | 'int' | 'string';
};

export type HighIRIdentifierType = {
  readonly __type__: 'IdentifierType';
  readonly name: string;
  readonly typeArguments: readonly HighIRType[];
};

export type HighIRFunctionType = {
  readonly __type__: 'FunctionType';
  readonly argumentTypes: readonly HighIRType[];
  readonly returnType: HighIRType;
};

export type HighIRType = HighIRPrimitiveType | HighIRIdentifierType | HighIRFunctionType;

export const HIR_BOOL_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'bool' };
export const HIR_INT_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'int' };
export const HIR_STRING_TYPE: HighIRPrimitiveType = { __type__: 'PrimitiveType', type: 'string' };

export const HIR_IDENTIFIER_TYPE = (
  name: string,
  typeArguments: readonly HighIRType[]
): HighIRIdentifierType => ({
  __type__: 'IdentifierType',
  name,
  typeArguments,
});

export const HIR_FUNCTION_TYPE = (
  argumentTypes: readonly HighIRType[],
  returnType: HighIRType
): HighIRFunctionType => ({ __type__: 'FunctionType', argumentTypes, returnType });

export const prettyPrintHighIRType = (type: HighIRType): string => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type.type;
    case 'IdentifierType':
      return type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(prettyPrintHighIRType).join(', ')}>`;
    case 'FunctionType':
      return `(${type.argumentTypes
        .map(prettyPrintHighIRType)
        .join(', ')}) -> ${prettyPrintHighIRType(type.returnType)}`;
  }
};
