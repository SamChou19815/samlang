import { Type, UndecidedType, identifierType, tupleType, functionType } from '../ast/common/types';

const resolveType = (
  type: Type,
  undecidedTypeResolver: (undecidedType: UndecidedType) => Type
): Type => {
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      return identifierType(
        type.identifier,
        type.typeArguments.map((it) => resolveType(it, undecidedTypeResolver))
      );
    case 'TupleType':
      return tupleType(type.mappings.map((it) => resolveType(it, undecidedTypeResolver)));
    case 'FunctionType':
      return functionType(
        type.argumentTypes.map((it) => resolveType(it, undecidedTypeResolver)),
        resolveType(type.returnType, undecidedTypeResolver)
      );
    case 'UndecidedType':
      return undecidedTypeResolver(type);
  }
};

export default resolveType;
