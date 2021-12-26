import {
  SamlangType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceTupleType,
} from '../ast/samlang-nodes';

export default function replaceTypeIdentifier(
  type: SamlangType,
  replacementMap: Readonly<Record<string, SamlangType>>
): SamlangType {
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return replacementMap[type.identifier] ?? type;
      }
      return SourceIdentifierType(
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => replaceTypeIdentifier(it, replacementMap))
      );
    case 'TupleType':
      return SourceTupleType(type.mappings.map((it) => replaceTypeIdentifier(it, replacementMap)));
    case 'FunctionType':
      return SourceFunctionType(
        type.argumentTypes.map((it) => replaceTypeIdentifier(it, replacementMap)),
        replaceTypeIdentifier(type.returnType, replacementMap)
      );
    case 'UndecidedType':
      return type;
  }
}
