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

export const lowerSamlangPrimitiveType = (type: PrimitiveType): HighIRPrimitiveType => {
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

const GENERAL_SYNTHETIC_TYPE_CONTEXT = '$TC';

/**
 * Unlike other type lowering functions, we need a manager to keep track of additional globally
 * relevant informations.
 *
 * The core issue is that the type lowering from source level to HIR level may introduces additional
 * generic type parameters. For example, the type definition at the source level:
 *
 * ```samlang
 * class Foo<A, B>(bar: () -> A, baz: (bool) -> B) {}
 * ```
 *
 * should be lowered into something like
 *
 * ```typescript
 * // For `() -> A`
 * type Synthetic0<A, Context0> = readonly [(Context0) -> A, Context0];
 * // For `() -> B`
 * type Synthetic1<B, Context0> = readonly [(Context0, bool) -> B, Context0];
 * // Finally, for `Foo`
 * type Foo<A, B, Context0, Context1> = readonly [Synthetic0<A, Context0>, Synthetic0<B, Context1>];
 * ```
 *
 * At the source level, there are possible phantom type issues, but they got resolved during
 * type inference and type fixing at the end. At the source -> HIR level, we need to resolve new
 * phantom type issues that arises during translation.
 *
 * Complicating the effort is that we have two different strategies to deal with phantom types.
 * At the type definition and toplevel function levels, types can have generic parameters, so a
 * function type like `(bool) -> int` can be turned into
 * `type Synthetic1<Context0> = [(Context0, bool) -> int, Context0]`. However, at the expression
 * level, everything must not have any unresolved generic parameters, and we resolve unused generic
 * parameters to `int`, so we have `type Synthetic1 = [(int, bool) -> int, int]`.
 *
 * TODO: ensure two strategies give the same number of generic parameter/arguments for the same
 * type.
 */
export class SamlangTypeLoweringManager {
  private contextIDCount = 0;

  constructor(
    private readonly genericTypes: ReadonlySet<string>,
    private readonly typeSynthesizer: HighIRTypeSynthesizer
  ) {}

  private allocateContextTypeParameter() {
    const typeParameter = `$TC${this.contextIDCount}`;
    this.contextIDCount += 1;
    return typeParameter;
  }

  private get syntheticTypeContexts() {
    const syntheticTypeContexts: string[] = [];
    for (let i = 0; i < this.contextIDCount; i += 1) {
      syntheticTypeContexts.push(`$TC${i}`);
    }
    return syntheticTypeContexts;
  }

  private getUsedSyntheticTypeContexts(type: HighIRType) {
    return Array.from(collectUsedGenericTypes(type, new Set(this.syntheticTypeContexts)));
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
    const typeParameters = [
      ...genericTypes,
      ...manager.getUsedSyntheticTypeContexts(
        // Hack: Wrap mappings inside a function type
        HIR_FUNCTION_TYPE(mappings, HIR_INT_TYPE)
      ),
    ];
    return { identifier, type, typeParameters, mappings };
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
    const typeParameters = [
      ...genericTypes,
      ...manager.getUsedSyntheticTypeContexts(hirFunctionTypeWithoutContext),
    ];
    return [typeParameters, hirFunctionTypeWithoutContext];
  }

  lowerSamlangTypeForLocalValues = (type: Type): HighIRType => {
    assert(type.type !== 'UndecidedType', 'Unreachable!');
    switch (type.type) {
      case 'PrimitiveType':
        return lowerSamlangPrimitiveType(type);
      case 'IdentifierType':
        return this.lowerSamlangIdentifierTypeForLocalValues(type);
      case 'TupleType':
        return this.lowerSamlangTupleTypeForLocalValues(type);
      case 'FunctionType':
        return this.lowerSamlangFunctionTypeForLocalValues(type);
    }
  };

  lowerSamlangIdentifierTypeForLocalValues(type: IdentifierType): HighIRIdentifierType {
    if (this.genericTypes.has(type.identifier)) return HIR_IDENTIFIER_TYPE(type.identifier, []);
    // TODO: add more dummy type arguments from type definition
    return HIR_IDENTIFIER_TYPE(
      `${type.moduleReference.parts.join('_')}_${type.identifier}`,
      type.typeArguments.map(this.lowerSamlangTypeForLocalValues)
    );
  }

  lowerSamlangTupleTypeForLocalValues(type: TupleType): HighIRIdentifierType {
    const typeMappings = type.mappings.map(this.lowerSamlangTypeForLocalValues);
    const typeParameters = Array.from(
      collectUsedGenericTypes(HIR_FUNCTION_TYPE(typeMappings, HIR_BOOL_TYPE), this.genericTypes)
    );
    const typeDefinition = this.typeSynthesizer.synthesizeTupleType(typeMappings, typeParameters);
    return HIR_IDENTIFIER_TYPE(
      typeDefinition.identifier,
      typeParameters.map((name) => HIR_IDENTIFIER_TYPE(name, []))
    );
  }

  lowerSamlangFunctionTypeForLocalValues(type: FunctionType): HighIRIdentifierType {
    const hirFunctionTypeWithoutContext = HIR_FUNCTION_TYPE(
      type.argumentTypes.map(this.lowerSamlangTypeForLocalValues),
      this.lowerSamlangTypeForLocalValues(type.returnType)
    );
    const usedGenericTypes = collectUsedGenericTypes(
      hirFunctionTypeWithoutContext,
      this.genericTypes
    );
    const typeParameters = Array.from(usedGenericTypes);
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

  lowerSamlangIdentifierType(type: IdentifierType, genericContext: boolean): HighIRIdentifierType {
    if (this.genericTypes.has(type.identifier)) return HIR_IDENTIFIER_TYPE(type.identifier, []);
    // TODO: add more dummy type arguments from type definition
    return HIR_IDENTIFIER_TYPE(
      `${type.moduleReference.parts.join('_')}_${type.identifier}`,
      type.typeArguments.map((it) => this.lowerSamlangType(it, genericContext))
    );
  }

  lowerSamlangTupleType(type: TupleType, genericContext: boolean): HighIRIdentifierType {
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

  lowerSamlangFunctionType(type: FunctionType, genericContext: boolean): HighIRIdentifierType {
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
      const contextGenericType = HIR_IDENTIFIER_TYPE(GENERAL_SYNTHETIC_TYPE_CONTEXT, []);
      const functionTypeWithContext = HIR_FUNCTION_TYPE(
        [contextGenericType, ...hirFunctionTypeWithoutContext.argumentTypes],
        hirFunctionTypeWithoutContext.returnType
      );
      const instanceSpecificTypeContext = this.allocateContextTypeParameter();
      const typeDefinition = this.typeSynthesizer.synthesizeTupleType(
        [functionTypeWithContext, contextGenericType],
        [
          ...typeParameters,
          ...this.getUsedSyntheticTypeContexts(functionTypeWithContext),
          GENERAL_SYNTHETIC_TYPE_CONTEXT,
        ]
      );
      return HIR_IDENTIFIER_TYPE(
        typeDefinition.identifier,
        typeDefinition.typeParameters.map((name, index) =>
          HIR_IDENTIFIER_TYPE(
            index === typeDefinition.typeParameters.length - 1 ? instanceSpecificTypeContext : name,
            []
          )
        )
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
