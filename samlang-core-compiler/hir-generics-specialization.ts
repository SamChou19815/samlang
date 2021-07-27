import {
  HighIRType,
  HighIRIdentifierType,
  HighIRFunctionType,
  HighIRClosureTypeDefinition,
  HighIRTypeDefinition,
  HighIRExpression,
  HighIRStatement,
  HighIRFunction,
  HighIRSources,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_FUNCTION_TYPE,
  HIR_NAME,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_STRUCT_INITIALIZATION,
  HIR_CLOSURE_INITIALIZATION,
} from 'samlang-core-ast/hir-nodes';
import { assert, checkNotNull, zip } from 'samlang-core-utils';

import {
  solveTypeArguments,
  highIRTypeApplication,
  resolveIdentifierTypeMappings,
  encodeHighIRNameAfterGenericsSpecialization,
} from './hir-type-conversion';

class GenericsSpecializationRewriter {
  private readonly originalClosureTypeDefinitions: Readonly<
    Record<string, HighIRClosureTypeDefinition>
  >;
  private readonly originalTypeDefinitions: Readonly<Record<string, HighIRTypeDefinition>>;
  private readonly originalFunctions: Readonly<Record<string, HighIRFunction>>;

  public readonly usedStringNames: Set<string> = new Set();
  public readonly specializedClosureTypeDefinitions: Record<string, HighIRClosureTypeDefinition> =
    {};
  public readonly specializedTypeDefinitions: Record<string, HighIRTypeDefinition> = {};
  public readonly specializedFunctions: Record<string, HighIRFunction> = {};

  constructor(sources: HighIRSources) {
    this.originalClosureTypeDefinitions = Object.fromEntries(
      sources.closureTypes.map((it) => [it.identifier, it])
    );
    this.originalTypeDefinitions = Object.fromEntries(
      sources.typeDefinitions.map((it) => [it.identifier, it])
    );
    this.originalFunctions = Object.fromEntries(sources.functions.map((it) => [it.name, it]));
    sources.mainFunctionNames.forEach((mainFunctionName) => {
      this.specializedFunctions[mainFunctionName] = this.rewriteFunction(
        checkNotNull(this.originalFunctions[mainFunctionName], `Missing ${mainFunctionName}`),
        {}
      );
    });
  }

  private rewriteFunction = (
    highIRFunction: HighIRFunction,
    genericsReplacementMap: Readonly<Record<string, HighIRType>>
  ): HighIRFunction => ({
    name: highIRFunction.name,
    parameters: highIRFunction.parameters,
    typeParameters: highIRFunction.typeParameters,
    type: highIRFunction.type,
    body: highIRFunction.body.map((it) => this.rewriteStatement(it, genericsReplacementMap)),
    returnValue: this.rewriteExpression(highIRFunction.returnValue, genericsReplacementMap),
  });

  private rewriteStatement(
    statement: HighIRStatement,
    genericsReplacementMap: Readonly<Record<string, HighIRType>>
  ): HighIRStatement {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        return HIR_INDEX_ACCESS({
          name: statement.name,
          type: this.rewriteType(statement.type, genericsReplacementMap),
          pointerExpression: this.rewriteExpression(
            statement.pointerExpression,
            genericsReplacementMap
          ),
          index: statement.index,
        });
      case 'HighIRBinaryStatement':
        return HIR_BINARY({
          name: statement.name,
          operator: statement.operator,
          e1: this.rewriteExpression(statement.e1, genericsReplacementMap),
          e2: this.rewriteExpression(statement.e2, genericsReplacementMap),
        });
      case 'HighIRFunctionCallStatement': {
        const functionExpression = this.rewriteExpression(
          statement.functionExpression,
          genericsReplacementMap
        );
        assert(functionExpression.__type__ !== 'HighIRIntLiteralExpression');
        return HIR_FUNCTION_CALL({
          functionExpression,
          functionArguments: statement.functionArguments.map((it) =>
            this.rewriteExpression(it, genericsReplacementMap)
          ),
          returnType: this.rewriteType(statement.returnType, genericsReplacementMap),
          returnCollector: statement.returnCollector,
        });
      }
      case 'HighIRIfElseStatement':
        return HIR_IF_ELSE({
          booleanExpression: this.rewriteExpression(
            statement.booleanExpression,
            genericsReplacementMap
          ),
          s1: statement.s1.map((it) => this.rewriteStatement(it, genericsReplacementMap)),
          s2: statement.s2.map((it) => this.rewriteStatement(it, genericsReplacementMap)),
          finalAssignments: statement.finalAssignments.map(
            ({ name, type, branch1Value, branch2Value }) => ({
              name,
              type: this.rewriteType(type, genericsReplacementMap),
              branch1Value: this.rewriteExpression(branch1Value, genericsReplacementMap),
              branch2Value: this.rewriteExpression(branch2Value, genericsReplacementMap),
            })
          ),
        });
      case 'HighIRStructInitializationStatement': {
        const type = this.rewriteType(statement.type, genericsReplacementMap);
        assert(type.__type__ === 'IdentifierType');
        return HIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type,
          expressionList: statement.expressionList.map((it) =>
            this.rewriteExpression(it, genericsReplacementMap)
          ),
        });
      }
      case 'HighIRClosureInitializationStatement': {
        const closureType = this.rewriteType(statement.closureType, genericsReplacementMap);
        assert(closureType.__type__ === 'IdentifierType');
        const functionType = this.rewriteType(statement.functionType, genericsReplacementMap);
        assert(functionType.__type__ === 'FunctionType');
        return HIR_CLOSURE_INITIALIZATION({
          closureVariableName: statement.closureVariableName,
          closureType,
          functionName: this.rewriteFunctionName(statement.functionName, functionType),
          functionType,
          context: this.rewriteExpression(statement.context, genericsReplacementMap),
        });
      }
    }
  }

  private rewriteExpression(
    expression: HighIRExpression,
    genericsReplacementMap: Readonly<Record<string, HighIRType>>
  ): HighIRExpression {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return expression;
      case 'HighIRVariableExpression':
        return { ...expression, type: this.rewriteType(expression.type, genericsReplacementMap) };
      case 'HighIRNameExpression': {
        if (expression.type.__type__ === 'PrimitiveType') {
          this.usedStringNames.add(expression.name);
          return expression;
        }
        const functionType = HIR_FUNCTION_TYPE(
          expression.type.argumentTypes.map((it) => this.rewriteType(it, genericsReplacementMap)),
          this.rewriteType(expression.type.returnType, genericsReplacementMap)
        );
        const rewrittenName = this.rewriteFunctionName(expression.name, functionType);
        return HIR_NAME(rewrittenName, functionType);
      }
    }
  }

  private rewriteFunctionName(originalName: string, functionType: HighIRFunctionType): string {
    const existingFunction = this.originalFunctions[originalName];
    if (existingFunction == null) return originalName;
    const solvedFunctionTypeArguments = solveTypeArguments(
      existingFunction.typeParameters,
      functionType,
      existingFunction.type,
      this.resolveIdentifierType
    );
    const encodedSpecializedFunctionName = encodeHighIRNameAfterGenericsSpecialization(
      originalName,
      solvedFunctionTypeArguments
    );
    if (this.specializedFunctions[encodedSpecializedFunctionName] == null) {
      // Temporaily add an incorrect version to avoid infinite recursion.
      this.specializedFunctions[encodedSpecializedFunctionName] = existingFunction;
      this.specializedFunctions[encodedSpecializedFunctionName] = this.rewriteFunction(
        {
          name: encodedSpecializedFunctionName,
          parameters: existingFunction.parameters,
          typeParameters: [],
          type: functionType,
          body: existingFunction.body,
          returnValue: existingFunction.returnValue,
        },
        Object.fromEntries(zip(existingFunction.typeParameters, solvedFunctionTypeArguments))
      );
    }
    return encodedSpecializedFunctionName;
  }

  private rewriteType(
    type: HighIRType,
    genericsReplacementMap: Readonly<Record<string, HighIRType>>
  ): HighIRType {
    switch (type.__type__) {
      case 'PrimitiveType':
        return type;
      case 'FunctionType':
        return HIR_FUNCTION_TYPE(
          type.argumentTypes.map((it) => this.rewriteType(it, genericsReplacementMap)),
          this.rewriteType(type.returnType, genericsReplacementMap)
        );
      case 'IdentifierType':
        return this.rewriteHighIRIdentifierType(type, genericsReplacementMap);
    }
  }

  private rewriteHighIRIdentifierType(
    type: HighIRIdentifierType,
    genericsReplacementMap: Readonly<Record<string, HighIRType>>
  ): HighIRType {
    if (type.typeArguments.length === 0) {
      const replacement = genericsReplacementMap[type.name];
      if (replacement != null) return replacement;
    }
    const concreteType = {
      ...type,
      typeArguments: type.typeArguments.map((it) => this.rewriteType(it, genericsReplacementMap)),
    };
    const encodedName = encodeHighIRNameAfterGenericsSpecialization(
      concreteType.name,
      concreteType.typeArguments
    );
    const existingSpecializedTypeDefinition = this.specializedTypeDefinitions[encodedName];
    if (existingSpecializedTypeDefinition == null) {
      const typeDefinition = this.originalTypeDefinitions[concreteType.name];
      if (typeDefinition == null) {
        const existingSpecializedClosureTypeDefinition =
          this.specializedClosureTypeDefinitions[encodedName];
        if (existingSpecializedClosureTypeDefinition == null) {
          const closureTypeDefinition = checkNotNull(
            this.originalClosureTypeDefinitions[concreteType.name],
            `Missing ${concreteType.name}`
          );
          const solvedTypeArgumentsReplacementMap = Object.fromEntries(
            zip(
              closureTypeDefinition.typeParameters,
              solveTypeArguments(
                closureTypeDefinition.typeParameters,
                concreteType,
                HIR_IDENTIFIER_TYPE(
                  concreteType.name,
                  closureTypeDefinition.typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
                ),
                this.resolveIdentifierType
              )
            )
          );
          this.specializedClosureTypeDefinitions[encodedName] = closureTypeDefinition;
          const rewrittenFunctionType = this.rewriteType(
            highIRTypeApplication(
              closureTypeDefinition.functionType,
              solvedTypeArgumentsReplacementMap
            ),
            {}
          );
          assert(rewrittenFunctionType.__type__ === 'FunctionType');
          this.specializedClosureTypeDefinitions[encodedName] = {
            identifier: encodedName,
            typeParameters: [],
            functionType: rewrittenFunctionType,
          };
        }
        return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(encodedName);
      }
      const solvedTypeArgumentsReplacementMap = Object.fromEntries(
        zip(
          typeDefinition.typeParameters,
          solveTypeArguments(
            typeDefinition.typeParameters,
            concreteType,
            HIR_IDENTIFIER_TYPE(
              concreteType.name,
              typeDefinition.typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
            ),
            this.resolveIdentifierType
          )
        )
      );
      this.specializedTypeDefinitions[encodedName] = typeDefinition;
      this.specializedTypeDefinitions[encodedName] = {
        identifier: encodedName,
        typeParameters: [],
        type: typeDefinition.type,
        mappings: typeDefinition.mappings.map((it) =>
          this.rewriteType(highIRTypeApplication(it, solvedTypeArgumentsReplacementMap), {})
        ),
      };
    }
    return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(encodedName);
  }

  private resolveIdentifierType = (identifierType: HighIRIdentifierType): readonly HighIRType[] =>
    resolveIdentifierTypeMappings(
      identifierType,
      (name) =>
        this.specializedClosureTypeDefinitions[name] ?? this.originalClosureTypeDefinitions[name],
      (name) => this.specializedTypeDefinitions[name] ?? this.originalTypeDefinitions[name]
    );
}

export default function performGenericsSpecializationOnHighIRSources(
  sources: HighIRSources
): HighIRSources {
  const rewriter = new GenericsSpecializationRewriter(sources);
  return {
    globalVariables: sources.globalVariables.filter((it) => rewriter.usedStringNames.has(it.name)),
    closureTypes: Object.values(rewriter.specializedClosureTypeDefinitions),
    typeDefinitions: Object.values(rewriter.specializedTypeDefinitions),
    mainFunctionNames: sources.mainFunctionNames,
    functions: Object.values(rewriter.specializedFunctions),
  };
}
