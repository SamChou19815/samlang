import type {
  Type,
  PrimitiveType,
  IdentifierType,
  TupleType,
  FunctionType,
} from 'samlang-core-ast/common-nodes';
import {
  prettyPrintHighIRType,
  HighIRType,
  HighIRPrimitiveType,
  HighIRIdentifierType,
  HighIRFunctionType,
  HighIRTypeDefinition,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-nodes';
import type { TypeDefinition } from 'samlang-core-ast/samlang-toplevel';
import { assert, checkNotNull } from 'samlang-core-utils';

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
    const identifier = `_SYNTHETIC_ID_TYPE_${this.nextID}`;
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
  }
};

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
  private contextIDCount = 0;

  constructor(
    private readonly genericTypes: ReadonlySet<string>,
    private readonly typeSynthesizer: HighIRTypeSynthesizer
  ) {}

  private allocateContextTypeParameter() {
    const typeParameter = `_TypeContext${this.contextIDCount}`;
    this.contextIDCount += 1;
    return typeParameter;
  }

  private get syntheticTypeContexts() {
    const syntheticTypeContexts: string[] = [];
    for (let i = 0; i < this.contextIDCount; i += 1) {
      syntheticTypeContexts.push(`_TypeContext${i}`);
    }
    return syntheticTypeContexts;
  }

  static lowerSamlangTypeDefinition(
    genericTypes: ReadonlySet<string>,
    typeSynthesizer: HighIRTypeSynthesizer,
    identifier: string,
    { type, names, mappings: sourceLevelMappings }: TypeDefinition
  ): HighIRTypeDefinition {
    const manager = new SamlangTypeLoweringManager(genericTypes, typeSynthesizer);
    const mappings = names.map((it) =>
      manager.lowerSamlangType(
        checkNotNull(sourceLevelMappings[it]).type,
        /* genericContext */ true
      )
    );
    const allGenericTypes = new Set(genericTypes);
    manager.syntheticTypeContexts.forEach((it) => allGenericTypes.add(it));
    const usedGenericTypes = collectUsedGenericTypes(
      // Hack: Wrap mappings inside a function type
      HIR_FUNCTION_TYPE(mappings, HIR_INT_TYPE),
      allGenericTypes
    );
    return { identifier, type, typeParameters: Array.from(usedGenericTypes), mappings };
  }

  static lowerSamlangFunctionTypeForTopLevel(
    genericTypes: ReadonlySet<string>,
    typeSynthesizer: HighIRTypeSynthesizer,
    { argumentTypes, returnType }: FunctionType
  ): [readonly string[], HighIRFunctionType] {
    const manager = new SamlangTypeLoweringManager(genericTypes, typeSynthesizer);
    const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
      argumentTypes.map((it) => manager.lowerSamlangType(it, /* genericContext */ true)),
      manager.lowerSamlangType(returnType, /* genericContext */ true)
    );
    const allGenericTypes = new Set(genericTypes);
    manager.syntheticTypeContexts.forEach((it) => allGenericTypes.add(it));
    const usedGenericTypes = collectUsedGenericTypes(
      hirFunctionTypeWithoutContext,
      allGenericTypes
    );
    return [Array.from(usedGenericTypes), hirFunctionTypeWithoutContext];
  }

  lowerSamlangType(type: Type, genericContext: boolean): HighIRType {
    assert(type.type !== 'UndecidedType', 'Unreachable!');
    switch (type.type) {
      case 'PrimitiveType':
        return lowerSamlangPrimitiveType(type);
      case 'IdentifierType':
        return this.lowerSamlangIdentifierType(type, genericContext);
      case 'TupleType':
        return this.lowerSamlangTupleType(type, genericContext);
      case 'FunctionType':
        return this.lowerSamlangFunctionType(type, genericContext);
    }
  }

  private lowerSamlangIdentifierType(
    type: IdentifierType,
    genericContext: boolean
  ): HighIRIdentifierType {
    if (this.genericTypes.has(type.identifier)) return HIR_IDENTIFIER_TYPE(type.identifier, []);
    return HIR_IDENTIFIER_TYPE(
      `${type.moduleReference.parts.join('_')}_${type.identifier}`,
      type.typeArguments.map((it) => this.lowerSamlangType(it, genericContext))
    );
  }

  private lowerSamlangTupleType(type: TupleType, genericContext: boolean): HighIRIdentifierType {
    const typeMappings = type.mappings.map((it) => this.lowerSamlangType(it, genericContext));
    const typeParameters = Array.from(
      collectUsedGenericTypes(HIR_FUNCTION_TYPE(typeMappings, HIR_BOOL_TYPE), this.genericTypes)
    );
    const typeDefinition = this.typeSynthesizer.synthesizeTupleType(typeMappings, typeParameters);
    return HIR_IDENTIFIER_TYPE(
      typeDefinition.identifier,
      typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
    );
  }

  private lowerSamlangFunctionType(
    type: FunctionType,
    genericContext: boolean
  ): HighIRIdentifierType {
    const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
      type.argumentTypes.map((it) => this.lowerSamlangType(it, genericContext)),
      this.lowerSamlangType(type.returnType, genericContext)
    );
    const usedGenericTypes = collectUsedGenericTypes(
      hirFunctionTypeWithoutContext,
      this.genericTypes
    );
    const typeParameters = Array.from(usedGenericTypes);
    if (genericContext) {
      const contextTypeParameter = this.allocateContextTypeParameter();
      const contextGenericType = HIR_IDENTIFIER_TYPE(contextTypeParameter, []);
      const typeDefinition = this.typeSynthesizer.synthesizeTupleType(
        [
          HIR_FUNCTION_TYPE(
            [contextGenericType, ...hirFunctionTypeWithoutContext.argumentTypes],
            hirFunctionTypeWithoutContext.returnType
          ),
          contextGenericType,
        ],
        [...typeParameters, contextTypeParameter]
      );
      return HIR_IDENTIFIER_TYPE(
        typeDefinition.identifier,
        typeDefinition.typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
      );
    } else {
      const typeDefinition = this.typeSynthesizer.synthesizeTupleType(
        [
          HIR_FUNCTION_TYPE(
            [HIR_INT_TYPE, ...hirFunctionTypeWithoutContext.argumentTypes],
            hirFunctionTypeWithoutContext.returnType
          ),
          HIR_INT_TYPE,
        ],
        typeParameters
      );
      return HIR_IDENTIFIER_TYPE(
        typeDefinition.identifier,
        typeDefinition.typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
      );
    }
  }
}
