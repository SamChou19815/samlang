import {
  BuiltinReason,
  Location,
  LocationCollections,
  ModuleReference,
  moduleReferenceToString,
  SourceReason,
} from '../ast/common-nodes';
import {
  CustomizedReasonAstBuilder,
  isTheSameType,
  prettyPrintType,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangType,
  SourceFieldType,
  SourceUnknownType,
  TypeDefinition,
  TypeParameterSignature,
  typeReposition,
} from '../ast/samlang-nodes';
import type { DefaultBuiltinClasses } from '../parser';
import { assert, ReadonlyHashMap, zip } from '../utils';
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

export interface InterfaceTypingContext {
  readonly functions: ReadonlyMap<string, MemberTypeInformation>;
  readonly methods: ReadonlyMap<string, MemberTypeInformation>;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly superTypes: readonly SamlangIdentifierType[];
}

export interface ClassTypingContext extends InterfaceTypingContext {
  readonly typeDefinition: TypeDefinition;
}

export interface ModuleTypingContext {
  readonly interfaces: ReadonlyMap<string, InterfaceTypingContext>;
  readonly classes: ReadonlyMap<string, ClassTypingContext>;
}

const AST = new CustomizedReasonAstBuilder(BuiltinReason, ModuleReference.ROOT);

function createCustomBuiltinFunction(
  name: string,
  isPublic: boolean,
  typeParameters: readonly string[],
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
): readonly [string, MemberTypeInformation] {
  return [
    name,
    {
      isPublic,
      typeParameters: typeParameters.map((it) => ({ name: it, bound: null })),
      type: AST.FunType(argumentTypes, returnType),
    },
  ];
}

export function createBuiltinFunction(
  name: string,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
  typeParameters: readonly string[] = [],
): readonly [string, MemberTypeInformation] {
  return createCustomBuiltinFunction(name, true, typeParameters, argumentTypes, returnType);
}

export function createPrivateBuiltinFunction(
  name: string,
  argumentTypes: readonly SamlangType[],
  returnType: SamlangType,
  typeParameters: readonly string[] = [],
): readonly [string, MemberTypeInformation] {
  return createCustomBuiltinFunction(name, false, typeParameters, argumentTypes, returnType);
}

export const DEFAULT_BUILTIN_TYPING_CONTEXT: {
  readonly interfaces: ReadonlyMap<string, ClassTypingContext>;
  readonly classes: ReadonlyMap<DefaultBuiltinClasses, ClassTypingContext>;
} = {
  interfaces: new Map(),
  classes: new Map([
    [
      'Builtins',
      {
        typeParameters: [],
        typeDefinition: { location: Location.DUMMY, type: 'object', names: [], mappings: {} },
        extendsOrImplements: null,
        superTypes: [],
        functions: new Map([
          createBuiltinFunction('stringToInt', [AST.StringType], AST.IntType),
          createBuiltinFunction('intToString', [AST.IntType], AST.StringType),
          createBuiltinFunction('println', [AST.StringType], AST.UnitType),
          createBuiltinFunction('panic', [AST.StringType], AST.IdType('T'), ['T']),
        ]),
        methods: new Map(),
      },
    ],
  ]),
};

export type GlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class AccessibleGlobalTypingContext {
  constructor(
    private readonly globalTypingContext: GlobalTypingContext,
    public readonly currentModuleReference: ModuleReference,
    public readonly currentClass: string,
  ) {}

  private getInterfaceInformation(
    moduleReference: ModuleReference,
    className: string,
  ): InterfaceTypingContext | undefined {
    return (
      this.globalTypingContext.get(moduleReference)?.classes?.get(className) ||
      this.globalTypingContext.get(moduleReference)?.interfaces?.get(className)
    );
  }

  public isSubtype(lower: SamlangType, upper: SamlangIdentifierType): boolean {
    if (lower.__type__ !== 'IdentifierType') return false;
    const interfaceTypingContext = this.getInterfaceInformation(
      lower.moduleReference,
      lower.identifier,
    );
    if (interfaceTypingContext == null) return false;
    if (lower.typeArguments.length !== interfaceTypingContext.typeParameters.length) return false;
    return interfaceTypingContext.superTypes.some((potentialSuperType) => {
      const substitutedPotentialSuperType = performTypeSubstitution(
        potentialSuperType,
        new Map(
          zip(interfaceTypingContext.typeParameters, lower.typeArguments).map(([name, arg]) => [
            name.name,
            arg,
          ]),
        ),
      );
      return isTheSameType(substitutedPotentialSuperType, upper);
    });
  }

  public getFunctionType(
    moduleReference: ModuleReference,
    className: string,
    member: string,
    useLocation: Location,
  ): MemberTypeInformation | null {
    const typeInfo = this.getInterfaceInformation(moduleReference, className)?.functions?.get(
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

  public getMethodType(
    moduleReference: ModuleReference,
    className: string,
    methodName: string,
    classTypeArguments: readonly SamlangType[],
    useLocation: Location,
  ): MemberTypeInformation | null {
    const relaventClass = this.getInterfaceInformation(moduleReference, className);
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

  /**
   * Resolve the type definition for an identifier within the current enclosing class.
   * This method will refuse to resolve variant identifier types outside of its enclosing class
   * according to type checking rules.
   */
  public resolveTypeDefinition(
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
    const relaventClass = this.globalTypingContext.get(moduleReference)?.classes?.get(identifier);
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
}

export class LocationBasedLocalTypingContext {
  private typeMap = LocationCollections.hashMapOf<SamlangType>();

  constructor(
    private readonly ssaAnalysisResult: SsaAnalysisResult,
    public readonly thisType: SamlangType | null,
  ) {}

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
