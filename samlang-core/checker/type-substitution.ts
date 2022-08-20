import { SamlangType, SourceFunctionType, SourceIdentifierType } from '../ast/samlang-nodes';

export default function performTypeSubstitution(
  type: SamlangType,
  mapping: ReadonlyMap<string, SamlangType>,
): SamlangType {
  switch (type.__type__) {
    case 'UnknownType':
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return mapping.get(type.identifier) ?? type;
      }
      return SourceIdentifierType(
        type.reason,
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => performTypeSubstitution(it, mapping)),
      );
    case 'FunctionType':
      return SourceFunctionType(
        type.reason,
        type.argumentTypes.map((it) => performTypeSubstitution(it, mapping)),
        performTypeSubstitution(type.returnType, mapping),
      );
  }
}
