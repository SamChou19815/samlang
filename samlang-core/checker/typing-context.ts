import {
  DummySourceReason,
  Location,
  LocationCollections,
  ModuleReference,
  moduleReferenceToString,
  SourceReason,
} from '../ast/common-nodes';
import {
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangType,
  SourceFieldType,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
  SourceUnknownType,
  TypeDefinition,
  typeReposition,
} from '../ast/samlang-nodes';
import { assert, checkNotNull, HashMap, ReadonlyHashMap, zip } from '../utils';
import type { SsaAnalysisResult } from './ssa-analysis';
import performTypeSubstitution from './type-substitution';

export interface MemberTypeInformation {
  readonly isPublic: boolean;
  readonly typeParameters: readonly string[];
  readonly type: SamlangFunctionType;
}

export interface InterfaceTypingContext {
  readonly typeParameters: readonly string[];
  readonly functions: Readonly<Record<string, MemberTypeInformation>>;
  readonly methods: Readonly<Record<string, MemberTypeInformation>>;
}

export interface ClassTypingContext extends InterfaceTypingContext {
  readonly typeDefinition: TypeDefinition;
}

export interface ModuleTypingContext {
  readonly interfaces: Readonly<Record<string, InterfaceTypingContext>>;
  readonly classes: Readonly<Record<string, ClassTypingContext>>;
}

export type GlobalTypingContext = HashMap<ModuleReference, ModuleTypingContext>;
export type ReadonlyGlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class AccessibleGlobalTypingContext {
  constructor(
    public readonly currentModuleReference: ModuleReference,
    private readonly globalTypingContext: ReadonlyGlobalTypingContext,
    public readonly typeParameters: ReadonlySet<string>,
    public readonly currentClass: string
  ) {}

  static fromInterface(
    currentModuleReference: ModuleReference,
    globalTypingContext: ReadonlyGlobalTypingContext,
    interfaceDeclaration: SourceInterfaceDeclaration
  ): AccessibleGlobalTypingContext {
    return new AccessibleGlobalTypingContext(
      currentModuleReference,
      globalTypingContext,
      new Set(interfaceDeclaration.typeParameters.map((it) => it.name)),
      interfaceDeclaration.name.name
    );
  }

  getInterfaceInformation(
    moduleReference: ModuleReference,
    className: string
  ): InterfaceTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.interfaces[className];
  }

  getClassTypeInformation(
    moduleReference: ModuleReference,
    className: string
  ): ClassTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.classes[className];
  }

  getClassFunctionType(
    moduleReference: ModuleReference,
    className: string,
    member: string,
    useLocation: Location
  ): MemberTypeInformation | null {
    const typeInfo = this.getClassTypeInformation(moduleReference, className)?.functions?.[member];
    if (typeInfo == null) return null;
    if (
      !typeInfo.isPublic &&
      (moduleReferenceToString(moduleReference) !==
        moduleReferenceToString(this.currentModuleReference) ||
        className !== this.currentClass)
    ) {
      return null;
    }
    return { ...typeInfo, type: typeReposition(typeInfo.type, useLocation) };
  }

  getClassMethodType(
    moduleReference: ModuleReference,
    className: string,
    methodName: string,
    classTypeArguments: readonly SamlangType[],
    useLocation: Location
  ): MemberTypeInformation | null {
    const relaventClass = this.getClassTypeInformation(moduleReference, className);
    if (relaventClass == null) return null;
    const typeInfo = relaventClass.methods?.[methodName];
    if (typeInfo == null || (!typeInfo.isPublic && className !== this.currentClass)) return null;
    const classTypeParameters = relaventClass.typeParameters;
    const partiallyFixedType = performTypeSubstitution(
      typeInfo.type,
      Object.fromEntries(zip(classTypeParameters, classTypeArguments))
    );
    assert(partiallyFixedType.__type__ === 'FunctionType');
    return {
      isPublic: typeInfo.isPublic,
      type: typeReposition(partiallyFixedType, useLocation),
      typeParameters: typeInfo.typeParameters,
    };
  }

  getCurrentClassTypeDefinition(): TypeDefinition & {
    readonly classTypeParameters: readonly string[];
  } {
    const classTypingContext = checkNotNull(
      this.getClassTypeInformation(this.currentModuleReference, this.currentClass)
    );
    return {
      ...classTypingContext.typeDefinition,
      classTypeParameters: classTypingContext.typeParameters,
    };
  }

  /**
   * Resolve the type definition for an identifier within the current enclosing class.
   * This method will refuse to resolve variant identifier types outside of its enclosing class
   * according to type checking rules.
   */
  resolveTypeDefinition(
    { moduleReference, identifier, typeArguments }: SamlangIdentifierType,
    typeDefinitionType: 'object' | 'variant'
  ):
    | {
        readonly type: 'Resolved';
        readonly names: readonly string[];
        readonly mappings: Readonly<Record<string, SourceFieldType>>;
      }
    | { readonly type: 'IllegalOtherClassMatch' }
    | { readonly type: 'UnsupportedClassTypeDefinition' } {
    if (
      (moduleReferenceToString(moduleReference) !==
        moduleReferenceToString(this.currentModuleReference) ||
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
      names: names.map((it) => it.name),
      mappings: Object.fromEntries(
        Object.entries(nameMappings).map(([name, fieldType]) => {
          return [
            name,
            {
              isPublic: fieldType.isPublic,
              type: performTypeSubstitution(
                fieldType.type,
                Object.fromEntries(zip(classTypeParameters, typeArguments))
              ),
            },
          ];
        })
      ),
    };
  }

  get thisType(): SamlangIdentifierType {
    const currentClassTypingContext = checkNotNull(
      this.getClassTypeInformation(this.currentModuleReference, this.currentClass)
    );
    return SourceIdentifierType(
      DummySourceReason,
      this.currentModuleReference,
      this.currentClass,
      currentClassTypingContext.typeParameters.map((it) =>
        SourceIdentifierType(DummySourceReason, this.currentModuleReference, it)
      )
    );
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

export class LocationBasedLocalTypingContext {
  private typeMap = LocationCollections.hashMapOf<SamlangType>();

  constructor(
    private readonly ssaAnalysisResult: SsaAnalysisResult,
    private readonly thisType: SamlangType | null
  ) {}

  getThisType(): SamlangType | null {
    return this.thisType;
  }

  read(location: Location): SamlangType {
    const definitionLocation = this.ssaAnalysisResult.useDefineMap.get(location);
    // When the name is unbound, we treat itself as definition.
    if (definitionLocation == null) return SourceUnknownType(SourceReason(location, null));
    return typeReposition(this.typeMap.forceGet(definitionLocation), location);
  }

  write(location: Location, type: SamlangType): void {
    this.typeMap.set(location, type);
  }

  getCaptured(lambdaLocation: Location): ReadonlyMap<string, SamlangType> {
    const map = new Map<string, SamlangType>();
    const capturedEntries = this.ssaAnalysisResult.lambdaCaptures
      .forceGet(lambdaLocation)
      .entries();
    for (const [name, location] of capturedEntries) {
      const firstLetter = name.charAt(0);
      if ('A' <= firstLetter && firstLetter <= 'Z') continue;
      map.set(name, this.typeMap.forceGet(location));
    }
    return map;
  }
}
