import type { Type } from 'samlang-core-ast/common-nodes';
import {
  HighIRType,
  HIR_VOID_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_ANY_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-types';

const lowerSamlangType = (type: Type, genericTypes: ReadonlySet<string>): HighIRType => {
  // istanbul ignore next
  if (type.type === 'UndecidedType') throw new Error('Unreachable!');
  switch (type.type) {
    case 'PrimitiveType':
      switch (type.name) {
        case 'bool':
        case 'int':
          return HIR_INT_TYPE;
        case 'unit':
          return HIR_VOID_TYPE;
        case 'string':
          return HIR_STRING_TYPE;
      }
    // eslint-disable-next-line no-fallthrough
    case 'IdentifierType': {
      if (genericTypes.has(type.identifier)) return HIR_ANY_TYPE;
      return HIR_IDENTIFIER_TYPE(`${type.moduleReference.parts.join('_')}_${type.identifier}`);
    }
    case 'TupleType':
      return HIR_STRUCT_TYPE(type.mappings.map((it) => lowerSamlangType(it, genericTypes)));
    case 'FunctionType':
      return HIR_FUNCTION_TYPE(
        type.argumentTypes.map((it) => lowerSamlangType(it, genericTypes)),
        lowerSamlangType(type.returnType, genericTypes)
      );
  }
};

export default lowerSamlangType;
