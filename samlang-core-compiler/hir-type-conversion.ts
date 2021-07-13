import type {
  Type,
  PrimitiveType,
  FunctionType,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import {
  prettyPrintHighIRType,
  HighIRType,
  HighIRPrimitiveType,
  HighIRFunctionType,
  HighIRTypeDefinition,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_FUNCTION_TYPE,
  HIR_CLOSURE_TYPE,
} from 'samlang-core-ast/hir-nodes';
import type { TypeDefinition } from 'samlang-core-ast/samlang-toplevel';
import { assert, checkNotNull, zip } from 'samlang-core-utils';

/** A helper class to generate an identifier type for each struct type. */
export class HighIRTypeSynthesizer {
  private readonly _synthesized = new Map<string, HighIRTypeDefinition>();
  private readonly reverseMap = new Map<string, string>();
  private nextID = 0;

  public get mappings(): ReadonlyMap<string, HighIRTypeDefinition> {
    return this._synthesized;
  }

  public get synthesized(): readonly HighIRTypeDefinition[] {
    return Array.from(this._synthesized.values());
  }

  public synthesizeTupleType(
    mappings: readonly HighIRType[],
    typeParameters: readonly string[]
  ): HighIRTypeDefinition {
    const key = mappings.map(prettyPrintHighIRType).join(',');
    const existingIdentifier = this.reverseMap.get(key);
    if (existingIdentifier != null) return checkNotNull(this._synthesized.get(existingIdentifier));
    const identifier = `$SyntheticIDType${this.nextID}`;
    this.nextID += 1;
    this.reverseMap.set(key, identifier);
    const typeDefinition: HighIRTypeDefinition = {
      identifier,
      type: 'object',
      typeParameters,
      mappings,
    };
    this._synthesized.set(identifier, typeDefinition);
    return typeDefinition;
  }
}

export const collectUsedGenericTypes = (
  highIRType: HighIRType,
  genericTypes: ReadonlySet<string>
): ReadonlySet<string> => {
  const collector = new Set<string>();
  const visit = (t: HighIRType) => {
    switch (t.__type__) {
      case 'PrimitiveType':
        return;
      case 'IdentifierType':
        if (genericTypes.has(t.name) && t.typeArguments.length === 0) collector.add(t.name);
        t.typeArguments.forEach(visit);
        return;
      case 'FunctionType':
        t.argumentTypes.forEach(visit);
        visit(t.returnType);
        return;
    }
  };
  visit(highIRType);
  return collector;
};

export const solveTypeArguments = (
  genericTypeParameters: readonly string[],
  specializedType: HighIRType,
  parameterizedTypeDefinition: HighIRType
): readonly HighIRType[] => {
  const genericTypeParameterSet = new Set(genericTypeParameters);
  const solved = new Map<string, HighIRType>();

  const solve = (t1: HighIRType, t2: HighIRType): void => {
    switch (t1.__type__) {
      case 'PrimitiveType':
        assert(t2.__type__ === 'PrimitiveType' && t1.type === t2.type);
        return;
      case 'IdentifierType':
        if (t1.typeArguments.length === 0 && genericTypeParameterSet.has(t1.name)) {
          solved.set(t1.name, t2);
          return;
        }
        assert(
          t2.__type__ === 'IdentifierType' &&
            t1.name === t2.name &&
            t1.typeArguments.length === t2.typeArguments.length
        );
        zip(t1.typeArguments, t2.typeArguments).forEach(([a1, a2]) => solve(a1, a2));
        return;
      case 'FunctionType':
        assert(
          t2.__type__ === 'FunctionType' && t1.argumentTypes.length === t2.argumentTypes.length
        );
        zip(t1.argumentTypes, t2.argumentTypes).forEach(([a1, a2]) => solve(a1, a2));
        solve(t1.returnType, t2.returnType);
        return;
      case 'ClosureType':
        assert(
          t2.__type__ === 'ClosureType' && t1.argumentTypes.length === t2.argumentTypes.length
        );
        zip(t1.argumentTypes, t2.argumentTypes).forEach(([a1, a2]) => solve(a1, a2));
        solve(t1.returnType, t2.returnType);
        return;
    }
  };

  solve(specializedType, parameterizedTypeDefinition);
  return genericTypeParameters.map((it) => checkNotNull(solved.get(it)));
};

export const highIRTypeApplication = (
  type: HighIRType,
  replacementMap: Readonly<Record<string, HighIRType>>
): HighIRType => {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      if (type.typeArguments.length !== 0) return type;
      return replacementMap[type.name] ?? type;
    case 'FunctionType':
      return HIR_FUNCTION_TYPE(
        type.argumentTypes.map((it) => highIRTypeApplication(it, replacementMap)),
        highIRTypeApplication(type.returnType, replacementMap)
      );
    case 'ClosureType':
      return HIR_CLOSURE_TYPE(
        type.argumentTypes.map((it) => highIRTypeApplication(it, replacementMap)),
        highIRTypeApplication(type.returnType, replacementMap)
      );
  }
};

export const encodeHighIRType = (moduleReference: ModuleReference, identifier: string): string =>
  `${moduleReference.parts.join('_')}_${identifier}`;

const lowerSamlangPrimitiveType = (type: PrimitiveType): HighIRPrimitiveType => {
  switch (type.name) {
    case 'bool':
      return HIR_BOOL_TYPE;
    case 'int':
    case 'unit':
      return HIR_INT_TYPE;
    case 'string':
      return HIR_STRING_TYPE;
  }
};

export class SamlangTypeLoweringManager {
  constructor(
    public readonly genericTypes: ReadonlySet<string>,
    public readonly typeSynthesizer: HighIRTypeSynthesizer
  ) {}

  lowerSamlangType = (type: Type): HighIRType => {
    assert(type.type !== 'UndecidedType', 'Unreachable!');
    switch (type.type) {
      case 'PrimitiveType':
        return lowerSamlangPrimitiveType(type);
      case 'IdentifierType':
        if (this.genericTypes.has(type.identifier)) {
          return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(type.identifier);
        }
        return HIR_IDENTIFIER_TYPE(
          encodeHighIRType(type.moduleReference, type.identifier),
          type.typeArguments.map(this.lowerSamlangType)
        );
      case 'TupleType': {
        const typeMappings = type.mappings.map(this.lowerSamlangType);
        const typeParameters = Array.from(
          collectUsedGenericTypes(HIR_FUNCTION_TYPE(typeMappings, HIR_BOOL_TYPE), this.genericTypes)
        );
        const typeDefinition = this.typeSynthesizer.synthesizeTupleType(
          typeMappings,
          typeParameters
        );
        return HIR_IDENTIFIER_TYPE(
          typeDefinition.identifier,
          typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
        );
      }
      case 'FunctionType':
        return HIR_CLOSURE_TYPE(
          type.argumentTypes.map(this.lowerSamlangType),
          this.lowerSamlangType(type.returnType)
        );
    }
  };

  lowerSamlangTypeDefinition = (
    moduleReference: ModuleReference,
    identifier: string,
    { type, names, mappings: sourceLevelMappings }: TypeDefinition
  ): HighIRTypeDefinition => ({
    identifier: encodeHighIRType(moduleReference, identifier),
    type,
    typeParameters: Array.from(this.genericTypes),
    mappings: names.map((it) => this.lowerSamlangType(checkNotNull(sourceLevelMappings[it]).type)),
  });

  lowerSamlangFunctionTypeForTopLevel(type: FunctionType): [readonly string[], HighIRFunctionType] {
    const hirFunctionType = HIR_FUNCTION_TYPE(
      type.argumentTypes.map(this.lowerSamlangType),
      this.lowerSamlangType(type.returnType)
    );
    const typeParameters = Array.from(collectUsedGenericTypes(hirFunctionType, this.genericTypes));
    return [typeParameters, hirFunctionType];
  }
}
