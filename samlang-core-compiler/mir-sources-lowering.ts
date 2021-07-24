import type {
  HighIRType,
  HighIRFunctionType,
  HighIRTypeDefinition,
  HighIRExpression,
  HighIRStatement,
  HighIRFunction,
  HighIRSources,
} from 'samlang-core-ast/hir-nodes';
import {
  MidIRType,
  MidIRFunctionType,
  MidIRTypeDefinition,
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRSources,
  MIR_ANY_TYPE,
  MIR_INT_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_NAME,
  MIR_BINARY,
  MIR_INDEX_ACCESS,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  isTheSameMidIRType,
} from 'samlang-core-ast/mir-nodes';
import { optimizeMidIRSourcesByTailRecursionRewrite } from 'samlang-core-optimization';
import { assert } from 'samlang-core-utils';

function lowerHighIRType(type: HighIRType): MidIRType {
  switch (type.__type__) {
    case 'PrimitiveType':
      return type;
    case 'IdentifierType':
      assert(type.typeArguments.length === 0);
      return MIR_IDENTIFIER_TYPE(type.name);
    case 'FunctionType':
      return lowerHighIRFunctionType(type);
  }
}

const lowerHighIRFunctionType = (type: HighIRFunctionType): MidIRFunctionType =>
  MIR_FUNCTION_TYPE(type.argumentTypes.map(lowerHighIRType), lowerHighIRType(type.returnType));

function lowerHighIRExpression(expression: HighIRExpression): MidIRExpression {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return MIR_INT(expression.value);
    case 'HighIRVariableExpression':
      return MIR_VARIABLE(expression.name, lowerHighIRType(expression.type));
    case 'HighIRNameExpression':
      return MIR_NAME(expression.name, lowerHighIRType(expression.type));
  }
}

class HighIRToMidIRLoweringManager {
  constructor(
    private readonly closureTypeDefinitions: Readonly<Record<string, MidIRFunctionType>>,
    private readonly typeDefinitions: Readonly<Record<string, HighIRTypeDefinition>>
  ) {}

  private tempId = 0;

  private tempAllocator(): string {
    const name = `_mid_t${this.tempId}`;
    this.tempId += 1;
    return name;
  }

  public lowerHighIRFunction({
    name,
    parameters,
    typeParameters,
    type,
    body,
    returnValue,
  }: HighIRFunction): MidIRFunction {
    assert(typeParameters.length === 0);
    return {
      name,
      parameters,
      type: lowerHighIRFunctionType(type),
      body: body.flatMap(this.lowerHighIRStatement),
      returnValue: lowerHighIRExpression(returnValue),
    };
  }

  private lowerHighIRStatement = (statement: HighIRStatement): readonly MidIRStatement[] => {
    switch (statement.__type__) {
      case 'HighIRBinaryStatement':
        return [
          MIR_BINARY({
            name: statement.name,
            operator: statement.operator,
            e1: lowerHighIRExpression(statement.e1),
            e2: lowerHighIRExpression(statement.e2),
          }),
        ];
      case 'HighIRIndexAccessStatement': {
        const pointerExpression = lowerHighIRExpression(statement.pointerExpression);
        const { name, index } = statement;
        const pointerType = pointerExpression.type;
        assert(pointerType.__type__ === 'IdentifierType');
        const variableType = lowerHighIRType(statement.type);
        const typeDefinition = this.typeDefinitions[pointerType.name];
        assert(typeDefinition != null, `Missing ${pointerType.name}`);
        if (typeDefinition.type === 'object') {
          return [MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index })];
        }
        assert(index === 0 || index === 1, `Invalid index for variant access: ${index}`);
        switch (index) {
          case 0:
            // Access the tag case
            assert(variableType.__type__ === 'PrimitiveType' && variableType.type === 'int');
            return [MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index })];
          case 1: {
            // Access the data case, might need cast
            if (isTheSameMidIRType(variableType, MIR_ANY_TYPE)) {
              return [MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index })];
            }
            const temp = this.tempAllocator();
            return [
              MIR_INDEX_ACCESS({ name: temp, type: MIR_ANY_TYPE, pointerExpression, index }),
              MIR_CAST({
                name,
                type: variableType,
                assignedExpression: MIR_VARIABLE(temp, MIR_ANY_TYPE),
              }),
            ];
          }
        }
      }
      case 'HighIRFunctionCallStatement':
        if (statement.functionExpression.__type__ === 'HighIRNameExpression') {
          return [
            MIR_FUNCTION_CALL({
              functionExpression: lowerHighIRExpression(statement.functionExpression),
              functionArguments: statement.functionArguments.map(lowerHighIRExpression),
              returnType: lowerHighIRType(statement.returnType),
              returnCollector: statement.returnCollector,
            }),
          ];
        } else {
          const closureHighIRType = statement.functionExpression.type;
          assert(
            closureHighIRType.__type__ === 'IdentifierType' &&
              closureHighIRType.typeArguments.length === 0
          );
          const functionType = this.closureTypeDefinitions[closureHighIRType.name];
          assert(functionType != null, `Missing ${closureHighIRType.name}`);
          const pointerExpression = lowerHighIRExpression(statement.functionExpression);
          // TODO(closure)
          const tempFunction = this.tempAllocator();
          const tempContext = this.tempAllocator();
          return [
            MIR_INDEX_ACCESS({
              name: tempFunction,
              type: functionType,
              pointerExpression,
              index: 0,
            }),
            MIR_INDEX_ACCESS({
              name: tempContext,
              type: MIR_ANY_TYPE,
              pointerExpression,
              index: 1,
            }),
            // TODO(ref-counting)
            MIR_FUNCTION_CALL({
              functionExpression: MIR_VARIABLE(tempFunction, functionType),
              functionArguments: [
                MIR_VARIABLE(tempContext, MIR_ANY_TYPE),
                ...statement.functionArguments.map(lowerHighIRExpression),
              ],
              returnType: lowerHighIRType(statement.returnType),
              returnCollector: statement.returnCollector,
            }),
          ];
        }
      case 'HighIRIfElseStatement':
        return [
          MIR_IF_ELSE({
            booleanExpression: lowerHighIRExpression(statement.booleanExpression),
            s1: statement.s1.flatMap(this.lowerHighIRStatement),
            s2: statement.s2.flatMap(this.lowerHighIRStatement),
            finalAssignments: statement.finalAssignments.map(
              ({ name, type, branch1Value, branch2Value }) => ({
                name,
                type: lowerHighIRType(type),
                branch1Value: lowerHighIRExpression(branch1Value),
                branch2Value: lowerHighIRExpression(branch2Value),
              })
            ),
          }),
        ];
      case 'HighIRStructInitializationStatement': {
        const structVariableName = statement.structVariableName;
        const type = lowerHighIRType(statement.type);
        const typeDefinition = this.typeDefinitions[statement.type.name];
        assert(typeDefinition != null, `Missing typedef ${statement.type.name}`);
        const statements: MidIRStatement[] = [];
        const expressionList =
          typeDefinition.type === 'object'
            ? statement.expressionList.map(lowerHighIRExpression)
            : statement.expressionList.map((expression, index) => {
                const lowered = lowerHighIRExpression(expression);
                assert(index === 0 || index === 1, `Invalid index for variant access: ${index}`);
                if (index === 0) return lowered;
                if (isTheSameMidIRType(lowered.type, MIR_ANY_TYPE)) return lowered;
                const temp = this.tempAllocator();
                statements.push(
                  MIR_CAST({ name: temp, type: MIR_ANY_TYPE, assignedExpression: lowered })
                );
                return MIR_VARIABLE(temp, MIR_ANY_TYPE);
              });
        // TODO(ref-counting): increasing ref count
        statements.push(MIR_STRUCT_INITIALIZATION({ structVariableName, type, expressionList }));
        return statements;
      }
      case 'HighIRClosureInitializationStatement': {
        const closureType = lowerHighIRType(statement.closureType);
        const originalFunctionType = lowerHighIRFunctionType(statement.functionType);
        const typeErasedClosureType = MIR_FUNCTION_TYPE(
          [MIR_ANY_TYPE, ...originalFunctionType.argumentTypes.slice(1)],
          originalFunctionType.returnType
        );
        const functionName = MIR_NAME(statement.functionName, originalFunctionType);
        const context = lowerHighIRExpression(statement.context);
        const statements: MidIRStatement[] = [];
        let functionNameSlot: MidIRExpression;
        let contextSlot: MidIRExpression;
        if (isTheSameMidIRType(originalFunctionType, typeErasedClosureType)) {
          functionNameSlot = functionName;
        } else {
          const temp = this.tempAllocator();
          statements.push(
            MIR_CAST({ name: temp, type: typeErasedClosureType, assignedExpression: functionName })
          );
          functionNameSlot = MIR_VARIABLE(temp, typeErasedClosureType);
        }
        if (isTheSameMidIRType(context.type, MIR_ANY_TYPE)) {
          contextSlot = context;
        } else {
          const temp = this.tempAllocator();
          statements.push(
            MIR_CAST({ name: temp, type: MIR_ANY_TYPE, assignedExpression: context })
          );
          contextSlot = MIR_VARIABLE(temp, MIR_ANY_TYPE);
        }
        statements.push(
          MIR_STRUCT_INITIALIZATION({
            structVariableName: statement.closureVariableName,
            type: closureType,
            expressionList: [
              functionNameSlot,
              contextSlot,
              // TODO(ref-counting): add destructor for context
            ],
          })
        );
        return statements;
      }
    }
  };
}

export default function lowerHighIRSourcesToMidIRSources(sources: HighIRSources): MidIRSources {
  const typeDefinitions: MidIRTypeDefinition[] = [];
  const closureTypeDefinitionMapForLowering = Object.fromEntries(
    sources.closureTypes.map((it) => {
      assert(it.typeParameters.length === 0);
      // TODO(ref-counting)
      const functionTypeWithoutContextArgument = lowerHighIRFunctionType(it.functionType);
      const functionType = MIR_FUNCTION_TYPE(
        [MIR_ANY_TYPE, ...functionTypeWithoutContextArgument.argumentTypes],
        functionTypeWithoutContextArgument.returnType
      );
      typeDefinitions.push({ identifier: it.identifier, mappings: [functionType, MIR_ANY_TYPE] });
      return [it.identifier, functionType];
    })
  );
  const typeDefinitionMapForLowering = Object.fromEntries(
    // TODO(ref-counting)
    sources.typeDefinitions.map((it) => {
      typeDefinitions.push({
        identifier: it.identifier,
        mappings:
          it.type === 'object' ? it.mappings.map(lowerHighIRType) : [MIR_INT_TYPE, MIR_ANY_TYPE],
      });
      return [it.identifier, it];
    })
  );
  const functions = sources.functions.map((highIRFunction) =>
    new HighIRToMidIRLoweringManager(
      closureTypeDefinitionMapForLowering,
      typeDefinitionMapForLowering
    ).lowerHighIRFunction(highIRFunction)
  );
  return optimizeMidIRSourcesByTailRecursionRewrite({
    globalVariables: sources.globalVariables,
    typeDefinitions,
    mainFunctionNames: sources.mainFunctionNames,
    functions,
  });
}
