import {
  HighIRClosureTypeDefinition,
  HighIRExpression,
  HighIRFunction,
  HighIRSources,
  HighIRStatement,
  HighIRType,
  HighIRTypeDefinition,
  HIR_BINARY,
  HIR_CLOSURE_INITIALIZATION,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_NAME,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_STRUCT_INITIALIZATION,
  prettyPrintHighIRType,
} from '../ast/hir-nodes';
import { assert } from '../utils';

class HighIRTypeDeduplicator {
  private readonly closureTypeDefinitionCanonicalNameMapping = new Map<string, string>();
  private readonly typeDefinitionCanonicalNameMapping = new Map<string, string>();

  private readonly closureTypeDefinitionMapping = new Map<string, HighIRClosureTypeDefinition>();
  private readonly typeDefinitionMapping = new Map<string, HighIRTypeDefinition>();

  constructor(private readonly sources: HighIRSources) {
    sources.closureTypes.forEach((closureType) => {
      assert(closureType.typeParameters.length === 0);
      const key = prettyPrintHighIRType(closureType.functionType);
      let canonicalName = this.closureTypeDefinitionMapping.get(key)?.identifier;
      if (canonicalName == null) {
        canonicalName = closureType.identifier;
        this.closureTypeDefinitionMapping.set(key, closureType);
      }
      this.closureTypeDefinitionCanonicalNameMapping.set(closureType.identifier, canonicalName);
    });
    sources.typeDefinitions.forEach((typeDefinition) => {
      assert(typeDefinition.typeParameters.length === 0);
      const key = `${typeDefinition.type}_${typeDefinition.mappings
        .map(prettyPrintHighIRType)
        .join('_')}`;
      let canonicalName = this.typeDefinitionMapping.get(key)?.identifier;
      if (canonicalName == null) {
        canonicalName = typeDefinition.identifier;
        this.typeDefinitionMapping.set(key, typeDefinition);
      }
      this.typeDefinitionCanonicalNameMapping.set(typeDefinition.identifier, canonicalName);
    });
  }

  rewrite(): HighIRSources {
    const { globalVariables, mainFunctionNames, functions } = this.sources;
    return {
      globalVariables,
      closureTypes: Array.from(this.closureTypeDefinitionMapping.values()).map(
        ({ identifier, typeParameters, functionType }) => ({
          identifier,
          typeParameters,
          functionType: HIR_FUNCTION_TYPE(
            functionType.argumentTypes.map(this.rewriteType),
            this.rewriteType(functionType.returnType),
          ),
        }),
      ),
      typeDefinitions: Array.from(this.typeDefinitionMapping.values()).map(
        ({ identifier, type, typeParameters, names, mappings }) => ({
          identifier,
          type,
          typeParameters,
          names,
          mappings: mappings.map(this.rewriteType),
        }),
      ),
      mainFunctionNames,
      functions: functions.map(this.rewriteFunction),
    };
  }

  private rewriteFunction = ({
    name,
    parameters,
    typeParameters,
    type,
    body,
    returnValue,
  }: HighIRFunction): HighIRFunction => {
    assert(typeParameters.length === 0);
    const rewrittenType = this.rewriteType(type);
    assert(rewrittenType.__type__ === 'FunctionType');
    return {
      name,
      parameters,
      typeParameters,
      type: rewrittenType,
      body: body.map(this.rewriteStatement),
      returnValue: this.rewriteExpression(returnValue),
    };
  };

  private rewriteStatement = (statement: HighIRStatement): HighIRStatement => {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        return HIR_INDEX_ACCESS({
          name: statement.name,
          type: this.rewriteType(statement.type),
          pointerExpression: this.rewriteExpression(statement.pointerExpression),
          index: statement.index,
        });
      case 'HighIRBinaryStatement':
        return HIR_BINARY({
          name: statement.name,
          operator: statement.operator,
          e1: this.rewriteExpression(statement.e1),
          e2: this.rewriteExpression(statement.e2),
        });
      case 'HighIRFunctionCallStatement': {
        const functionExpression = this.rewriteExpression(statement.functionExpression);
        assert(
          functionExpression.__type__ === 'HighIRFunctionNameExpression' ||
            functionExpression.__type__ === 'HighIRVariableExpression',
        );
        return HIR_FUNCTION_CALL({
          functionExpression,
          typeArguments: statement.typeArguments.map(this.rewriteType),
          functionArguments: statement.functionArguments.map(this.rewriteExpression),
          returnType: this.rewriteType(statement.returnType),
          returnCollector: statement.returnCollector,
        });
      }
      case 'HighIRIfElseStatement':
        return HIR_IF_ELSE({
          booleanExpression: this.rewriteExpression(statement.booleanExpression),
          s1: statement.s1.map(this.rewriteStatement),
          s2: statement.s2.map(this.rewriteStatement),
          finalAssignments: statement.finalAssignments.map(
            ({ name, type, branch1Value, branch2Value }) => ({
              name,
              type: this.rewriteType(type),
              branch1Value: this.rewriteExpression(branch1Value),
              branch2Value: this.rewriteExpression(branch2Value),
            }),
          ),
        });
      case 'HighIRSingleIfStatement':
      case 'HighIRBreakStatement':
      case 'HighIRWhileStatement':
        throw new Error(`${statement.__type__} should not appear before tailrec optimization.`);
      case 'HighIRStructInitializationStatement': {
        const type = this.rewriteType(statement.type);
        assert(type.__type__ === 'IdentifierType');
        return HIR_STRUCT_INITIALIZATION({
          structVariableName: statement.structVariableName,
          type,
          expressionList: statement.expressionList.map(this.rewriteExpression),
        });
      }
      case 'HighIRClosureInitializationStatement': {
        const closureType = this.rewriteType(statement.closureType);
        assert(closureType.__type__ === 'IdentifierType');
        const functionType = this.rewriteType(statement.functionType);
        assert(functionType.__type__ === 'FunctionType');
        return HIR_CLOSURE_INITIALIZATION({
          closureVariableName: statement.closureVariableName,
          closureType,
          functionName: statement.functionName,
          functionType,
          context: this.rewriteExpression(statement.context),
        });
      }
    }
  };

  private rewriteExpression = (expression: HighIRExpression): HighIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return expression;
      case 'HighIRVariableExpression':
        return { ...expression, type: this.rewriteType(expression.type) };
      case 'HighIRStringNameExpression':
        return expression;
      case 'HighIRFunctionNameExpression': {
        const type = this.rewriteType(expression.type);
        assert(type.__type__ === 'FunctionType');
        return HIR_FUNCTION_NAME(expression.name, type);
      }
    }
  };

  private rewriteType = (type: HighIRType): HighIRType => {
    switch (type.__type__) {
      case 'PrimitiveType':
        return type;
      case 'IdentifierType': {
        assert(type.typeArguments.length === 0);
        const name =
          this.closureTypeDefinitionCanonicalNameMapping.get(type.name) ??
          this.typeDefinitionCanonicalNameMapping.get(type.name) ??
          type.name;
        return HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS(name);
      }
      case 'FunctionType':
        return HIR_FUNCTION_TYPE(
          type.argumentTypes.map(this.rewriteType),
          this.rewriteType(type.returnType),
        );
    }
  };
}

export default function deduplicateHighIRTypes(sources: HighIRSources): HighIRSources {
  return new HighIRTypeDeduplicator(sources).rewrite();
}
