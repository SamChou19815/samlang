/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import { Type, prettyPrintType } from '../ast/common/types';

export abstract class CompileTimeError<T = string, C = number> {
  constructor(
    public readonly errorType: T,
    public readonly errorCode: C,
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly reason: string
  ) {}

  toString(): string {
    const filename = this.moduleReference.toFilename();
    return `${filename}:${this.range}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError<'SyntaxError', 1> {
  constructor(moduleReference: ModuleReference, range: Range, reason: string) {
    super('SyntaxError', 1, moduleReference, range, reason);
  }
}

export class UnexpectedTypeError extends CompileTimeError<'UnexpectedType', 2> {
  constructor(moduleReference: ModuleReference, range: Range, expected: Type, actual: Type) {
    super(
      'UnexpectedType',
      2,
      moduleReference,
      range,
      (() => {
        const expectedType = prettyPrintType(expected);
        const actualType = prettyPrintType(actual);
        return `Expected: \`${expectedType}\`, actual: \`${actualType}\`.`;
      })()
    );
  }
}

export class NotWellDefinedIdentifierError extends CompileTimeError<'NotWellDefinedIdentifier', 3> {
  constructor(moduleReference: ModuleReference, range: Range, badIdentifier: string) {
    super(
      'NotWellDefinedIdentifier',
      3,
      moduleReference,
      range,
      `\`${badIdentifier}\` is not well defined.`
    );
  }
}

export class UnresolvedNameError extends CompileTimeError<'UnresolvedName', 4> {
  constructor(moduleReference: ModuleReference, range: Range, unresolvedName: string) {
    super(
      'UnresolvedName',
      4,
      moduleReference,
      range,
      `Name \`${unresolvedName}\` is not resolved.`
    );
  }
}

export class UnsupportedClassTypeDefinitionError extends CompileTimeError<
  'UnsupportedClassTypeDefinition',
  5
> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    typeDefinitionType: 'object' | 'variant'
  ) {
    super(
      'UnsupportedClassTypeDefinition',
      5,
      moduleReference,
      range,
      `Expect the current class to have \`${typeDefinitionType}\` type definition, but it doesn't.`
    );
  }
}

export class UnexpectedTypeKindError extends CompileTimeError<'UnexpectedTypeKind', 6> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedTypeKind: string,
    actualType: string | Type
  ) {
    super(
      'UnexpectedTypeKind',
      6,
      moduleReference,
      range,
      `Expected kind: \`${expectedTypeKind}\`, actual: \`${
        typeof actualType === 'string' ? actualType : prettyPrintType(actualType)
      }\`.`
    );
  }
}

export class TypeParameterSizeMismatchError extends CompileTimeError<
  'TypeParameterSizeMismatch',
  7
> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedSize: number,
    actualSize: number
  ) {
    super(
      'TypeParameterSizeMismatch',
      7,
      moduleReference,
      range,
      `Incorrect number of type arguments. Expected: ${expectedSize}, actual: ${actualSize}.`
    );
  }
}

export class TupleSizeMismatchError extends CompileTimeError<'TupleSizeMismatch', 8> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedSize: number,
    actualSize: number
  ) {
    super(
      'TupleSizeMismatch',
      8,
      moduleReference,
      range,
      `Incorrect tuple size. Expected: ${expectedSize}, actual: ${actualSize}.`
    );
  }
}

export class InsufficientTypeInferenceContextError extends CompileTimeError<
  'InsufficientTypeInferenceContext',
  9
> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super(
      'InsufficientTypeInferenceContext',
      9,
      moduleReference,
      range,
      'There is not enough context information to decide the type of this expression.'
    );
  }
}

export class CollisionError extends CompileTimeError<'Collision', 10> {
  constructor(moduleReference: ModuleReference, range: Range, collidedName: string) {
    super(
      'Collision',
      10,
      moduleReference,
      range,
      `Name \`${collidedName}\` collides with a previously defined name.`
    );
  }
}

export class IllegalOtherClassMatch extends CompileTimeError<'IllegalOtherClassMatch', 11> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super(
      'IllegalOtherClassMatch',
      11,
      moduleReference,
      range,
      "It is illegal to match on a value of other class's type."
    );
  }
}

export class IllegalThisError extends CompileTimeError<'IllegalThis', 12> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super(
      'IllegalThis',
      12,
      moduleReference,
      range,
      'Keyword `this` cannot be used in this context.'
    );
  }
}

export class InconsistentFieldsInObjectError extends CompileTimeError<
  'InconsistentFieldsInObject',
  13
> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedFields: Iterable<string>,
    actualFields: Iterable<string>
  ) {
    super(
      'InconsistentFieldsInObject',
      13,
      moduleReference,
      range,
      `Inconsistent fields. Expected: \`${[...expectedFields].join(', ')}\`, actual: \`${[
        ...actualFields,
      ].join(', ')}\`.`
    );
  }
}

export class DuplicateFieldDeclarationError extends CompileTimeError<
  'DuplicateFieldDeclaration',
  14
> {
  constructor(moduleReference: ModuleReference, range: Range, fieldName: string) {
    super(
      'DuplicateFieldDeclaration',
      14,
      moduleReference,
      range,
      `Field name \`${fieldName}\` is declared twice.`
    );
  }
}
