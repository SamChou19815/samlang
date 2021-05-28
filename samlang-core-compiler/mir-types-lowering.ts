import type MidIRTypeSynthesizer from './mir-type-synthesizer';

import type { Type } from 'samlang-core-ast/common-nodes';
import {
  MidIRType,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
  MIR_STRING_TYPE,
  MIR_ANY_TYPE,
  MIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/mir-types';
import { assert } from 'samlang-core-utils';

const lowerSamlangType = (
  type: Type,
  genericTypes: ReadonlySet<string>,
  typeSynthesizer: MidIRTypeSynthesizer
): MidIRType => {
  assert(type.type !== 'UndecidedType', 'Unreachable!');
  switch (type.type) {
    case 'PrimitiveType':
      switch (type.name) {
        case 'bool':
          return MIR_BOOL_TYPE;
        case 'int':
        case 'unit':
          return MIR_INT_TYPE;
        case 'string':
          return MIR_STRING_TYPE;
      }
    case 'IdentifierType': {
      if (genericTypes.has(type.identifier)) return MIR_ANY_TYPE;
      return MIR_IDENTIFIER_TYPE(`${type.moduleReference.parts.join('_')}_${type.identifier}`);
    }
    case 'TupleType': {
      const typeDefinition = typeSynthesizer.synthesize(
        type.mappings.map((it) => lowerSamlangType(it, genericTypes, typeSynthesizer))
      );
      return MIR_IDENTIFIER_TYPE(typeDefinition.identifier);
    }
    case 'FunctionType': {
      const typeDefinition = typeSynthesizer.synthesize([MIR_ANY_TYPE, MIR_ANY_TYPE]);
      return MIR_IDENTIFIER_TYPE(typeDefinition.identifier);
    }
  }
};

export default lowerSamlangType;
