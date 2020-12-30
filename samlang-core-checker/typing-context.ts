import replaceTypeIdentifier from './type-identifier-replacer';
import { undecideTypeParameters } from './type-undecider';
import type { IdentifierTypeValidator } from './type-validator';

import {
  IdentifierType,
  FunctionType,
  Type,
  identifierType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import type { FieldType, TypeDefinition } from 'samlang-core-ast/samlang-toplevel';
import { assertNotNull, checkNotNull, HashMap, ReadonlyHashMap } from 'samlang-core-utils';

/** One layer of the typing context. We should stack a new layer when encounter a new nested scope. */
class ContextLayer {
  private readonly localValues: Map<string, Type> = new Map();

  readonly capturedValues: Map<string, Type> = new Map();

  getLocalValueType(name: string): Type | undefined {
    return this.localValues.get(name);
  }

  addLocalValueType(name: string, type: Type, onCollision: () => void) {
    if (this.localValues.has(name)) {
      onCollision();
      return;
    }
    this.localValues.set(name, type);
  }

  removeLocalValue(name: string): void {
    if (!this.localValues.delete(name)) {
      throw new Error(`${name} is not found in this layer!`);
    }
  }
}

export class LocalTypingContext {
  private readonly stacks: ContextLayer[] = [new ContextLayer()];

  getLocalValueType(name: string): Type | undefined {
    const closestStackType = checkNotNull(this.stacks[this.stacks.length - 1]).getLocalValueType(
      name
    );
    if (closestStackType != null) {
      return closestStackType;
    }
    for (let level = this.stacks.length - 2; level >= 0; level -= 1) {
      const stack = this.stacks[level];
      assertNotNull(stack);
      const type = stack.getLocalValueType(name);
      if (type != null) {
        for (
          let capturedLevel = level + 1;
          capturedLevel < this.stacks.length;
          capturedLevel += 1
        ) {
          checkNotNull(this.stacks[capturedLevel]).capturedValues.set(name, type);
        }
        return type;
      }
    }
    return undefined;
  }

  addLocalValueType(name: string, type: Type, onCollision: () => void): void {
    for (let level = 0; level < this.stacks.length - 1; level += 1) {
      const previousLevelType = checkNotNull(this.stacks[level]).getLocalValueType(name);
      if (previousLevelType != null) {
        onCollision();
      }
    }
    checkNotNull(this.stacks[this.stacks.length - 1]).addLocalValueType(name, type, onCollision);
  }

  removeLocalValue(name: string): void {
    checkNotNull(this.stacks[this.stacks.length - 1]).removeLocalValue(name);
  }

  withNestedScope<T>(block: () => T): T {
    this.stacks.push(new ContextLayer());
    const result = block();
    this.stacks.pop();
    return result;
  }

  withNestedScopeReturnCaptured<T>(block: () => T): readonly [T, ReadonlyMap<string, Type>] {
    this.stacks.push(new ContextLayer());
    const result = block();
    const removedStack = this.stacks.pop();
    assertNotNull(removedStack);
    return [result, removedStack.capturedValues];
  }
}

export interface MemberTypeInformation {
  readonly isPublic: boolean;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
}

export interface ClassTypingContext {
  readonly typeParameters: readonly string[];
  readonly typeDefinition?: TypeDefinition;
  readonly functions: Readonly<Record<string, MemberTypeInformation>>;
  readonly methods: Readonly<Record<string, MemberTypeInformation>>;
}

export type ModuleTypingContext = Readonly<Record<string, ClassTypingContext>>;
export type GlobalTypingContext = HashMap<ModuleReference, ModuleTypingContext>;
export type ReadonlyGlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class AccessibleGlobalTypingContext implements IdentifierTypeValidator {
  constructor(
    public readonly currentModuleReference: ModuleReference,
    private readonly globalTypingContext: ReadonlyGlobalTypingContext,
    public readonly typeParameters: ReadonlySet<string>,
    public readonly currentClass: string
  ) {}

  private getClassTypeInformation(
    moduleReference: ModuleReference,
    className: string
  ): ClassTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.[className];
  }

  getClassFunctionType(
    moduleReference: ModuleReference,
    className: string,
    member: string
  ): readonly [Type, readonly Type[]] | null {
    const typeInfo = this.getClassTypeInformation(moduleReference, className)?.functions?.[member];
    if (typeInfo == null) return null;
    if (
      !typeInfo.isPublic &&
      (moduleReference.toString() !== this.currentModuleReference.toString() ||
        className !== this.currentClass)
    ) {
      return null;
    }
    return undecideTypeParameters(typeInfo.type, typeInfo.typeParameters);
  }

  getClassMethodType(
    moduleReference: ModuleReference,
    className: string,
    methodName: string,
    classTypeArguments: readonly Type[]
  ):
    | FunctionType
    | Readonly<{ type: 'UnresolvedName'; unresolvedName: string }>
    | Readonly<{ type: 'TypeParameterSizeMismatch'; expected: number; actual: number }> {
    const relaventClass = this.getClassTypeInformation(moduleReference, className);
    if (relaventClass == null) {
      return { type: 'UnresolvedName', unresolvedName: className };
    }
    const typeInfo = relaventClass.methods?.[methodName];
    if (typeInfo == null || (!typeInfo.isPublic && className !== this.currentClass)) {
      return { type: 'UnresolvedName', unresolvedName: methodName };
    }
    const partiallyFixedType = undecideTypeParameters(typeInfo.type, typeInfo.typeParameters)[0];
    const classTypeParameters = relaventClass.typeParameters;
    if (classTypeArguments.length !== classTypeParameters.length) {
      return {
        type: 'TypeParameterSizeMismatch',
        expected: classTypeParameters.length,
        actual: classTypeArguments.length,
      };
    }
    const fullyFixedType = replaceTypeIdentifier(
      partiallyFixedType,
      Object.fromEntries(
        classTypeParameters.map(
          (parameter, index) => [parameter, checkNotNull(classTypeArguments[index])] as const
        )
      )
    );
    return fullyFixedType as FunctionType;
  }

  getCurrentClassTypeDefinition(): TypeDefinition & {
    readonly classTypeParameters: readonly string[];
  } {
    const classTypingContext = this.getClassTypeInformation(
      this.currentModuleReference,
      this.currentClass
    );
    assertNotNull(classTypingContext);
    const definition = classTypingContext.typeDefinition;
    assertNotNull(definition);
    return { ...definition, classTypeParameters: classTypingContext.typeParameters };
  }

  /**
   * Resolve the type definition for an identifier within the current enclosing class.
   * This method will refuse to resolve variant identifier types outside of its enclosing class
   * according to type checking rules.
   */
  resolveTypeDefinition(
    { moduleReference, identifier, typeArguments }: IdentifierType,
    typeDefinitionType: 'object' | 'variant'
  ):
    | {
        readonly type: 'Resolved';
        readonly names: readonly string[];
        readonly mappings: Readonly<Record<string, FieldType>>;
      }
    | { readonly type: 'IllegalOtherClassMatch' }
    | { readonly type: 'UnsupportedClassTypeDefinition' } {
    if (
      (moduleReference.toString() !== this.currentModuleReference.toString() ||
        identifier !== this.currentClass) &&
      typeDefinitionType === 'variant'
    ) {
      return { type: 'IllegalOtherClassMatch' };
    }
    const relaventClass = this.getClassTypeInformation(moduleReference, identifier);
    if (
      relaventClass == null ||
      relaventClass.typeDefinition == null ||
      relaventClass.typeDefinition.type !== typeDefinitionType
    ) {
      return { type: 'UnsupportedClassTypeDefinition' };
    }
    const {
      typeParameters,
      typeDefinition: { names, mappings: nameMappings },
    } = relaventClass;
    let classTypeParameters = typeParameters;
    if (typeParameters.length > typeArguments.length) {
      classTypeParameters = classTypeParameters.slice(0, typeArguments.length);
    }
    return {
      type: 'Resolved',
      names,
      mappings: Object.fromEntries(
        Object.entries(nameMappings).map(([name, fieldType]) => {
          assertNotNull(fieldType);
          return [
            name,
            {
              isPublic: fieldType.isPublic,
              type: replaceTypeIdentifier(
                fieldType.type,
                Object.fromEntries(
                  classTypeParameters.map(
                    (parameter, index) => [parameter, checkNotNull(typeArguments[index])] as const
                  )
                )
              ),
            },
          ];
        })
      ),
    };
  }

  get thisType(): IdentifierType {
    const currentClassTypingContext = this.getClassTypeInformation(
      this.currentModuleReference,
      this.currentClass
    );
    assertNotNull(currentClassTypingContext);
    return identifierType(
      this.currentModuleReference,
      this.currentClass,
      currentClassTypingContext.typeParameters.map((it) =>
        identifierType(this.currentModuleReference, it)
      )
    );
  }

  identifierTypeIsWellDefined(
    moduleReference: ModuleReference,
    className: string,
    typeArgumentLength: number
  ): boolean {
    if (this.typeParameters.has(className)) {
      return typeArgumentLength === 0;
    }
    const typeParameters = this.getClassTypeInformation(moduleReference, className)?.typeParameters;
    return typeParameters != null && typeParameters.length === typeArgumentLength;
  }

  withAdditionalTypeParameters(typeParameters: Iterable<string>): AccessibleGlobalTypingContext {
    return new AccessibleGlobalTypingContext(
      this.currentModuleReference,
      this.globalTypingContext,
      new Set([...this.typeParameters, ...typeParameters]),
      this.currentClass
    );
  }
}
