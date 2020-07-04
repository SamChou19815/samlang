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
} from './error-definitions';

interface ReadonlyGlobalErrorCollector {
  getErrors(): readonly CompileTimeError[];

  getModuleErrorCollector(moduleReference: ModuleReference): ModuleErrorCollector;
}

interface WriteOnlyGlobalErrorCollector {
  reportError(error: CompileTimeError): void;
}

export class ModuleErrorCollector {
  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly collectorDelegate: WriteOnlyGlobalErrorCollector
  ) {}

  reportSyntaxError(range: Range, reason: string): void {
    this.collectorDelegate.reportError(new SyntaxError(this.moduleReference, range, reason));
  }

  reportUnexpectedTypeError(range: Range, expected: Type, actual: Type): void {
    this.collectorDelegate.reportError(
      new UnexpectedTypeError(this.moduleReference, range, expected, actual)
    );
  }

  reportNotWellDefinedIdentifierError(range: Range, badIdentifier: string): void {
    this.collectorDelegate.reportError(
      new NotWellDefinedIdentifierError(this.moduleReference, range, badIdentifier)
    );
  }

  reportUnresolvedNameError(range: Range, unresolvedName: string): void {
    this.collectorDelegate.reportError(
      new UnresolvedNameError(this.moduleReference, range, unresolvedName)
    );
  }

  reportUnsupportedClassTypeDefinitionError(
    range: Range,
    typeDefinitionType: 'object' | 'variant'
  ): void {
    this.collectorDelegate.reportError(
      new UnsupportedClassTypeDefinitionError(this.moduleReference, range, typeDefinitionType)
    );
  }

  reportUnexpectedTypeKindError(range: Range, expected: string, actual: string | Type): void {
    this.collectorDelegate.reportError(
      new UnexpectedTypeKindError(this.moduleReference, range, expected, actual)
    );
  }

  reportTypeParameterSizeMismatchError(
    range: Range,
    expectedSize: number,
    actualSize: number
  ): void {
    this.collectorDelegate.reportError(
      new TypeParameterSizeMismatchError(this.moduleReference, range, expectedSize, actualSize)
    );
  }

  reportTupleSizeMismatchError(range: Range, expectedSize: number, actualSize: number): void {
    this.collectorDelegate.reportError(
      new TupleSizeMismatchError(this.moduleReference, range, expectedSize, actualSize)
    );
  }

  reportInsufficientTypeInferenceContextError(range: Range): void {
    this.collectorDelegate.reportError(
      new InsufficientTypeInferenceContextError(this.moduleReference, range)
    );
  }

  reportCollisionError(range: Range, collidedName: string): void {
    this.collectorDelegate.reportError(
      new CollisionError(this.moduleReference, range, collidedName)
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
