import type { Type, Range, ModuleReference } from '../ast/common-nodes';
import type { ModuleErrorCollector } from '../errors';
import { checkNotNull } from '../utils';

export interface IdentifierTypeValidator {
  /**
   * Given the `name` of the identifier and the number of applied arguments, check the context to see whether it
   * matches any type definition in scope.
   */
  identifierTypeIsWellDefined(
    moduleReference: ModuleReference,
    name: string,
    typeArgumentLength: number
  ): boolean;
}

/**
 * @returns an invalidid string identifier, null if there is none.
 */
export function findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(
  type: Type,
  identifierTypeValidator: IdentifierTypeValidator
): string | null {
  switch (type.type) {
    case 'PrimitiveType':
      return null;
    case 'IdentifierType':
      if (
        !identifierTypeValidator.identifierTypeIsWellDefined(
          type.moduleReference,
          type.identifier,
          type.typeArguments.length
        )
      ) {
        return type.identifier;
      }
      return findInvalidTypeIdentifierForList(type.typeArguments, identifierTypeValidator);
    case 'TupleType':
      return findInvalidTypeIdentifierForList(type.mappings, identifierTypeValidator);
    case 'FunctionType':
      return (
        findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(type.returnType, identifierTypeValidator) ??
        findInvalidTypeIdentifierForList(type.argumentTypes, identifierTypeValidator)
      );
    case 'UndecidedType':
      return null;
  }
}

function findInvalidTypeIdentifierForList(
  types: readonly Type[],
  identifierTypeValidator: IdentifierTypeValidator
): string | null {
  for (let i = 0; i < types.length; i += 1) {
    const invalidName = findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(
      checkNotNull(types[i]),
      identifierTypeValidator
    );
    if (invalidName != null) return invalidName;
  }
  return null;
}

export function validateType(
  type: Type,
  identifierTypeValidator: IdentifierTypeValidator,
  errorCollector: ModuleErrorCollector,
  errorRange: Range
): boolean {
  const badIdentifier = findInvalidTypeIdentifier_EXPOSED_FOR_TESTING(
    type,
    identifierTypeValidator
  );
  if (badIdentifier == null) {
    return true;
  }
  errorCollector.reportNotWellDefinedIdentifierError(errorRange, badIdentifier);
  return false;
}
