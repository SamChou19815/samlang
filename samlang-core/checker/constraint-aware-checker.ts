import { isTheSameType, Range, Type, UndecidedType } from '../ast/common-nodes';
import type { ModuleErrorCollector } from '../errors';
import { assert, zip } from '../utils';
import type TypeResolution from './type-resolution';

function meet(t1: Type, t2: Type, resolution: TypeResolution): Type {
  const meetWithResolution = (type1: Type, type2: Type): Type => meet(type1, type2, resolution);

  switch (t1.type) {
    case 'PrimitiveType':
      switch (t2.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(t1, t2, resolution);
        case 'PrimitiveType':
          assert(isTheSameType(t1, t2));
          return t1;
        default:
          throw new Error();
      }
    case 'IdentifierType':
      switch (t2.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(t1, t2, resolution);
        case 'IdentifierType':
          if (
            t1.moduleReference.toString() !== t2.moduleReference.toString() ||
            t1.identifier !== t2.identifier ||
            t1.typeArguments.length !== t2.typeArguments.length
          ) {
            throw new Error();
          }
          return {
            type: 'IdentifierType',
            moduleReference: t1.moduleReference,
            identifier: t1.identifier,
            typeArguments: zip(t1.typeArguments, t2.typeArguments).map(([type1, type2]) =>
              meetWithResolution(type1, type2)
            ),
          };
        default:
          throw new Error();
      }
    case 'TupleType':
      switch (t2.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(t1, t2, resolution);
        case 'TupleType':
          if (t1.mappings.length !== t2.mappings.length) {
            throw new Error();
          }
          return {
            type: 'TupleType',
            mappings: zip(t1.mappings, t2.mappings).map(([type1, type2]) =>
              meetWithResolution(type1, type2)
            ),
          };
        default:
          throw new Error();
      }
    case 'FunctionType':
      switch (t2.type) {
        case 'UndecidedType':
          return meetWithUndecidedType(t1, t2, resolution);
        case 'FunctionType': {
          const returnType = meet(t1.returnType, t2.returnType, resolution);
          if (t1.argumentTypes.length !== t2.argumentTypes.length) {
            throw new Error();
          }
          const argumentTypes = zip(t1.argumentTypes, t2.argumentTypes).map(([type1, type2]) =>
            meetWithResolution(type1, type2)
          );
          return { type: 'FunctionType', argumentTypes, returnType };
        }
        default:
          throw new Error();
      }
    case 'UndecidedType':
      return t2.type === 'UndecidedType'
        ? resolution.establishAliasing(t1, t2, meetWithResolution)
        : meetWithUndecidedType(t2, t1, resolution);
  }
}

function meetWithUndecidedType(
  type: Type,
  undecidedType: UndecidedType,
  resolution: TypeResolution
): Type {
  const resolvedType = resolution.addTypeResolution(undecidedType.index, type);
  return resolvedType === type ? type : meet(type, resolvedType, resolution);
}

export function checkAndInfer(
  expectedType: Type,
  actualType: Type,
  resolution: TypeResolution
): Type | { readonly type: 'FAILED_MEET'; readonly expected: Type; readonly actual: Type } {
  const partiallyResolvedActualType = resolution.resolveType(actualType);
  const partiallyResolvedExpectedType = resolution.resolveType(expectedType);
  try {
    return meet(partiallyResolvedExpectedType, partiallyResolvedActualType, resolution);
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

  readonly checkAndInfer = (expectedType: Type, actualType: Type, errorRange: Range): Type => {
    const result = checkAndInfer(expectedType, actualType, this.resolution);
    if (result.type === 'FAILED_MEET') {
      this.errorCollector.reportUnexpectedTypeError(errorRange, result.expected, result.actual);
      return result.expected;
    }
    return result;
  };
}
