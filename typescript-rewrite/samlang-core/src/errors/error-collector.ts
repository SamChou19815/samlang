import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import type { Type } from '../ast/common/types';
import {
  CompileTimeError,
  SyntaxError,
  UnexpectedTypeError,
  NotWellDefinedIdentifierError,
  UnresolvedNameError,
  UnsupportedClassTypeDefinitionError,
  UnexpectedTypeKindError,
  TypeParameterSizeMismatchError,
  TupleSizeMismatchError,
  InsufficientTypeInferenceContextError,
  CollisionError,
  IllegalOtherClassMatch,
  IllegalThisError,
  InconsistentFieldsInObjectError,
  DuplicateFieldDeclarationError,
} from './error-definitions';

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

  reportTypeParameterSizeMismatchError(
    range: Range,
    expectedSize: number,
    actualSize: number
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new TypeParameterSizeMismatchError(this.moduleReference, range, expectedSize, actualSize)
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
