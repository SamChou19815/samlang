import type { Type } from 'samlang-core-ast/common-nodes';
import {
  HighIRType,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_ANY_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRUCT_TYPE,
  HIR_CLOSURE_TYPE,
} from 'samlang-core-ast/hir-types';
import { assert } from 'samlang-core-utils';

const lowerSamlangType = (type: Type, genericTypes: ReadonlySet<string>): HighIRType => {
  assert(type.type !== 'UndecidedType', 'Unreachable!');
  switch (type.type) {
    case 'PrimitiveType':
      switch (type.name) {
        case 'bool':
          return HIR_BOOL_TYPE;
        case 'int':
        case 'unit':
          return HIR_INT_TYPE;
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
      return HIR_CLOSURE_TYPE;
  }
};

export default lowerSamlangType;
