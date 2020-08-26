import {
  IdentifierType,
  FunctionType,
  Type,
  identifierType,
  ModuleReference,
} from '../ast/common-nodes';
import type { FieldType, TypeDefinition } from '../ast/samlang-toplevel';
import { HashMap, ReadonlyHashMap } from '../util/collections';
import { assertNotNull } from '../util/type-assertions';
import replaceTypeIdentifier from './type-identifier-replacer';
import { undecideTypeParameters } from './type-undecider';
import type { IdentifierTypeValidator } from './type-validator';

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
    const closestStackType = this.stacks[this.stacks.length - 1].getLocalValueType(name);
    if (closestStackType != null) {
      return closestStackType;
    }
    for (let level = this.stacks.length - 2; level >= 0; level -= 1) {
      const stack = this.stacks[level];
      const type = stack.getLocalValueType(name);
      if (type != null) {
        for (
          let capturedLevel = level + 1;
          capturedLevel < this.stacks.length;
          capturedLevel += 1
        ) {
          this.stacks[capturedLevel].capturedValues.set(name, type);
        }
        return type;
      }
    }
    return undefined;
  }

  addLocalValueType(name: string, type: Type, onCollision: () => void): void {
    for (let level = 0; level < this.stacks.length - 1; level += 1) {
      const previousLevelType = this.stacks[level].getLocalValueType(name);
      if (previousLevelType != null) {
        onCollision();
      }
    }
    this.stacks[this.stacks.length - 1].addLocalValueType(name, type, onCollision);
  }

  removeLocalValue(name: string): void {
    this.stacks[this.stacks.length - 1].removeLocalValue(name);
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
  readonly functions: Readonly<Record<string, MemberTypeInformation | undefined>>;
  readonly methods: Readonly<Record<string, MemberTypeInformation | undefined>>;
}

export interface ModuleTypingContext {
  readonly importedClasses: Record<string, ClassTypingContext | undefined>;
  readonly definedClasses: Record<string, ClassTypingContext | undefined>;
}

export type GlobalTypingContext = HashMap<ModuleReference, ModuleTypingContext>;
export type ReadonlyGlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class AccessibleGlobalTypingContext implements IdentifierTypeValidator {
  constructor(
    private readonly classes: Record<string, ClassTypingContext | undefined>,
    public readonly typeParameters: ReadonlySet<string>,
    public readonly currentClass: string
  ) {}

  getClassFunctionType(className: string, member: string): readonly [Type, readonly Type[]] | null {
    const typeInfo = this.classes[className]?.functions?.[member];
    if (typeInfo == null) return null;
    if (!typeInfo.isPublic && className !== this.currentClass) return null;
    return undecideTypeParameters(typeInfo.type, typeInfo.typeParameters);
  }

  getClassMethodType(
    className: string,
    methodName: string,
    classTypeArguments: readonly Type[]
  ):
    | FunctionType
    | Readonly<{ type: 'UnresolvedName'; unresolvedName: string }>
    | Readonly<{ type: 'TypeParameterSizeMismatch'; expected: number; actual: number }> {
    const relaventClass = this.classes[className];
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
          (parameter, index) => [parameter, classTypeArguments[index]] as const
        )
      )
    );
    return fullyFixedType as FunctionType;
  }

  getCurrentClassTypeDefinition(): TypeDefinition & {
    readonly classTypeParameters: readonly string[];
  } {
    const classTypingContext = this.classes[this.currentClass];
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
    { identifier, typeArguments }: IdentifierType,
    typeDefinitionType: 'object' | 'variant'
  ):
    | {
        readonly type: 'Resolved';
        readonly names: readonly string[];
        readonly mappings: Readonly<Record<string, FieldType | undefined>>;
      }
    | { readonly type: 'IllegalOtherClassMatch' }
    | { readonly type: 'UnsupportedClassTypeDefinition' } {
    if (identifier !== this.currentClass && typeDefinitionType === 'variant') {
      return { type: 'IllegalOtherClassMatch' };
    }
    const relaventClass = this.classes[identifier];
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
                    (parameter, index) => [parameter, typeArguments[index]] as const
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
    const currentClassTypingContext = this.classes[this.currentClass];
    assertNotNull(currentClassTypingContext);
    return identifierType(
      this.currentClass,
      currentClassTypingContext.typeParameters.map((it) => identifierType(it))
    );
  }

  identifierTypeIsWellDefined(name: string, typeArgumentLength: number): boolean {
    if (this.typeParameters.has(name)) {
      return typeArgumentLength === 0;
    }
    const typeParameters = this.classes[name]?.typeParameters;
    return typeParameters != null && typeParameters.length === typeArgumentLength;
  }

  withAdditionalTypeParameters(typeParameters: Iterable<string>): AccessibleGlobalTypingContext {
    return new AccessibleGlobalTypingContext(
      this.classes,
      new Set([...this.typeParameters, ...typeParameters]),
      this.currentClass
    );
  }
}
