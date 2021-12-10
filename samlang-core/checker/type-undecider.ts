import {
  functionType,
  identifierType,
  tupleType,
  Type,
  UndecidedType,
  UndecidedTypes,
} from '../ast/common-nodes';
import type { SourceFieldType } from '../ast/samlang-nodes';
import { assert, zip } from '../utils';

/**
 * This modules is useful for doing type inference constraint solving on constructors/functions with
 * generic arguments.
 *
 * We can turn those parameter types CONSISTENTLY into undecided types, and use the same type
 * inference engine to solve it.
 */

export function typeReplacement(type: Type, mapping: Readonly<Record<string, Type>>): Type {
  assert(type.type !== 'UndecidedType', 'Type expression should not contain undecided type!');
  switch (type.type) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length === 0) {
        return mapping[type.identifier] ?? type;
      }
      return identifierType(
        type.moduleReference,
        type.identifier,
        type.typeArguments.map((it) => typeReplacement(it, mapping))
      );
    case 'TupleType':
      return tupleType(type.mappings.map((it) => typeReplacement(it, mapping)));
    case 'FunctionType':
      return functionType(
        type.argumentTypes.map((it) => typeReplacement(it, mapping)),
        typeReplacement(type.returnType, mapping)
      );
  }
}

/**
 * Given a `type` and its `typeParameters`, replaces all references to type parameters to freshly
 * created undecided types.
 *
 * @return (`type` with `typeParameters` replaced with undecided types, generated undecided types).
 */
export function undecideTypeParameters(
  type: Type,
  typeParameters: readonly string[]
): readonly [Type, readonly UndecidedType[]] {
  const autoGeneratedUndecidedTypes = UndecidedTypes.nextN(typeParameters.length);
  const replacementMap = Object.fromEntries(zip(typeParameters, autoGeneratedUndecidedTypes));
  return [typeReplacement(type, replacementMap), autoGeneratedUndecidedTypes];
}

/**
 * Given a `typeMappings` and its `typeParameters`, replaces all references to type parameters to
 * freshly created undecided types.
 *
 * @return tuple(
 *  `typeMappings` with `typeParameters` replaced with undecided types,
 *   generated undecided types
 * ).
 */
export function undecideFieldTypeParameters(
  typeMappings: Record<string, SourceFieldType>,
  typeParameters: readonly string[]
): readonly [Record<string, SourceFieldType>, readonly UndecidedType[]] {
  const autoGeneratedUndecidedTypes = UndecidedTypes.nextN(typeParameters.length);
  const replacementMap = Object.fromEntries(zip(typeParameters, autoGeneratedUndecidedTypes));
  const newTypeMappings = Object.fromEntries(
    Object.entries(typeMappings).map(([name, fieldType]) => {
      return [
        name,
        { isPublic: fieldType.isPublic, type: typeReplacement(fieldType.type, replacementMap) },
      ] as const;
    })
  );
  return [newTypeMappings, autoGeneratedUndecidedTypes];
}
