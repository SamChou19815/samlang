import {
  HighIRClosureTypeDefinition,
  HighIRExpression,
  HighIRFunction,
  HighIRFunctionNameExpression,
  HighIRFunctionType,
  HighIRIdentifierType,
  HighIRSources,
  HighIRStatement,
  HighIRType,
  HighIRTypeDefinition,
  HIR_BINARY,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_NAME,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_STRUCT_INITIALIZATION,
} from '../ast/hir-nodes';
import { assert, checkNotNull, zip } from '../utils';
import {
  encodeHighIRNameAfterGenericsSpecialization,
  highIRTypeApplication,
  solveTypeArguments,
} from './hir-type-conversion';

class GenericsSpecializationRewriter {
  private readonly originalClosureTypeDefinitions: ReadonlyMap<string, HighIRClosureTypeDefinition>;
  private readonly originalTypeDefinitions: ReadonlyMap<string, HighIRTypeDefinition>;
  private readonly originalFunctions: ReadonlyMap<string, HighIRFunction>;

  private readonly specializedHighIRIdentifierTypeMapping = new Map<string, string>();

  public readonly usedStringNames = new Set<string>();
  public readonly specializedClosureTypeDefinitions = new Map<
    string,
    HighIRClosureTypeDefinition
  >();
  public readonly specializedTypeDefinitions = new Map<string, HighIRTypeDefinition>();
  public readonly specializedFunctions = new Map<string, HighIRFunction>();

  constructor(sources: HighIRSources) {
    this.originalClosureTypeDefinitions = new Map(
      sources.closureTypes.map((it) => [it.identifier, it]),
    );
    this.originalTypeDefinitions = new Map(
      sources.typeDefinitions.map((it) => [it.identifier, it]),
    );
    this.originalFunctions = new Map(sources.functions.map((it) => [it.name, it]));
    sources.mainFunctionNames.forEach((mainFunctionName) => {
      this.specializedFunctions.set(
        mainFunctionName,
        this.rewriteFunction(
          checkNotNull(this.originalFunctions.get(mainFunctionName), `Missing ${mainFunctionName}`),
          new Map(),
        ),
      );
    });
  }

  private rewriteFunction = (
    highIRFunction: HighIRFunction,
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
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
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
  ): HighIRStatement {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        return HIR_INDEX_ACCESS({
          name: statement.name,
          type: this.rewriteType(statement.type, genericsReplacementMap),
          pointerExpression: this.rewriteExpression(
            statement.pointerExpression,
            genericsReplacementMap,
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
          genericsReplacementMap,
        );
        assert(
          functionExpression.__type__ === 'HighIRFunctionNameExpression' ||
            functionExpression.__type__ === 'HighIRVariableExpression',
        );
        return HIR_FUNCTION_CALL({
          functionExpression,
          functionArguments: statement.functionArguments.map((it) =>
            this.rewriteExpression(it, genericsReplacementMap),
          ),
          returnType: this.rewriteType(statement.returnType, genericsReplacementMap),
          returnCollector: statement.returnCollector,
        });
      }
      case 'HighIRIfElseStatement':
        return HIR_IF_ELSE({
          booleanExpression: this.rewriteExpression(
            statement.booleanExpression,
            genericsReplacementMap,
          ),
          s1: statement.s1.map((it) => this.rewriteStatement(it, genericsReplacementMap)),
          s2: statement.s2.map((it) => this.rewriteStatement(it, genericsReplacementMap)),
          finalAssignments: statement.finalAssignments.map(
            ({ name, type, branch1Value, branch2Value }) => ({
              name,
              type: this.rewriteType(type, genericsReplacementMap),
              branch1Value: this.rewriteExpression(branch1Value, genericsReplacementMap),
              branch2Value: this.rewriteExpression(branch2Value, genericsReplacementMap),
            }),
          ),
        });
      case 'HighIRSingleIfStatement':
      case 'HighIRBreakStatement':
      case 'HighIRWhileStatement':
        throw new Error(`${statement.__type__} should not appear before tailrec optimization.`);
      case 'HighIRStructInitializationStatement': {
        const type = this.rewriteType(statement.type, genericsReplacementMap);
        assert(type.__type__ === 'IdentifierType');
        return HIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type,
          expressionList: statement.expressionList.map((it) =>
            this.rewriteExpression(it, genericsReplacementMap),
          ),
        });
      }
      case 'HighIRClosureInitializationStatement': {
        const closureType = this.rewriteType(statement.closureType, genericsReplacementMap);
        assert(closureType.__type__ === 'IdentifierType');
        return HIR_CLOSURE_INITIALIZATION({
          closureVariableName: statement.closureVariableName,
          closureType,
          functionName: this.rewriteExpression(
            statement.functionName,
            genericsReplacementMap,
          ) as HighIRFunctionNameExpression,
          context: this.rewriteExpression(statement.context, genericsReplacementMap),
        });
      }
    }
  }

  private rewriteExpression(
    expression: HighIRExpression,
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
  ): HighIRExpression {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return expression;
      case 'HighIRVariableExpression':
        return { ...expression, type: this.rewriteType(expression.type, genericsReplacementMap) };
      case 'HighIRStringNameExpression':
        this.usedStringNames.add(expression.name);
        return expression;
      case 'HighIRFunctionNameExpression': {
        const functionType = HIR_FUNCTION_TYPE(
          expression.type.argumentTypes.map((it) => this.rewriteType(it, genericsReplacementMap)),
          this.rewriteType(expression.type.returnType, genericsReplacementMap),
        );
        const rewrittenName = this.rewriteFunctionName(
          expression.name,
          functionType,
          expression.typeArguments.map((it) => this.rewriteType(it, genericsReplacementMap)),
          genericsReplacementMap,
        );
        // After specialization, there should be no more type arguments.
        return HIR_FUNCTION_NAME(rewrittenName, functionType, []);
      }
    }
  }

  private rewriteFunctionName(
    originalName: string,
    functionType: HighIRFunctionType,
    functionTypeArguments: readonly HighIRType[],
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
  ): string {
    if (originalName.startsWith('$GENERICS$_')) {
      const [genericClassName, functionName] = originalName.slice('$GENERICS$_'.length).split('$');
      const replacementClass = checkNotNull(
        genericsReplacementMap.get(checkNotNull(genericClassName)),
      );
      assert(replacementClass.__type__ === 'IdentifierType');
      assert(functionName != null);
      const replacementClassType = checkNotNull(
        this.specializedHighIRIdentifierTypeMapping.get(replacementClass.name),
      );
      const rewrittenFunctionName = `_${replacementClassType}$${functionName}`;
      return this.rewriteFunctionName(
        rewrittenFunctionName,
        functionType,
        functionTypeArguments,
        genericsReplacementMap,
      );
    }
    const existingFunction = this.originalFunctions.get(originalName);
    if (existingFunction == null) return originalName;
    const encodedSpecializedFunctionName = encodeHighIRNameAfterGenericsSpecialization(
      originalName,
      functionTypeArguments,
    );
    if (!this.specializedFunctions.has(encodedSpecializedFunctionName)) {
      // Temporaily add an incorrect version to avoid infinite recursion.
      this.specializedFunctions.set(encodedSpecializedFunctionName, existingFunction);
      this.specializedFunctions.set(
        encodedSpecializedFunctionName,
        this.rewriteFunction(
          {
            name: encodedSpecializedFunctionName,
            parameters: existingFunction.parameters,
            typeParameters: [],
            type: functionType,
            body: existingFunction.body,
            returnValue: existingFunction.returnValue,
          },
          new Map(zip(existingFunction.typeParameters, functionTypeArguments)),
        ),
      );
    }
    return encodedSpecializedFunctionName;
  }

  private rewriteType(
    type: HighIRType,
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
  ): HighIRType {
    switch (type.__type__) {
      case 'PrimitiveType':
        return type;
      case 'FunctionType':
        return HIR_FUNCTION_TYPE(
          type.argumentTypes.map((it) => this.rewriteType(it, genericsReplacementMap)),
          this.rewriteType(type.returnType, genericsReplacementMap),
        );
      case 'IdentifierType':
        return this.rewriteHighIRIdentifierType(type, genericsReplacementMap);
    }
  }

  private rewriteHighIRIdentifierType(
    type: HighIRIdentifierType,
    genericsReplacementMap: ReadonlyMap<string, HighIRType>,
  ): HighIRType {
    if (type.typeArguments.length === 0) {
      const replacement = genericsReplacementMap.get(type.name);
      if (replacement != null) return replacement;
    }
    const concreteType = {
      ...type,
      typeArguments: type.typeArguments.map((it) => this.rewriteType(it, genericsReplacementMap)),
    };
    const encodedName = encodeHighIRNameAfterGenericsSpecialization(
      concreteType.name,
      concreteType.typeArguments,
    );
    const existingSpecializedTypeDefinition = this.specializedTypeDefinitions.get(encodedName);
    if (existingSpecializedTypeDefinition == null) {
      const typeDefinition = this.originalTypeDefinitions.get(concreteType.name);
      if (typeDefinition == null) {
        const existingSpecializedClosureTypeDefinition =
          this.specializedClosureTypeDefinitions.get(encodedName);
        if (existingSpecializedClosureTypeDefinition == null) {
          const closureTypeDefinition = checkNotNull(
            this.originalClosureTypeDefinitions.get(concreteType.name),
            `Missing ${concreteType.name}`,
          );
          const solvedTypeArgumentsReplacementMap = new Map(
            zip(
              closureTypeDefinition.typeParameters,
              solveTypeArguments(
                closureTypeDefinition.typeParameters,
                concreteType,
                HIR_IDENTIFIER_TYPE(
                  concreteType.name,
                  closureTypeDefinition.typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS),
                ),
              ),
            ),
          );
          this.specializedClosureTypeDefinitions.set(encodedName, closureTypeDefinition);
          const rewrittenFunctionType = this.rewriteType(
            highIRTypeApplication(
              closureTypeDefinition.functionType,
              solvedTypeArgumentsReplacementMap,
            ),
            new Map(),
          );
          assert(rewrittenFunctionType.__type__ === 'FunctionType');
          this.specializedClosureTypeDefinitions.set(encodedName, {
            identifier: encodedName,
            typeParameters: [],
            functionType: rewrittenFunctionType,
          });
        }
        this.specializedHighIRIdentifierTypeMapping.set(encodedName, type.name);
        return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(encodedName);
      }
      const solvedTypeArgumentsReplacementMap = new Map(
        zip(
          typeDefinition.typeParameters,
          solveTypeArguments(
            typeDefinition.typeParameters,
            concreteType,
            HIR_IDENTIFIER_TYPE(
              concreteType.name,
              typeDefinition.typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS),
            ),
          ),
        ),
      );
      this.specializedTypeDefinitions.set(encodedName, typeDefinition);
      this.specializedTypeDefinitions.set(encodedName, {
        identifier: encodedName,
        typeParameters: [],
        type: typeDefinition.type,
        names: typeDefinition.names,
        mappings: typeDefinition.mappings.map((it) =>
          this.rewriteType(highIRTypeApplication(it, solvedTypeArgumentsReplacementMap), new Map()),
        ),
      });
    }
    this.specializedHighIRIdentifierTypeMapping.set(encodedName, type.name);
    return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(encodedName);
  }
}

export default function performGenericsSpecializationOnHighIRSources(
  sources: HighIRSources,
): HighIRSources {
  const rewriter = new GenericsSpecializationRewriter(sources);
  return {
    globalVariables: sources.globalVariables.filter((it) => rewriter.usedStringNames.has(it.name)),
    closureTypes: Array.from(rewriter.specializedClosureTypeDefinitions.values()),
    typeDefinitions: Array.from(rewriter.specializedTypeDefinitions.values()),
    mainFunctionNames: sources.mainFunctionNames,
    functions: Array.from(rewriter.specializedFunctions.values()),
  };
}
