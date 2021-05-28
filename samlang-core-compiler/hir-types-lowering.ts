import type HighIRTypeSynthesizer from './hir-type-synthesizer';

import type { Type } from 'samlang-core-ast/common-nodes';
import {
  HighIRType,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_ANY_TYPE,
  HIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/hir-types';
import { assert } from 'samlang-core-utils';

const lowerSamlangType = (
  type: Type,
  genericTypes: ReadonlySet<string>,
  typeSynthesizer: HighIRTypeSynthesizer
): HighIRType => {
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
    case 'IdentifierType': {
      if (genericTypes.has(type.identifier)) return HIR_ANY_TYPE;
      return HIR_IDENTIFIER_TYPE(`${type.moduleReference.parts.join('_')}_${type.identifier}`);
    }
    case 'TupleType': {
      const typeDefinition = typeSynthesizer.synthesize(
        type.mappings.map((it) => lowerSamlangType(it, genericTypes, typeSynthesizer))
      );
      return HIR_IDENTIFIER_TYPE(typeDefinition.identifier);
    }
    case 'FunctionType': {
      const typeDefinition = typeSynthesizer.synthesize([HIR_ANY_TYPE, HIR_ANY_TYPE]);
      return HIR_IDENTIFIER_TYPE(typeDefinition.identifier);
    }
  }
};

export default lowerSamlangType;
