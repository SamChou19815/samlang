import {
  SamlangType,
  SamlangUndecidedType,
  SourceFunctionType,
  SourceIdentifierType,
} from '../ast/samlang-nodes';

export default function resolveType(
  type: SamlangType,
  undecidedTypeResolver: (undecidedType: SamlangUndecidedType) => SamlangType
): SamlangType {
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      return SourceIdentifierType(
        type.reason,
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => resolveType(it, undecidedTypeResolver))
      );
    case 'FunctionType':
      return SourceFunctionType(
        type.reason,
        type.argumentTypes.map((it) => resolveType(it, undecidedTypeResolver)),
        resolveType(type.returnType, undecidedTypeResolver)
      );
    case 'UndecidedType':
      return undecidedTypeResolver(type);
  }
}
