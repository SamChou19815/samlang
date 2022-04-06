import type { Location } from './ast/common-nodes';
import { prettyPrintType, SamlangType } from './ast/samlang-nodes';

export abstract class CompileTimeError<T = string> {
  constructor(
    public readonly errorType: T,
    public readonly location: Location,
    public readonly reason: string
  ) {}

  toString(): string {
    return `${this.location.toString()}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError<'SyntaxError'> {
  constructor(location: Location, reason: string) {
    super('SyntaxError', location, reason);
  }
}

export class UnexpectedTypeError extends CompileTimeError<'UnexpectedType'> {
  constructor(location: Location, expected: SamlangType, actual: SamlangType) {
    super(
      'UnexpectedType',
      location,
      (() => {
        const expectedType = prettyPrintType(expected);
        const actualType = prettyPrintType(actual);
        return `Expected: \`${expectedType}\`, actual: \`${actualType}\`.`;
      })()
    );
  }
}

export class UnresolvedNameError extends CompileTimeError<'UnresolvedName'> {
  constructor(location: Location, unresolvedName: string) {
    super('UnresolvedName', location, `Name \`${unresolvedName}\` is not resolved.`);
  }
}

export class UnsupportedClassTypeDefinitionError extends CompileTimeError<'UnsupportedClassTypeDefinition'> {
  constructor(location: Location, typeDefinitionType: 'object' | 'variant') {
    super(
      'UnsupportedClassTypeDefinition',
      location,
      `Expect the current class to have \`${typeDefinitionType}\` type definition, but it doesn't.`
    );
  }
}

export class UnexpectedTypeKindError extends CompileTimeError<'UnexpectedTypeKind'> {
  constructor(location: Location, expectedTypeKind: string, actualType: string | SamlangType) {
    super(
      'UnexpectedTypeKind',
      location,
      `Expected kind: \`${expectedTypeKind}\`, actual: \`${
        typeof actualType === 'string' ? actualType : prettyPrintType(actualType)
      }\`.`
    );
  }
}

export class ArityMismatchError extends CompileTimeError<'ArityMismatchError'> {
  constructor(location: Location, kind: string, expectedSize: number, actualSize: number) {
    super(
      'ArityMismatchError',
      location,
      `Incorrect ${kind} size. Expected: ${expectedSize}, actual: ${actualSize}.`
    );
  }
}

export class InsufficientTypeInferenceContextError extends CompileTimeError<'InsufficientTypeInferenceContext'> {
  constructor(location: Location) {
    super(
      'InsufficientTypeInferenceContext',
      location,
      'There is not enough context information to decide the type of this expression.'
    );
  }
}

export class CollisionError extends CompileTimeError<'Collision'> {
  constructor(location: Location, collidedName: string) {
    super(
      'Collision',
      location,
      `Name \`${collidedName}\` collides with a previously defined name.`
    );
  }
}

export class IllegalOtherClassMatch extends CompileTimeError<'IllegalOtherClassMatch'> {
  constructor(location: Location) {
    super(
      'IllegalOtherClassMatch',
      location,
      "It is illegal to match on a value of other class's type."
    );
  }
}

export class IllegalThisError extends CompileTimeError<'IllegalThis'> {
  constructor(location: Location) {
    super('IllegalThis', location, 'Keyword `this` cannot be used in this context.');
  }
}

export class NonExhausiveMatchError extends CompileTimeError<'NonExhausiveMatch'> {
  constructor(location: Location, missingTags: readonly string[]) {
    super(
      'NonExhausiveMatch',
      location,
      `The following tags are not considered in the match: [${missingTags.join(', ')}].`
    );
  }
}

export interface ReadonlyGlobalErrorCollector {
  getErrors(): readonly CompileTimeError[];

  getModuleErrorCollector(): ModuleErrorCollector;
}

interface WriteOnlyGlobalErrorCollector {
  reportError(error: CompileTimeError): void;
}

export class ModuleErrorCollector {
  private _hasErrors = false;

  constructor(private readonly collectorDelegate: WriteOnlyGlobalErrorCollector) {}

  get hasErrors(): boolean {
    return this._hasErrors;
  }

  reportSyntaxError(location: Location, reason: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new SyntaxError(location, reason));
  }

  reportUnexpectedTypeError(location: Location, expected: SamlangType, actual: SamlangType): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new UnexpectedTypeError(location, expected, actual));
  }

  reportUnresolvedNameError(location: Location, unresolvedName: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new UnresolvedNameError(location, unresolvedName));
  }

  reportUnsupportedClassTypeDefinitionError(
    location: Location,
    typeDefinitionType: 'object' | 'variant'
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new UnsupportedClassTypeDefinitionError(location, typeDefinitionType)
    );
  }

  reportUnexpectedTypeKindError(
    location: Location,
    expected: string,
    actual: string | SamlangType
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new UnexpectedTypeKindError(location, expected, actual));
  }

  reportArityMismatchError(
    location: Location,
    kind: string,
    expectedSize: number,
    actualSize: number
  ): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(
      new ArityMismatchError(location, kind, expectedSize, actualSize)
    );
  }

  reportInsufficientTypeInferenceContextError(location: Location): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new InsufficientTypeInferenceContextError(location));
  }

  reportCollisionError(location: Location, collidedName: string): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new CollisionError(location, collidedName));
  }

  reportIllegalOtherClassMatch(location: Location): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new IllegalOtherClassMatch(location));
  }

  reportIllegalThisError(location: Location): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new IllegalThisError(location));
  }

  reportNonExhausiveMatchError(location: Location, missingTags: readonly string[]): void {
    this._hasErrors = true;
    this.collectorDelegate.reportError(new NonExhausiveMatchError(location, missingTags));
  }
}

class GlobalErrorCollector implements ReadonlyGlobalErrorCollector, WriteOnlyGlobalErrorCollector {
  private readonly errors: CompileTimeError[] = [];

  getErrors(): readonly CompileTimeError[] {
    return this.errors;
  }

  getModuleErrorCollector(): ModuleErrorCollector {
    return new ModuleErrorCollector(this);
  }

  reportError(error: CompileTimeError): void {
    this.errors.push(error);
  }
}

export function createGlobalErrorCollector(): ReadonlyGlobalErrorCollector {
  return new GlobalErrorCollector();
}
