import {
  DummySourceReason,
  Location,
  LocationCollections,
  ModuleReference,
  moduleReferenceToString,
  SourceReason,
} from '../ast/common-nodes';
import {
  prettyPrintType,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangType,
  SourceFieldType,
  SourceIdentifierType,
  SourceInterfaceDeclaration,
  SourceUnknownType,
  TypeDefinition,
  TypeParameterSignature,
  typeReposition,
} from '../ast/samlang-nodes';
import { assert, checkNotNull, ReadonlyHashMap, zip } from '../utils';
import type { SsaAnalysisResult } from './ssa-analysis';
import performTypeSubstitution from './type-substitution';

export interface MemberTypeInformation {
  readonly isPublic: boolean;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly type: SamlangFunctionType;
}

export function memberTypeInformationToString(
  name: string,
  { isPublic, typeParameters, type }: MemberTypeInformation,
): string {
  const accessString = isPublic ? 'public' : 'private';
  const tparams = typeParameters.map((it) =>
    it.bound != null ? `${it.name}: ${prettyPrintType(it.bound)}` : it.name,
  );
  const tparamString = tparams.length > 0 ? `<${tparams.join(', ')}>` : '';
  return `${accessString} ${name}${tparamString}${prettyPrintType(type)}`;
}

export interface InterfaceTypingContextInstantiatedMembers {
  readonly functions: ReadonlyMap<string, MemberTypeInformation>;
  readonly methods: ReadonlyMap<string, MemberTypeInformation>;
}

export interface InterfaceTypingContext extends InterfaceTypingContextInstantiatedMembers {
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly extendsOrImplements: SamlangIdentifierType | null;
  readonly superTypes: readonly SamlangIdentifierType[];
}

export interface ClassTypingContext extends InterfaceTypingContext {
  readonly typeDefinition: TypeDefinition;
}

export interface ModuleTypingContext {
  readonly interfaces: ReadonlyMap<string, InterfaceTypingContext>;
  readonly classes: ReadonlyMap<string, ClassTypingContext>;
}

export type GlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class AccessibleGlobalTypingContext {
  constructor(
    public readonly currentModuleReference: ModuleReference,
    private readonly globalTypingContext: GlobalTypingContext,
    public readonly typeParameters: ReadonlySet<string>,
    public readonly currentClass: string,
  ) {}

  static fromInterface(
    currentModuleReference: ModuleReference,
    globalTypingContext: GlobalTypingContext,
    interfaceDeclaration: SourceInterfaceDeclaration,
  ): AccessibleGlobalTypingContext {
    return new AccessibleGlobalTypingContext(
      currentModuleReference,
      globalTypingContext,
      new Set(interfaceDeclaration.typeParameters.map(({ name: { name } }) => name)),
      interfaceDeclaration.name.name,
    );
  }

  getInterfaceInformation(
    moduleReference: ModuleReference,
    className: string,
  ): InterfaceTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.interfaces?.get(className);
  }

  getClassTypeInformation(
    moduleReference: ModuleReference,
    className: string,
  ): ClassTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.classes?.get(className);
  }

  getClassFunctionType(
    moduleReference: ModuleReference,
    className: string,
    member: string,
    useLocation: Location,
  ): MemberTypeInformation | null {
    const typeInfo = this.getClassTypeInformation(moduleReference, className)?.functions?.get(
      member,
    );
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
    useLocation: Location,
  ): MemberTypeInformation | null {
    const relaventClass = this.getClassTypeInformation(moduleReference, className);
    if (relaventClass == null) return null;
    const typeInfo = relaventClass.methods?.get(methodName);
    if (typeInfo == null || (!typeInfo.isPublic && className !== this.currentClass)) return null;
    const classTypeParameters = relaventClass.typeParameters;
    const partiallyFixedType = performTypeSubstitution(
      typeInfo.type,
      new Map(
        zip(
          classTypeParameters.map((it) => it.name),
          classTypeArguments,
        ),
      ),
    );
    assert(partiallyFixedType.__type__ === 'FunctionType');
    return {
      isPublic: typeInfo.isPublic,
      type: typeReposition(partiallyFixedType, useLocation),
      typeParameters: typeInfo.typeParameters,
    };
  }

  getCurrentClassTypeDefinition(): TypeDefinition & {
    readonly classTypeParameters: readonly {
      readonly name: string;
      readonly bound: SamlangType | null;
    }[];
  } {
    const classTypingContext = checkNotNull(
      this.getClassTypeInformation(this.currentModuleReference, this.currentClass),
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
    typeDefinitionType: 'object' | 'variant',
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
                new Map(
                  zip(
                    classTypeParameters.map((it) => it.name),
                    typeArguments,
                  ),
                ),
              ),
            },
          ];
        }),
      ),
    };
  }

  get thisType(): SamlangIdentifierType {
    const currentClassTypingContext = checkNotNull(
      this.getClassTypeInformation(this.currentModuleReference, this.currentClass),
    );
    return SourceIdentifierType(
      DummySourceReason,
      this.currentModuleReference,
      this.currentClass,
      currentClassTypingContext.typeParameters.map((it) =>
        SourceIdentifierType(DummySourceReason, this.currentModuleReference, it.name),
      ),
    );
  }

  withAdditionalTypeParameters(typeParameters: Iterable<string>): AccessibleGlobalTypingContext {
    return new AccessibleGlobalTypingContext(
      this.currentModuleReference,
      this.globalTypingContext,
      new Set([...this.typeParameters, ...typeParameters]),
      this.currentClass,
    );
  }
}

export class LocationBasedLocalTypingContext {
  private typeMap = LocationCollections.hashMapOf<SamlangType>();

  constructor(
    private readonly ssaAnalysisResult: SsaAnalysisResult,
    private readonly thisType: SamlangType | null,
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
    const capturedEntries = this.ssaAnalysisResult.lambdaCaptures.forceGet(lambdaLocation);
    for (const [name, location] of capturedEntries) {
      const firstLetter = name.charAt(0);
      if ('A' <= firstLetter && firstLetter <= 'Z') continue;
      map.set(name, this.typeMap.forceGet(location));
    }
    return map;
  }
}
