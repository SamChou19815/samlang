import {
  Location,
  LocationCollections,
  ModuleReference,
  moduleReferenceToString,
  SourceReason,
} from "../ast/common-nodes";
import {
  isTheSameType,
  prettyPrintType,
  prettyPrintTypeParamaters,
  SamlangFunctionType,
  SamlangIdentifierType,
  SamlangType,
  SourceFieldType,
  SourceIdentifierType,
  SourceUnknownType,
  TypeParameterSignature,
  typeReposition,
} from "../ast/samlang-nodes";
import type { GlobalErrorReporter } from "../errors";
import { checkNotNull, ReadonlyHashMap, zip } from "../utils";
import type { SsaAnalysisResult } from "./ssa-analysis";
import performTypeSubstitution from "./type-substitution";

export class LocationBasedLocalTypingContext {
  private typeMap = LocationCollections.hashMapOf<SamlangType>();

  constructor(private readonly ssaAnalysisResult: SsaAnalysisResult) {}

  read(location: Location): SamlangType {
    const definitionLocation = this.ssaAnalysisResult.useDefineMap.get(location);
    // When the name is unbound, we treat itself as definition.
    if (definitionLocation == null) return SourceUnknownType(SourceReason(location, null));
    return typeReposition(
      checkNotNull(this.typeMap.get(definitionLocation), definitionLocation.toString()),
      location,
    );
  }

  write(location: Location, type: SamlangType): void {
    this.typeMap.set(location, type);
  }

  getCaptured(lambdaLocation: Location): ReadonlyMap<string, SamlangType> {
    const map = new Map<string, SamlangType>();
    const capturedEntries = this.ssaAnalysisResult.lambdaCaptures.forceGet(lambdaLocation);
    for (const [name, location] of capturedEntries) {
      const firstLetter = name.charAt(0);
      if ("A" <= firstLetter && firstLetter <= "Z") continue;
      map.set(name, this.typeMap.forceGet(location));
    }
    return map;
  }
}

function instantiateInterfaceContext(
  potentiallyNotInstantiatedInterfaceInformation: InterfaceTypingContext,
  idType: SamlangIdentifierType,
): InterfaceTypingContext {
  const substitutionMap = new Map(
    zip(
      potentiallyNotInstantiatedInterfaceInformation.typeParameters
        .slice(0, idType.typeArguments.length)
        .map((it) => it.name),
      idType.typeArguments,
    ),
  );
  const methods = new Map<string, MemberTypeInformation>();
  for (const [name, info] of potentiallyNotInstantiatedInterfaceInformation.methods.entries()) {
    methods.set(name, {
      isPublic: info.isPublic,
      typeParameters: info.typeParameters,
      type: performTypeSubstitution(info.type, substitutionMap) as SamlangFunctionType,
    });
  }
  return {
    isConcrete: potentiallyNotInstantiatedInterfaceInformation.isConcrete,
    functions: potentiallyNotInstantiatedInterfaceInformation.functions,
    methods,
    typeParameters: [],
    superTypes: [...potentiallyNotInstantiatedInterfaceInformation.superTypes, idType],
  };
}

export interface MemberTypeInformation {
  readonly isPublic: boolean;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly type: SamlangFunctionType;
}

export function memberTypeInformationToString(
  name: string,
  { isPublic, typeParameters, type }: MemberTypeInformation,
): string {
  const accessString = isPublic ? "public" : "private";
  const tparamString = prettyPrintTypeParamaters(typeParameters);
  return `${accessString} ${name}${tparamString}${prettyPrintType(type)}`;
}

export interface InterfaceTypingContext {
  readonly isConcrete: boolean;
  readonly functions: ReadonlyMap<string, MemberTypeInformation>;
  readonly methods: ReadonlyMap<string, MemberTypeInformation>;
  readonly typeParameters: readonly TypeParameterSignature[];
  readonly superTypes: readonly SamlangIdentifierType[];
}

export interface TypeDefinitionTypingContext {
  readonly type: "object" | "variant";
  readonly names: readonly string[];
  readonly mappings: ReadonlyMap<string, SourceFieldType>;
}

export interface ModuleTypingContext {
  readonly typeDefinitions: ReadonlyMap<string, TypeDefinitionTypingContext>;
  readonly interfaces: ReadonlyMap<string, InterfaceTypingContext>;
}

export type GlobalTypingContext = ReadonlyHashMap<ModuleReference, ModuleTypingContext>;

export class TypingContext {
  constructor(
    private readonly globalTypingContext: GlobalTypingContext,
    public readonly localTypingContext: LocationBasedLocalTypingContext,
    public readonly errorReporter: GlobalErrorReporter,
    public readonly currentModuleReference: ModuleReference,
    public readonly currentClass: string,
    public readonly availableTypeParameters: readonly TypeParameterSignature[],
  ) {}

  // needed get instantiated interface info

  private getInterfaceInformation(
    moduleReference: ModuleReference,
    identifier: string,
  ): InterfaceTypingContext | undefined {
    const relevantTypeParameter = this.availableTypeParameters.find((it) => it.name === identifier);
    if (relevantTypeParameter != null) {
      if (relevantTypeParameter.bound == null) {
        // Accessing interface info on an unbounded type parameter is not necessarily bad,
        // but it won't produce any good information either.
        return {
          isConcrete: true,
          functions: new Map(),
          methods: new Map(),
          typeParameters: [],
          superTypes: [],
        };
      }
      const interfaceContext =
        this.dangerouslyGetInterfaceInformationWithoutConsideringTypeParametersInBound(
          relevantTypeParameter.bound.moduleReference,
          relevantTypeParameter.bound.identifier,
        );
      if (interfaceContext == null) return undefined;
      return instantiateInterfaceContext(interfaceContext, relevantTypeParameter.bound);
    }
    return this.dangerouslyGetInterfaceInformationWithoutConsideringTypeParametersInBound(
      moduleReference,
      identifier,
    );
  }

  private dangerouslyGetInterfaceInformationWithoutConsideringTypeParametersInBound(
    moduleReference: ModuleReference,
    identifier: string,
  ): InterfaceTypingContext | undefined {
    return this.globalTypingContext.get(moduleReference)?.interfaces?.get(identifier);
  }

  public isSubtype = (lower: SamlangType, upper: SamlangIdentifierType): boolean => {
    if (lower.__type__ !== "IdentifierType") return false;
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
  };

  public validateTypeInstantiationAllowAbstractTypes = (type: SamlangType): void =>
    this.validateTypeInstantiationCustomized(type, false);

  public validateTypeInstantiationStrictly = (type: SamlangType): void =>
    this.validateTypeInstantiationCustomized(type, true);

  private validateTypeInstantiationCustomized(
    type: SamlangType,
    enforceConcreteTypes: boolean,
  ): void {
    // if (type.__type__ !== 'IdentifierType') return;
    if (type.__type__ === "PrimitiveType" || type.__type__ === "UnknownType") return;
    if (type.__type__ === "FunctionType") {
      type.argumentTypes.forEach((it) => this.validateTypeInstantiationCustomized(it, true));
      this.validateTypeInstantiationCustomized(type.returnType, true);
      return;
    }
    // Generic type is assumed to be good, but it must have zero type args.
    if (this.availableTypeParameters.some((it) => it.name === type.identifier)) {
      if (type.typeArguments.length !== 0) {
        this.errorReporter.reportArityMismatchError(
          type.reason.useLocation,
          "type arguments",
          0,
          type.typeArguments.length,
        );
        return;
      }
      return;
    }
    type.typeArguments.forEach((it) => this.validateTypeInstantiationCustomized(it, true));
    const interfaceInformation = this.getInterfaceInformation(
      type.moduleReference,
      type.identifier,
    );
    // Syntactically invalid types are already validated.
    if (interfaceInformation == null) return;
    if (!interfaceInformation.isConcrete && enforceConcreteTypes) {
      this.errorReporter.reportUnexpectedTypeKindError(
        type.reason.useLocation,
        "non-abstract type",
        type,
      );
    }
    if (interfaceInformation.typeParameters.length !== type.typeArguments.length) {
      this.errorReporter.reportArityMismatchError(
        type.reason.useLocation,
        "type arguments",
        interfaceInformation.typeParameters.length,
        type.typeArguments.length,
      );
      return;
    }
    zip(interfaceInformation.typeParameters, type.typeArguments).forEach(
      ([{ bound }, typeArgument]) => {
        if (bound != null && !this.isSubtype(typeArgument, bound)) {
          this.errorReporter.reportUnexpectedSubtypeError(
            typeArgument.reason.useLocation,
            bound,
            typeArgument,
          );
        }
      },
    );
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
    const typeInfo = instantiateInterfaceContext(
      relaventClass,
      SourceIdentifierType(
        SourceReason(useLocation, null),
        moduleReference,
        className,
        classTypeArguments,
      ),
    ).methods?.get(methodName);
    if (typeInfo == null || (!typeInfo.isPublic && className !== this.currentClass)) return null;
    return {
      isPublic: typeInfo.isPublic,
      type: typeReposition(typeInfo.type, useLocation),
      typeParameters: typeInfo.typeParameters,
    };
  }

  public resolveTypeDefinition(
    { moduleReference, identifier, typeArguments }: SamlangIdentifierType,
    typeDefinitionType: "object" | "variant",
  ): {
    readonly names: readonly string[];
    readonly mappings: ReadonlyMap<string, SourceFieldType>;
  } {
    let relaventTypeParameters =
      this.getInterfaceInformation(moduleReference, identifier)?.typeParameters ?? [];
    const relaventTypingDefinition = this.globalTypingContext
      .get(moduleReference)
      ?.typeDefinitions?.get(identifier);
    if (relaventTypingDefinition == null || relaventTypingDefinition.type !== typeDefinitionType) {
      return { names: [], mappings: new Map() };
    }
    const { names, mappings: nameMappings } = relaventTypingDefinition;
    if (relaventTypeParameters.length > typeArguments.length) {
      relaventTypeParameters = relaventTypeParameters.slice(0, typeArguments.length);
    }
    const mappings = new Map(
      Array.from(nameMappings, ([name, fieldType]) => {
        return [
          name,
          {
            isPublic: fieldType.isPublic,
            type: performTypeSubstitution(
              fieldType.type,
              new Map(
                zip(
                  relaventTypeParameters.map((it) => it.name),
                  typeArguments,
                ),
              ),
            ),
          },
        ];
      }),
    );
    return { names, mappings };
  }
}
