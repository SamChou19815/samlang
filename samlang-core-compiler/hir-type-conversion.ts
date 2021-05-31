import type { Type } from 'samlang-core-ast/common-nodes';
import {
  prettyPrintHighIRType,
  HighIRType,
  HighIRTypeDefinition,
  HIR_BOOL_TYPE,
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-nodes';
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

export const lowerSamlangType = (
  type: Type,
  genericTypes: ReadonlySet<string>,
  typeSynthesizer: HighIRTypeSynthesizer
): HighIRType => {
  assert(type.type !== 'UndecidedType', 'Unreachable!');
  switch (type.type) {
    case 'PrimitiveType':
      switch (type.name) {
        case 'bool':
          return HIR_BOOL_TYPE;
        case 'int':
        case 'unit':
          return HIR_INT_TYPE;
        case 'string':
          return HIR_STRING_TYPE;
      }
    case 'IdentifierType': {
      if (genericTypes.has(type.identifier)) return HIR_IDENTIFIER_TYPE(type.identifier, []);
      return HIR_IDENTIFIER_TYPE(
        `${type.moduleReference.parts.join('_')}_${type.identifier}`,
        type.typeArguments.map((it) => lowerSamlangType(it, genericTypes, typeSynthesizer))
      );
    }
    case 'TupleType': {
      const typeMappings = type.mappings.map((it) =>
        lowerSamlangType(it, genericTypes, typeSynthesizer)
      );
      const typeParameters = Array.from(
        collectUsedGenericTypes(HIR_FUNCTION_TYPE(typeMappings, HIR_BOOL_TYPE), genericTypes)
      );
      const typeDefinition = typeSynthesizer.synthesizeTupleType(typeMappings, typeParameters);
      return HIR_IDENTIFIER_TYPE(
        typeDefinition.identifier,
        typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
      );
    }
    case 'FunctionType': {
      const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
        [...type.argumentTypes.map((it) => lowerSamlangType(it, genericTypes, typeSynthesizer))],
        lowerSamlangType(type.returnType, genericTypes, typeSynthesizer)
      );
      const usedGenericTypes = collectUsedGenericTypes(hirFunctionTypeWithoutContext, genericTypes);
      const typeParameters = Array.from(usedGenericTypes);
      const contextGenericType = HIR_IDENTIFIER_TYPE('_Context', []);
      const typeDefinition = typeSynthesizer.synthesizeTupleType(
        [
          HIR_FUNCTION_TYPE(
            [contextGenericType, ...hirFunctionTypeWithoutContext.argumentTypes],
            hirFunctionTypeWithoutContext.returnType
          ),
          contextGenericType,
        ],
        [...typeParameters, '_Context']
      );
      return HIR_IDENTIFIER_TYPE(
        typeDefinition.identifier,
        typeDefinition.typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
      );
    }
  }
};
