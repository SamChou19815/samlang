import type { Type, FunctionType } from 'samlang-core-ast/common-nodes';
import {
  prettyPrintHighIRType,
  HighIRType,
  HighIRFunctionType,
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

  lowerSamlangFunctionTypeForTopLevel = ({
    argumentTypes,
    returnType,
  }: FunctionType): HighIRFunctionType => {
    const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
      [...argumentTypes.map(this.lowerSamlangType)],
      this.lowerSamlangType(returnType)
    );
    // TODO: collect context parameters
    return hirFunctionTypeWithoutContext;
  };

  lowerSamlangType = (type: Type): HighIRType => {
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
        if (this.genericTypes.has(type.identifier)) return HIR_IDENTIFIER_TYPE(type.identifier, []);
        return HIR_IDENTIFIER_TYPE(
          `${type.moduleReference.parts.join('_')}_${type.identifier}`,
          type.typeArguments.map(this.lowerSamlangType)
        );
      }
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
          typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
        );
      }
      case 'FunctionType': {
        const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
          [...type.argumentTypes.map(this.lowerSamlangType)],
          this.lowerSamlangType(type.returnType)
        );
        const usedGenericTypes = collectUsedGenericTypes(
          hirFunctionTypeWithoutContext,
          this.genericTypes
        );
        const typeParameters = Array.from(usedGenericTypes);
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
      }
    }
  };
}
