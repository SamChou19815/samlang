import {
  Type,
  UndecidedTypes,
  UndecidedType,
  identifierType,
  tupleType,
  functionType,
} from 'samlang-core-ast/common-nodes';
import type { FieldType } from 'samlang-core-ast/samlang-toplevel';
import { assert, zip } from 'samlang-core-utils';

/**
 * This modules is useful for doing type inference constraint solving on constructors/functions with
 * generic arguments.
 *
 * We can turn those parameter types CONSISTENTLY into undecided types, and use the same type
 * inference engine to solve it.
 */

/** Name of identifier to turn into undecided type => the requsted undecided type to be turned into. */
type UndeciderMapping = Record<string, UndecidedType>;

function undecide(type: Type, mapping: UndeciderMapping): Type {
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
        type.typeArguments.map((it) => undecide(it, mapping))
      );
    case 'TupleType':
      return tupleType(type.mappings.map((it) => undecide(it, mapping)));
    case 'FunctionType':
      return functionType(
        type.argumentTypes.map((it) => undecide(it, mapping)),
        undecide(type.returnType, mapping)
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
  return [undecide(type, replacementMap), autoGeneratedUndecidedTypes];
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
  typeMappings: Record<string, FieldType>,
  typeParameters: readonly string[]
): readonly [Record<string, FieldType>, readonly UndecidedType[]] {
  const autoGeneratedUndecidedTypes = UndecidedTypes.nextN(typeParameters.length);
  const replacementMap = Object.fromEntries(zip(typeParameters, autoGeneratedUndecidedTypes));
  const newTypeMappings = Object.fromEntries(
    Object.entries(typeMappings).map(([name, fieldType]) => {
      return [
        name,
        { isPublic: fieldType.isPublic, type: undecide(fieldType.type, replacementMap) },
      ] as const;
    })
  );
  return [newTypeMappings, autoGeneratedUndecidedTypes];
}
