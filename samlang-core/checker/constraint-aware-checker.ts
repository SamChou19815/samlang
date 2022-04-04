import { Location, moduleReferenceToString } from '../ast/common-nodes';
import { isTheSameType, SamlangType, SamlangUndecidedType } from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, zip } from '../utils';
import type TypeResolution from './type-resolution';

function typeMeet(hint: SamlangType, actual: SamlangType, resolution: TypeResolution): SamlangType {
  const meetWithResolution = (type1: SamlangType, type2: SamlangType): SamlangType =>
    typeMeet(type1, type2, resolution);

  switch (hint.type) {
    case 'PrimitiveType':
      switch (actual.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(hint, actual, resolution);
        case 'PrimitiveType':
          assert(isTheSameType(hint, actual));
          return hint;
        default:
          throw new Error();
      }
    case 'IdentifierType':
      switch (actual.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(hint, actual, resolution);
        case 'IdentifierType':
          if (
            moduleReferenceToString(hint.moduleReference) !==
              moduleReferenceToString(actual.moduleReference) ||
            hint.identifier !== actual.identifier ||
            hint.typeArguments.length !== actual.typeArguments.length
          ) {
            throw new Error();
          }
          return {
            type: 'IdentifierType',
            reason: actual.reason,
            moduleReference: hint.moduleReference,
            identifier: hint.identifier,
            typeArguments: zip(hint.typeArguments, actual.typeArguments).map(([type1, type2]) =>
              meetWithResolution(type1, type2)
            ),
          };
        default:
          throw new Error();
      }
    case 'TupleType':
      switch (actual.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(hint, actual, resolution);
        case 'TupleType':
          if (hint.mappings.length !== actual.mappings.length) {
            throw new Error();
          }
          return {
            type: 'TupleType',
            reason: actual.reason,
            mappings: zip(hint.mappings, actual.mappings).map(([type1, type2]) =>
              meetWithResolution(type1, type2)
            ),
          };
        default:
          throw new Error();
      }
    case 'FunctionType':
      switch (actual.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(hint, actual, resolution);
        case 'FunctionType': {
          const returnType = typeMeet(hint.returnType, actual.returnType, resolution);
          if (hint.argumentTypes.length !== actual.argumentTypes.length) {
            throw new Error();
          }
          const argumentTypes = zip(hint.argumentTypes, actual.argumentTypes).map(
            ([type1, type2]) => meetWithResolution(type1, type2)
          );
          return { type: 'FunctionType', reason: actual.reason, argumentTypes, returnType };
        }
        default:
          throw new Error();
      }
    case 'UndecidedType':
      return actual.type === 'UndecidedType'
        ? resolution.establishAliasing(hint, actual, meetWithResolution)
        : meetWithUndecidedType(actual, hint, resolution);
  }
}

function meetWithUndecidedType(
  type: SamlangType,
  undecidedType: SamlangUndecidedType,
  resolution: TypeResolution
): SamlangType {
  const resolvedType = resolution.addTypeResolution(undecidedType.index, type);
  return resolvedType === type ? type : typeMeet(type, resolvedType, resolution);
}

export function checkAndInfer(
  expectedType: SamlangType,
  actualType: SamlangType,
  resolution: TypeResolution
):
  | SamlangType
  | { readonly type: 'FAILED_MEET'; readonly expected: SamlangType; readonly actual: SamlangType } {
  const partiallyResolvedActualType = resolution.resolveType(actualType);
  const partiallyResolvedExpectedType = resolution.resolveType(expectedType);
  try {
    return typeMeet(partiallyResolvedExpectedType, partiallyResolvedActualType, resolution);
  } catch {
    return {
      type: 'FAILED_MEET',
      expected: partiallyResolvedExpectedType,
      actual: partiallyResolvedActualType,
    };
  }
}

export class ConstraintAwareChecker {
  constructor(
    public readonly resolution: TypeResolution,
    private readonly errorCollector: ModuleErrorCollector
  ) {}

  readonly checkAndInfer = (
    hint: SamlangType,
    actual: SamlangType,
    errorLocation: Location
  ): SamlangType => {
    const result = checkAndInfer(hint, actual, this.resolution);
    if (result.type === 'FAILED_MEET') {
      this.errorCollector.reportUnexpectedTypeError(errorLocation, result.expected, result.actual);
      return result.expected;
    }
    return result;
  };
}
