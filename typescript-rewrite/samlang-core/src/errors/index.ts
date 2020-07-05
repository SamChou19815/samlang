/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import { Type, prettyPrintType } from '../ast/common/types';

export abstract class CompileTimeError<T = string> {
  constructor(
    public readonly errorType: T,
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly reason: string
  ) {}

  toString(): string {
    const filename = this.moduleReference.toFilename();
    return `${filename}:${this.range}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError<'SyntaxError'> {
  constructor(moduleReference: ModuleReference, range: Range, reason: string) {
    super('SyntaxError', moduleReference, range, reason);
  }
}

export class UnexpectedTypeError extends CompileTimeError<'UnexpectedType'> {
  constructor(moduleReference: ModuleReference, range: Range, expected: Type, actual: Type) {
    super(
      'UnexpectedType',
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

export class NotWellDefinedIdentifierError extends CompileTimeError<'NotWellDefinedIdentifier'> {
  constructor(moduleReference: ModuleReference, range: Range, badIdentifier: string) {
    super(
      'NotWellDefinedIdentifier',
      moduleReference,
      range,
      `\`${badIdentifier}\` is not well defined.`
    );
  }
}

export class UnresolvedNameError extends CompileTimeError<'UnresolvedName'> {
  constructor(moduleReference: ModuleReference, range: Range, unresolvedName: string) {
    super('UnresolvedName', moduleReference, range, `Name \`${unresolvedName}\` is not resolved.`);
  }
}

export class UnsupportedClassTypeDefinitionError extends CompileTimeError<
  'UnsupportedClassTypeDefinition'
> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    typeDefinitionType: 'object' | 'variant'
  ) {
    super(
      'UnsupportedClassTypeDefinition',
      moduleReference,
      range,
      `Expect the current class to have \`${typeDefinitionType}\` type definition, but it doesn't.`
    );
  }
}

export class UnexpectedTypeKindError extends CompileTimeError<'UnexpectedTypeKind'> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedTypeKind: string,
    actualType: string | Type
  ) {
    super(
      'UnexpectedTypeKind',
      moduleReference,
      range,
      `Expected kind: \`${expectedTypeKind}\`, actual: \`${
        typeof actualType === 'string' ? actualType : prettyPrintType(actualType)
      }\`.`
    );
  }
}

export class TupleSizeMismatchError extends CompileTimeError<'TupleSizeMismatch'> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedSize: number,
    actualSize: number
  ) {
    super(
      'TupleSizeMismatch',
      moduleReference,
      range,
      `Incorrect tuple size. Expected: ${expectedSize}, actual: ${actualSize}.`
    );
  }
}

export class InsufficientTypeInferenceContextError extends CompileTimeError<
  'InsufficientTypeInferenceContext'
> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super(
      'InsufficientTypeInferenceContext',
      moduleReference,
      range,
      'There is not enough context information to decide the type of this expression.'
    );
  }
}

export class CollisionError extends CompileTimeError<'Collision'> {
  constructor(moduleReference: ModuleReference, range: Range, collidedName: string) {
    super(
      'Collision',
      moduleReference,
      range,
      `Name \`${collidedName}\` collides with a previously defined name.`
    );
  }
}

export class IllegalOtherClassMatch extends CompileTimeError<'IllegalOtherClassMatch'> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super(
      'IllegalOtherClassMatch',
      moduleReference,
      range,
      "It is illegal to match on a value of other class's type."
    );
  }
}

export class IllegalThisError extends CompileTimeError<'IllegalThis'> {
  constructor(moduleReference: ModuleReference, range: Range) {
    super('IllegalThis', moduleReference, range, 'Keyword `this` cannot be used in this context.');
  }
}

export class InconsistentFieldsInObjectError extends CompileTimeError<
  'InconsistentFieldsInObject'
> {
  constructor(
    moduleReference: ModuleReference,
    range: Range,
    expectedFields: Iterable<string>,
    actualFields: Iterable<string>
  ) {
    super(
      'InconsistentFieldsInObject',
      moduleReference,
      range,
      `Inconsistent fields. Expected: \`${[...expectedFields].join(', ')}\`, actual: \`${[
        ...actualFields,
      ].join(', ')}\`.`
    );
  }
}

export class DuplicateFieldDeclarationError extends CompileTimeError<'DuplicateFieldDeclaration'> {
  constructor(moduleReference: ModuleReference, range: Range, fieldName: string) {
    super(
      'DuplicateFieldDeclaration',
      moduleReference,
      range,
      `Field name \`${fieldName}\` is declared twice.`
    );
  }
}

export interface ReadonlyGlobalErrorCollector {
  getErrors(): readonly CompileTimeError[];

  getModuleErrorCollector(moduleReference: ModuleReference): ModuleErrorCollector;
}

interface WriteOnlyGlobalErrorCollector {
  reportError(error: CompileTimeError): void;
}

export class ModuleErrorCollector {
  private _hasErrors = false;

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly collectorDelegate: WriteOnlyGlobalErrorCollector
  ) {}

  get hasErrors(): boolean {
    return this._hasErrors;
  }

  reportSyntaxError(range: Range, reason: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new SyntaxError(this.moduleReference, range, reason));
  }

  reportUnexpectedTypeError(range: Range, expected: Type, actual: Type): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new UnexpectedTypeError(this.moduleReference, range, expected, actual)
    );
  }

  reportNotWellDefinedIdentifierError(range: Range, badIdentifier: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new NotWellDefinedIdentifierError(this.moduleReference, range, badIdentifier)
    );
  }

  reportUnresolvedNameError(range: Range, unresolvedName: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new UnresolvedNameError(this.moduleReference, range, unresolvedName)
    );
  }

  reportUnsupportedClassTypeDefinitionError(
    range: Range,
    typeDefinitionType: 'object' | 'variant'
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new UnsupportedClassTypeDefinitionError(this.moduleReference, range, typeDefinitionType)
    );
  }

  reportUnexpectedTypeKindError(range: Range, expected: string, actual: string | Type): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new UnexpectedTypeKindError(this.moduleReference, range, expected, actual)
    );
  }

  reportTupleSizeMismatchError(range: Range, expectedSize: number, actualSize: number): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new TupleSizeMismatchError(this.moduleReference, range, expectedSize, actualSize)
    );
  }

  reportInsufficientTypeInferenceContextError(range: Range): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new InsufficientTypeInferenceContextError(this.moduleReference, range)
    );
  }

  reportCollisionError(range: Range, collidedName: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new CollisionError(this.moduleReference, range, collidedName)
    );
  }

  reportIllegalOtherClassMatch(range: Range): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new IllegalOtherClassMatch(this.moduleReference, range));
  }

  reportIllegalThisError(range: Range): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new IllegalThisError(this.moduleReference, range));
  }

  reportInconsistentFieldsInObjectError(
    range: Range,
    expectedFields: Iterable<string>,
    actualFields: Iterable<string>
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new InconsistentFieldsInObjectError(this.moduleReference, range, expectedFields, actualFields)
    );
  }

  reportDuplicateFieldDeclarationError(range: Range, fieldName: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new DuplicateFieldDeclarationError(this.moduleReference, range, fieldName)
    );
  }
}

class GlobalErrorCollector implements ReadonlyGlobalErrorCollector, WriteOnlyGlobalErrorCollector {
  private readonly errors: CompileTimeError[] = [];

  getErrors(): readonly CompileTimeError[] {
    return this.errors;
  }

  getModuleErrorCollector(moduleReference: ModuleReference): ModuleErrorCollector {
    return new ModuleErrorCollector(moduleReference, this);
  }

  reportError(error: CompileTimeError): void {
    this.errors.push(error);
  }
}

export const createGlobalErrorCollector = (): ReadonlyGlobalErrorCollector =>
  new GlobalErrorCollector();
