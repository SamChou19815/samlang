import { Location, ModuleReference, ModuleReferenceCollections } from './ast/common-nodes';
import { prettyPrintType, SamlangType } from './ast/samlang-nodes';

export abstract class CompileTimeError {
  constructor(
    public readonly errorType: string,
    public readonly location: Location,
    public readonly reason: string,
  ) {}

  toString(): string {
    return `${this.location.toString()}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError {
  constructor(location: Location, reason: string) {
    super('SyntaxError', location, reason);
  }
}

export class UnexpectedTypeError extends CompileTimeError {
  constructor(location: Location, expected: SamlangType, actual: SamlangType) {
    super(
      'UnexpectedType',
      location,
      (() => {
        const expectedType = prettyPrintType(expected);
        const actualType = prettyPrintType(actual);
        return `Expected: \`${expectedType}\`, actual: \`${actualType}\`.`;
      })(),
    );
  }
}

export class UnexpectedSubtypeError extends CompileTimeError {
  constructor(location: Location, expected: SamlangType, actual: SamlangType) {
    super(
      'UnexpectedSubType',
      location,
      (() => {
        const expectedType = prettyPrintType(expected);
        const actualType = prettyPrintType(actual);
        return `Expected: subtype of \`${expectedType}\`, actual: \`${actualType}\`.`;
      })(),
    );
  }
}

export class UnresolvedNameError extends CompileTimeError {
  constructor(location: Location, unresolvedName: string) {
    super('UnresolvedName', location, `Name \`${unresolvedName}\` is not resolved.`);
  }
}

export class TypeParameterNameMismatchError extends CompileTimeError {
  constructor(location: Location, expected: string, actual: string) {
    super(
      'TypeParameterNameMismatch',
      location,
      `Type parameter name mismatch. Expected \`${expected}\`, actual: ${actual}.`,
    );
  }
}

export class MissingDefinitionsError extends CompileTimeError {
  constructor(location: Location, missingDefinitions: readonly string[]) {
    super(
      'MissingDefinitions',
      location,
      `Missing definitions for [${missingDefinitions.join(', ')}].`,
    );
  }
}

export class UnsupportedClassTypeDefinitionError extends CompileTimeError {
  constructor(location: Location, typeDefinitionType: 'object' | 'variant') {
    super(
      'UnsupportedClassTypeDefinition',
      location,
      `Expect the current class to have \`${typeDefinitionType}\` type definition, but it doesn't.`,
    );
  }
}

export class UnexpectedTypeKindError extends CompileTimeError {
  constructor(location: Location, expectedTypeKind: string, actualType: string | SamlangType) {
    super(
      'UnexpectedTypeKind',
      location,
      `Expected kind: \`${expectedTypeKind}\`, actual: \`${
        typeof actualType === 'string' ? actualType : prettyPrintType(actualType)
      }\`.`,
    );
  }
}

export class ArityMismatchError extends CompileTimeError {
  constructor(location: Location, kind: string, expectedSize: number, actualSize: number) {
    super(
      'ArityMismatchError',
      location,
      `Incorrect ${kind} size. Expected: ${expectedSize}, actual: ${actualSize}.`,
    );
  }
}

export class InsufficientTypeInferenceContextError extends CompileTimeError {
  constructor(location: Location) {
    super(
      'InsufficientTypeInferenceContext',
      location,
      'There is not enough context information to decide the type of this expression.',
    );
  }
}

export class CollisionError extends CompileTimeError {
  constructor(location: Location, collidedName: string) {
    super(
      'Collision',
      location,
      `Name \`${collidedName}\` collides with a previously defined name.`,
    );
  }
}

export class IllegalOtherClassMatch extends CompileTimeError {
  constructor(location: Location) {
    super(
      'IllegalOtherClassMatch',
      location,
      "It is illegal to match on a value of other class's type.",
    );
  }
}

export class IllegalThisError extends CompileTimeError {
  constructor(location: Location) {
    super('IllegalThis', location, 'Keyword `this` cannot be used in this context.');
  }
}

export class NonExhausiveMatchError extends CompileTimeError {
  constructor(location: Location, missingTags: readonly string[]) {
    super(
      'NonExhausiveMatch',
      location,
      `The following tags are not considered in the match: [${missingTags.join(', ')}].`,
    );
  }
}

export class CyclicTypeDefinitionError extends CompileTimeError {
  constructor(type: SamlangType) {
    super(
      'CyclicTypeDefinition',
      type.reason.useLocation,
      `Type \`${prettyPrintType(type)}\` has a cyclic definition.`,
    );
  }
}

export interface ReadonlyGlobalErrorCollector {
  get hasErrors(): boolean;

  moduleHasError(moduleReference: ModuleReference): boolean;

  getErrors(): readonly CompileTimeError[];

  getErrorReporter(): GlobalErrorReporter;
}

interface WriteOnlyGlobalErrorCollector {
  reportError(error: CompileTimeError): void;
}

export class GlobalErrorReporter {
  constructor(private readonly collectorDelegate: WriteOnlyGlobalErrorCollector) {}

  reportSyntaxError(location: Location, reason: string): void {
    this.collectorDelegate.reportError(new SyntaxError(location, reason));
  }

  reportUnexpectedTypeError(location: Location, expected: SamlangType, actual: SamlangType): void {
    this.collectorDelegate.reportError(new UnexpectedTypeError(location, expected, actual));
  }

  reportUnexpectedSubtypeError(
    location: Location,
    expected: SamlangType,
    actual: SamlangType,
  ): void {
    this.collectorDelegate.reportError(new UnexpectedSubtypeError(location, expected, actual));
  }

  reportUnresolvedNameError(location: Location, unresolvedName: string): void {
    this.collectorDelegate.reportError(new UnresolvedNameError(location, unresolvedName));
  }

  reportTypeParameterNameMismatchError(location: Location, expected: string, actual: string): void {
    this.collectorDelegate.reportError(
      new TypeParameterNameMismatchError(location, expected, actual),
    );
  }

  reportMissingDefinitionsError(location: Location, missingMembers: readonly string[]): void {
    this.collectorDelegate.reportError(new MissingDefinitionsError(location, missingMembers));
  }

  reportUnsupportedClassTypeDefinitionError(
    location: Location,
    typeDefinitionType: 'object' | 'variant',
  ): void {
    this.collectorDelegate.reportError(
      new UnsupportedClassTypeDefinitionError(location, typeDefinitionType),
    );
  }

  reportUnexpectedTypeKindError(
    location: Location,
    expected: string,
    actual: string | SamlangType,
  ): void {
    this.collectorDelegate.reportError(new UnexpectedTypeKindError(location, expected, actual));
  }

  reportArityMismatchError(
    location: Location,
    kind: string,
    expectedSize: number,
    actualSize: number,
  ): void {
    this.collectorDelegate.reportError(
      new ArityMismatchError(location, kind, expectedSize, actualSize),
    );
  }

  reportInsufficientTypeInferenceContextError(location: Location): void {
    this.collectorDelegate.reportError(new InsufficientTypeInferenceContextError(location));
  }

  reportCollisionError(location: Location, collidedName: string): void {
    this.collectorDelegate.reportError(new CollisionError(location, collidedName));
  }

  reportIllegalOtherClassMatch(location: Location): void {
    this.collectorDelegate.reportError(new IllegalOtherClassMatch(location));
  }

  reportIllegalThisError(location: Location): void {
    this.collectorDelegate.reportError(new IllegalThisError(location));
  }

  reportNonExhausiveMatchError(location: Location, missingTags: readonly string[]): void {
    this.collectorDelegate.reportError(new NonExhausiveMatchError(location, missingTags));
  }

  reportCyclicTypeDefinitionError(type: SamlangType): void {
    this.collectorDelegate.reportError(new CyclicTypeDefinitionError(type));
  }
}

class GlobalErrorCollector implements ReadonlyGlobalErrorCollector, WriteOnlyGlobalErrorCollector {
  private readonly errors: CompileTimeError[] = [];
  private readonly modulesWithError = ModuleReferenceCollections.hashSetOf();

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  moduleHasError(moduleReference: ModuleReference): boolean {
    return this.modulesWithError.has(moduleReference);
  }

  getErrors(): readonly CompileTimeError[] {
    return this.errors;
  }

  getErrorReporter(): GlobalErrorReporter {
    return new GlobalErrorReporter(this);
  }

  reportError(error: CompileTimeError): void {
    this.errors.push(error);
    this.modulesWithError.add(error.location.moduleReference);
  }
}

export function createGlobalErrorCollector(): ReadonlyGlobalErrorCollector {
  return new GlobalErrorCollector();
}
