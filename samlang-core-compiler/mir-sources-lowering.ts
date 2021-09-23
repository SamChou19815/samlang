import { ENCODED_FUNCTION_NAME_FREE } from 'samlang-core-ast/common-names';
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
  MidIRVariableExpression,
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRSources,
  isTheSameMidIRType,
  MIR_ANY_TYPE,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
  MIR_STRING_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_VARIABLE,
  MIR_NAME,
  MIR_BINARY,
  MIR_INDEX_ACCESS,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_INC_REF,
  MIR_DEC_REF,
} from 'samlang-core-ast/mir-nodes';
import { assert, checkNotNull, filterMap } from 'samlang-core-utils';

import optimizeMidIRSourcesByEliminatingUnusedOnes from './mir-unused-name-elimination';

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

const unknownMemberDestructorType = MIR_FUNCTION_TYPE([MIR_ANY_TYPE], MIR_INT_TYPE);

const referenceTypeName = (type: MidIRType): string | null =>
  type.__type__ === 'IdentifierType'
    ? type.name
    : type.__type__ === 'PrimitiveType' && type.type === 'string'
    ? 'string'
    : null;

const lowerHighIRFunctionType = (type: HighIRFunctionType): MidIRFunctionType =>
  MIR_FUNCTION_TYPE(type.argumentTypes.map(lowerHighIRType), lowerHighIRType(type.returnType));

function lowerHighIRExpression(expression: HighIRExpression): MidIRExpression {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return {
        __type__: 'MidIRIntLiteralExpression',
        type: lowerHighIRType(expression.type),
        value: expression.value,
      };
    case 'HighIRVariableExpression':
      return MIR_VARIABLE(expression.name, lowerHighIRType(expression.type));
    case 'HighIRNameExpression':
      return MIR_NAME(expression.name, lowerHighIRType(expression.type));
  }
}

const decRefFunctionName = (name: string) => `__decRef_${name}`;

const defRefFunctionArgumentType = (typeName: string) =>
  typeName === 'string' ? MIR_STRING_TYPE : MIR_IDENTIFIER_TYPE(typeName);

const variableOfMidIRExpression = (expression: MidIRExpression): string | null =>
  expression.__type__ === 'MidIRVariableExpression' ? expression.name : null;

function generateSingleDestructorFunction(
  typeName: string,
  getDestructMemberStatements: (
    parameter: MidIRVariableExpression,
    destructMemberStatements: MidIRStatement[]
  ) => void
): MidIRFunction {
  const parameter = MIR_VARIABLE('o', defRefFunctionArgumentType(typeName));
  const destructMemberStatements: MidIRStatement[] = [];
  getDestructMemberStatements(parameter, destructMemberStatements);
  destructMemberStatements.push(
    ...(isTheSameMidIRType(parameter.type, MIR_ANY_TYPE)
      ? [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_FREE, unknownMemberDestructorType),
            functionArguments: [parameter],
            returnType: MIR_INT_TYPE,
          }),
        ]
      : [
          MIR_CAST({
            name: `pointer_casted`,
            type: MIR_ANY_TYPE,
            assignedExpression: parameter,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_FREE, unknownMemberDestructorType),
            functionArguments: [MIR_VARIABLE('pointer_casted', MIR_ANY_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
        ])
  );
  if (typeName !== 'string') {
    return {
      name: decRefFunctionName(typeName),
      parameters: [parameter.name],
      type: MIR_FUNCTION_TYPE([parameter.type], MIR_INT_TYPE),
      body: [
        /* currentRefCount = parameter[0] */ MIR_INDEX_ACCESS({
          name: 'currentRefCount',
          type: MIR_INT_TYPE,
          pointerExpression: parameter,
          index: 0,
        }),
        /* parameter[0] -= 1 */ MIR_DEC_REF(parameter),
        /* dead = currentRefCount <= 1 */ MIR_BINARY({
          name: 'dead',
          operator: '<=',
          e1: MIR_VARIABLE('currentRefCount', MIR_INT_TYPE),
          e2: MIR_ONE,
        }),
        /* if (dead) destructMemberStatements; */ MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('dead', MIR_BOOL_TYPE),
          invertCondition: false,
          statements: destructMemberStatements,
        }),
      ],
      returnValue: MIR_ZERO,
    };
  }
  return {
    name: decRefFunctionName(typeName),
    parameters: [parameter.name],
    type: MIR_FUNCTION_TYPE([parameter.type], MIR_INT_TYPE),
    body: [
      /* currentRefCount = parameter[0] */ MIR_INDEX_ACCESS({
        name: 'currentRefCount',
        type: MIR_INT_TYPE,
        pointerExpression: parameter,
        index: 0,
      }),
      /* performGC = currentRefCount > 0 */ MIR_BINARY({
        name: 'performGC',
        operator: '>',
        e1: MIR_VARIABLE('currentRefCount', MIR_INT_TYPE),
        e2: MIR_ZERO,
      }),
      MIR_SINGLE_IF({
        booleanExpression: MIR_VARIABLE('performGC', MIR_BOOL_TYPE),
        invertCondition: false,
        statements: [
          /* parameter[0] -= 1 */ MIR_DEC_REF(parameter),
          /* dead = currentRefCount <= 1 */ MIR_BINARY({
            name: 'dead',
            operator: '<=',
            e1: MIR_VARIABLE('currentRefCount', MIR_INT_TYPE),
            e2: MIR_ONE,
          }),
          /* if (dead) destructMemberStatements; */ MIR_SINGLE_IF({
            booleanExpression: MIR_VARIABLE('dead', MIR_BOOL_TYPE),
            invertCondition: false,
            statements: destructMemberStatements,
          }),
        ],
      }),
    ],
    returnValue: MIR_ZERO,
  };
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

  public generateDestructorFunctions(): readonly MidIRFunction[] {
    const functions: MidIRFunction[] = [];

    Object.values(this.typeDefinitions).forEach((typeDefinition) => {
      functions.push(
        generateSingleDestructorFunction(
          typeDefinition.identifier,
          (pointerExpression, destructMemberStatements) => {
            if (typeDefinition.type === 'object') {
              typeDefinition.mappings.forEach((type, index) => {
                const typeName = referenceTypeName(type);
                if (!typeName) return;
                const loweredType = lowerHighIRType(type);
                destructMemberStatements.push(
                  MIR_INDEX_ACCESS({
                    name: `v${index}`,
                    type: loweredType,
                    pointerExpression,
                    index: index + 1,
                  }),
                  MIR_FUNCTION_CALL({
                    functionExpression: MIR_NAME(
                      decRefFunctionName(typeName),
                      MIR_FUNCTION_TYPE([defRefFunctionArgumentType(typeName)], MIR_INT_TYPE)
                    ),
                    functionArguments: [MIR_VARIABLE(`v${index}`, loweredType)],
                    returnType: MIR_INT_TYPE,
                  })
                );
              });
            } else {
              if (typeDefinition.mappings.some((type) => Boolean(referenceTypeName(type)))) {
                destructMemberStatements.push(
                  MIR_INDEX_ACCESS({ name: 'tag', type: MIR_INT_TYPE, pointerExpression, index: 1 })
                );
              }
              typeDefinition.mappings.forEach((type, index) => {
                const typeName = referenceTypeName(type);
                if (!typeName) return;
                const loweredType = lowerHighIRType(type);
                const statements: MidIRStatement[] = [];
                // Commented until runtime can deal with strings
                if (isTheSameMidIRType(loweredType, MIR_ANY_TYPE)) {
                  statements.push(
                    MIR_INDEX_ACCESS({
                      name: `v${index}`,
                      type: loweredType,
                      pointerExpression,
                      index: 2,
                    })
                  );
                } else {
                  const temp = this.tempAllocator();
                  statements.push(
                    MIR_INDEX_ACCESS({
                      name: temp,
                      type: MIR_ANY_TYPE,
                      pointerExpression,
                      index: 2,
                    }),
                    MIR_CAST({
                      name: `v${index}`,
                      type: loweredType,
                      assignedExpression: MIR_VARIABLE(temp, MIR_ANY_TYPE),
                    })
                  );
                }
                statements.push(
                  MIR_FUNCTION_CALL({
                    functionExpression: MIR_NAME(
                      decRefFunctionName(typeName),
                      MIR_FUNCTION_TYPE([defRefFunctionArgumentType(typeName)], MIR_INT_TYPE)
                    ),
                    functionArguments: [MIR_VARIABLE(`v${index}`, loweredType)],
                    returnType: MIR_INT_TYPE,
                  })
                );
                destructMemberStatements.push(
                  MIR_BINARY({
                    name: `tagComparison${index}`,
                    operator: '==',
                    e1: MIR_VARIABLE('tag', MIR_INT_TYPE),
                    e2: MIR_INT(index + 1),
                  }),
                  MIR_SINGLE_IF({
                    booleanExpression: MIR_VARIABLE(`tagComparison${index}`, MIR_BOOL_TYPE),
                    invertCondition: false,
                    statements,
                  })
                );
              });
            }
          }
        )
      );
    });

    Object.keys(this.closureTypeDefinitions).forEach((typeName) => {
      functions.push(
        generateSingleDestructorFunction(
          typeName,
          (pointerExpression, destructMemberStatements) => {
            destructMemberStatements.push(
              MIR_INDEX_ACCESS({
                name: 'destructor',
                type: unknownMemberDestructorType,
                pointerExpression,
                index: 1,
              }),
              MIR_INDEX_ACCESS({
                name: 'context',
                type: MIR_ANY_TYPE,
                pointerExpression,
                index: 3,
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_VARIABLE('destructor', unknownMemberDestructorType),
                functionArguments: [MIR_VARIABLE('context', MIR_ANY_TYPE)],
                returnType: MIR_INT_TYPE,
              })
            );
          }
        )
      );
    });

    functions.push(generateSingleDestructorFunction('string', () => {}));

    functions.push({
      name: decRefFunctionName('nothing'),
      parameters: ['o'],
      type: unknownMemberDestructorType,
      body: [],
      returnValue: MIR_ZERO,
    });

    return functions;
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
    const loweredReturnValue = lowerHighIRExpression(returnValue);
    const returnedVariable = variableOfMidIRExpression(loweredReturnValue);
    return {
      name,
      parameters,
      type: lowerHighIRFunctionType(type),
      body: this.lowerHighIRStatementBlock(
        body,
        new Set(returnedVariable != null ? [returnedVariable] : [])
      ),
      returnValue: loweredReturnValue,
    };
  }

  private lowerHighIRStatementBlock(
    statements: readonly HighIRStatement[],
    variablesNotToDeref: ReadonlySet<string>
  ): readonly MidIRStatement[] {
    const loweredStatements = statements.flatMap(this.lowerHighIRStatement);
    type Variable = { readonly variableName: string; readonly typeName: string };
    const variableToDecreaseReferenceCount: Variable[] = [];
    loweredStatements.forEach((loweredStatement) => {
      switch (loweredStatement.__type__) {
        case 'MidIRFunctionCallStatement': {
          const typeName = referenceTypeName(loweredStatement.returnType);
          if (typeName) {
            variableToDecreaseReferenceCount.push({
              variableName: checkNotNull(loweredStatement.returnCollector),
              typeName,
            });
          }
          return;
        }
        case 'MidIRIfElseStatement':
          loweredStatement.finalAssignments.forEach(({ name, type }) => {
            const typeName = referenceTypeName(type);
            if (typeName) variableToDecreaseReferenceCount.push({ variableName: name, typeName });
          });
          return;
        case 'MidIRWhileStatement':
          if (loweredStatement.breakCollector) {
            const typeName = referenceTypeName(loweredStatement.breakCollector.type);
            if (typeName) {
              const variableName = loweredStatement.breakCollector.name;
              variableToDecreaseReferenceCount.push({ variableName, typeName });
            }
          }
          return;
        case 'MidIRStructInitializationStatement': {
          const typeName = checkNotNull(referenceTypeName(loweredStatement.type));
          variableToDecreaseReferenceCount.push({
            variableName: loweredStatement.structVariableName,
            typeName,
          });
          return;
        }
        default:
          return;
      }
    });
    variableToDecreaseReferenceCount
      .filter((it) => !variablesNotToDeref.has(it.variableName))
      .forEach(({ variableName, typeName }) => {
        loweredStatements.push(
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(
              decRefFunctionName(typeName),
              MIR_FUNCTION_TYPE([defRefFunctionArgumentType(typeName)], MIR_INT_TYPE)
            ),
            functionArguments: [MIR_VARIABLE(variableName, defRefFunctionArgumentType(typeName))],
            returnType: MIR_INT_TYPE,
          })
        );
      });
    return loweredStatements;
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
        const typeDefinition = checkNotNull(
          this.typeDefinitions[pointerType.name],
          `Missing ${pointerType.name}`
        );
        if (typeDefinition.type === 'object') {
          return [
            MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index: index + 1 }),
          ];
        }
        assert(index === 0 || index === 1, `Invalid index for variant access: ${index}`);
        switch (index) {
          case 0:
            // Access the tag case
            assert(variableType.__type__ === 'PrimitiveType' && variableType.type === 'int');
            return [MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index: 1 })];
          case 1: {
            // Access the data case, might need cast
            if (isTheSameMidIRType(variableType, MIR_ANY_TYPE)) {
              return [MIR_INDEX_ACCESS({ name, type: variableType, pointerExpression, index: 2 })];
            }
            const temp = this.tempAllocator();
            return [
              MIR_INDEX_ACCESS({ name: temp, type: MIR_ANY_TYPE, pointerExpression, index: 2 }),
              MIR_CAST({
                name,
                type: variableType,
                assignedExpression: MIR_VARIABLE(temp, MIR_ANY_TYPE),
              }),
            ];
          }
        }
      }
      case 'HighIRFunctionCallStatement': {
        const loweredReturnType = lowerHighIRType(statement.returnType);
        const statements: MidIRStatement[] = [];
        if (statement.functionExpression.__type__ === 'HighIRNameExpression') {
          statements.push(
            MIR_FUNCTION_CALL({
              functionExpression: lowerHighIRExpression(statement.functionExpression),
              functionArguments: statement.functionArguments.map(lowerHighIRExpression),
              returnType: loweredReturnType,
              returnCollector: statement.returnCollector ?? this.tempAllocator(),
            })
          );
        } else {
          const closureHighIRType = statement.functionExpression.type;
          assert(
            closureHighIRType.__type__ === 'IdentifierType' &&
              closureHighIRType.typeArguments.length === 0
          );
          const functionType = checkNotNull(
            this.closureTypeDefinitions[closureHighIRType.name],
            `Missing ${closureHighIRType.name}`
          );
          const pointerExpression = lowerHighIRExpression(statement.functionExpression);
          const tempFunction = this.tempAllocator();
          const tempContext = this.tempAllocator();
          statements.push(
            MIR_INDEX_ACCESS({
              name: tempFunction,
              type: functionType,
              pointerExpression,
              index: 2,
            }),
            MIR_INDEX_ACCESS({
              name: tempContext,
              type: MIR_ANY_TYPE,
              pointerExpression,
              index: 3,
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_VARIABLE(tempFunction, functionType),
              functionArguments: [
                MIR_VARIABLE(tempContext, MIR_ANY_TYPE),
                ...statement.functionArguments.map(lowerHighIRExpression),
              ],
              returnType: loweredReturnType,
              returnCollector: statement.returnCollector ?? this.tempAllocator(),
            })
          );
        }
        return statements;
      }
      case 'HighIRIfElseStatement': {
        const finalAssignments = statement.finalAssignments.map(
          ({ name, type, branch1Value, branch2Value }) => ({
            name,
            type: lowerHighIRType(type),
            branch1Value: lowerHighIRExpression(branch1Value),
            branch2Value: lowerHighIRExpression(branch2Value),
          })
        );
        const variablesNotToDerefInS1 = new Set(
          filterMap(finalAssignments, ({ branch1Value }) => variableOfMidIRExpression(branch1Value))
        );
        const variablesNotToDerefInS2 = new Set(
          filterMap(finalAssignments, ({ branch2Value }) => variableOfMidIRExpression(branch2Value))
        );
        return [
          MIR_IF_ELSE({
            booleanExpression: lowerHighIRExpression(statement.booleanExpression),
            s1: this.lowerHighIRStatementBlock(statement.s1, variablesNotToDerefInS1),
            s2: this.lowerHighIRStatementBlock(statement.s2, variablesNotToDerefInS2),
            finalAssignments,
          }),
        ];
      }
      case 'HighIRSingleIfStatement':
        return [
          MIR_SINGLE_IF({
            booleanExpression: lowerHighIRExpression(statement.booleanExpression),
            invertCondition: statement.invertCondition,
            statements: this.lowerHighIRStatementBlock(statement.statements, new Set()),
          }),
        ];
      case 'HighIRBreakStatement':
        return [MIR_BREAK(lowerHighIRExpression(statement.breakValue))];
      case 'HighIRWhileStatement': {
        const loopVariables = statement.loopVariables.map(
          ({ name, type, initialValue, loopValue }) => ({
            name,
            type: lowerHighIRType(type),
            initialValue: lowerHighIRExpression(initialValue),
            loopValue: lowerHighIRExpression(loopValue),
          })
        );
        const variablesNotToDeref = new Set(
          filterMap(loopVariables, ({ loopValue }) => variableOfMidIRExpression(loopValue))
        );
        return [
          MIR_WHILE({
            loopVariables,
            statements: this.lowerHighIRStatementBlock(statement.statements, variablesNotToDeref),
            breakCollector:
              statement.breakCollector != null
                ? {
                    name: statement.breakCollector.name,
                    type: lowerHighIRType(statement.breakCollector.type),
                  }
                : undefined,
          }),
        ];
      }
      case 'HighIRStructInitializationStatement': {
        const structVariableName = statement.structVariableName;
        const type = lowerHighIRType(statement.type);
        const typeDefinition = this.typeDefinitions[statement.type.name];
        assert(typeDefinition != null, `Missing typedef ${statement.type.name}`);
        const statements: MidIRStatement[] = [];
        const expressionList =
          typeDefinition.type === 'object'
            ? statement.expressionList.map((expression) => {
                const lowered = lowerHighIRExpression(expression);
                this.addReferenceCountingIfTypeAllowed(statements, lowered);
                return lowered;
              })
            : statement.expressionList.map((expression, index) => {
                const lowered = lowerHighIRExpression(expression);
                assert(index === 0 || index === 1, `Invalid index for variant access: ${index}`);
                this.addReferenceCountingIfTypeAllowed(statements, lowered);
                if (index === 0) return lowered;
                if (isTheSameMidIRType(lowered.type, MIR_ANY_TYPE)) return lowered;
                const temp = this.tempAllocator();
                statements.push(
                  MIR_CAST({ name: temp, type: MIR_ANY_TYPE, assignedExpression: lowered })
                );
                return MIR_VARIABLE(temp, MIR_ANY_TYPE);
              });
        expressionList.unshift(MIR_ONE);
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
        this.addReferenceCountingIfTypeAllowed(statements, context);
        let functionNameSlot: MidIRExpression;
        let contextSlot: MidIRExpression;
        let destructorFunctionSlot: MidIRExpression;
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
        const contextTypeName = referenceTypeName(context.type);
        if (contextTypeName == null) {
          destructorFunctionSlot = MIR_NAME(
            decRefFunctionName('nothing'),
            unknownMemberDestructorType
          );
        } else {
          const temp = this.tempAllocator();
          statements.push(
            MIR_CAST({
              name: temp,
              type: unknownMemberDestructorType,
              assignedExpression: MIR_NAME(
                decRefFunctionName(contextTypeName),
                MIR_FUNCTION_TYPE([context.type], MIR_INT_TYPE)
              ),
            })
          );
          destructorFunctionSlot = MIR_VARIABLE(temp, unknownMemberDestructorType);
        }
        statements.push(
          MIR_STRUCT_INITIALIZATION({
            structVariableName: statement.closureVariableName,
            type: closureType,
            expressionList: [MIR_ONE, destructorFunctionSlot, functionNameSlot, contextSlot],
          })
        );
        return statements;
      }
    }
  };

  private addReferenceCountingIfTypeAllowed(
    collector: MidIRStatement[],
    expression: MidIRExpression
  ): void {
    const typeName = referenceTypeName(expression.type);
    if (typeName == null) return;
    if (typeName !== 'string') {
      collector.push(MIR_INC_REF(expression));
      return;
    }
    const count = this.tempAllocator();
    const notSpecial = this.tempAllocator();
    collector.push(
      MIR_INDEX_ACCESS({
        name: count,
        type: MIR_INT_TYPE,
        pointerExpression: expression,
        index: 0,
      }),
      MIR_BINARY({
        name: notSpecial,
        operator: '>',
        e1: MIR_VARIABLE(count, MIR_INT_TYPE),
        e2: MIR_ZERO,
      }),
      MIR_SINGLE_IF({
        booleanExpression: MIR_VARIABLE(notSpecial, MIR_BOOL_TYPE),
        invertCondition: false,
        statements: [MIR_INC_REF(expression)],
      })
    );
  }
}

export default function lowerHighIRSourcesToMidIRSources(sources: HighIRSources): MidIRSources {
  const typeDefinitions: MidIRTypeDefinition[] = [];
  const closureTypeDefinitionMapForLowering = Object.fromEntries(
    sources.closureTypes.map((it) => {
      assert(it.typeParameters.length === 0);
      // TODO(ref-counting): add typedef for destructors
      const functionTypeWithoutContextArgument = lowerHighIRFunctionType(it.functionType);
      const functionType = MIR_FUNCTION_TYPE(
        [MIR_ANY_TYPE, ...functionTypeWithoutContextArgument.argumentTypes],
        functionTypeWithoutContextArgument.returnType
      );
      typeDefinitions.push({
        identifier: it.identifier,
        mappings: [
          MIR_INT_TYPE,
          MIR_FUNCTION_TYPE([MIR_ANY_TYPE], MIR_INT_TYPE),
          functionType,
          MIR_ANY_TYPE,
        ],
      });
      return [it.identifier, functionType];
    })
  );
  const typeDefinitionMapForLowering = Object.fromEntries(
    sources.typeDefinitions.map((it) => {
      const mappings =
        it.type === 'object' ? it.mappings.map(lowerHighIRType) : [MIR_INT_TYPE, MIR_ANY_TYPE];
      mappings.unshift(MIR_INT_TYPE);
      typeDefinitions.push({ identifier: it.identifier, mappings });
      return [it.identifier, it];
    })
  );
  const functions = sources.functions.map((highIRFunction) =>
    new HighIRToMidIRLoweringManager(
      closureTypeDefinitionMapForLowering,
      typeDefinitionMapForLowering
    ).lowerHighIRFunction(highIRFunction)
  );
  functions.push(
    ...new HighIRToMidIRLoweringManager(
      closureTypeDefinitionMapForLowering,
      typeDefinitionMapForLowering
    ).generateDestructorFunctions()
  );
  return optimizeMidIRSourcesByEliminatingUnusedOnes({
    globalVariables: sources.globalVariables,
    typeDefinitions,
    mainFunctionNames: sources.mainFunctionNames,
    functions,
  });
}
