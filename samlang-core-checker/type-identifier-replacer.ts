import { Type, identifierType, tupleType, functionType } from 'samlang-core-ast/common-nodes';

const replaceTypeIdentifier = (
  type: Type,
  replacementMap: Readonly<Record<string, Type | undefined>>
): Type => {
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return replacementMap[type.identifier] ?? type;
      }
      return identifierType(
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => replaceTypeIdentifier(it, replacementMap))
      );
    case 'TupleType':
      return tupleType(type.mappings.map((it) => replaceTypeIdentifier(it, replacementMap)));
    case 'FunctionType':
      return functionType(
        type.argumentTypes.map((it) => replaceTypeIdentifier(it, replacementMap)),
        replaceTypeIdentifier(type.returnType, replacementMap)
      );
    case 'UndecidedType':
      return type;
  }
};

export default replaceTypeIdentifier;
