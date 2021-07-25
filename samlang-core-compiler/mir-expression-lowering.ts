import {
  encodeFunctionNameGlobally,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
} from 'samlang-core-ast/common-names';
import type {
  Type,
  IdentifierType,
  ModuleReference,
  FunctionType,
} from 'samlang-core-ast/common-nodes';
import createMidIRFlexibleOrderOperatorNode from 'samlang-core-ast/mir-flexible-op';
import {
  MidIRStatement,
  MidIRExpression,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_FALSE,
  MIR_TRUE,
  MIR_ZERO,
  MIR_ONE,
  MIR_INT,
  MIR_INDEX_ACCESS,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_BINARY,
  MidIRType,
  MidIRIdentifierType,
  MidIRFunctionType,
  isTheSameMidIRType,
  MIR_BOOL_TYPE,
  MIR_INT_TYPE,
  MIR_ANY_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_STRING_TYPE,
  MIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRFunction } from 'samlang-core-ast/mir-nodes';
import type {
  SamlangExpression,
  ClassMemberExpression,
  TupleConstructorExpression,
  ObjectConstructorExpression,
  VariantConstructorExpression,
  FieldAccessExpression,
  MethodAccessExpression,
  UnaryExpression,
  FunctionCallExpression,
  BinaryExpression,
  IfElseExpression,
  MatchExpression,
  LambdaExpression,
  StatementBlockExpression,
} from 'samlang-core-ast/samlang-expressions';
import { LocalStackedContext, checkNotNull, zip } from 'samlang-core-utils';

import type HighIRStringManager from './hir-string-manager';
import type MidIRTypeSynthesizer from './mir-type-synthesizer';
import lowerSamlangType from './mir-types-lowering';

type MidIRExpressionLoweringResult = {
  readonly statements: readonly MidIRStatement[];
  readonly expression: MidIRExpression;
};

type MidIRExpressionLoweringResultWithSyntheticFunctions = {
  readonly syntheticFunctions: readonly MidIRFunction[];
  readonly statements: readonly MidIRStatement[];
  readonly expression: MidIRExpression;
};

class MidIRLoweringVariableContext extends LocalStackedContext<MidIRExpression> {
  addLocalValueType(name: string, value: MidIRExpression, onCollision: () => void): void {
    if (value.__type__ !== 'MidIRVariableExpression') {
      super.addLocalValueType(name, value, onCollision);
      return;
    }
    super.addLocalValueType(name, this.getLocalValueType(value.name) ?? value, onCollision);
  }

  bind(name: string, value: MidIRExpression): void {
    this.addLocalValueType(name, value, () => {});
  }
}

class MidIRExpressionLoweringManager {
  private nextTemporaryVariableId = 0;

  private nextSyntheticFunctionId = 0;

  depth = 0;
  blockID = 0;

  private readonly varibleContext = new MidIRLoweringVariableContext();

  readonly syntheticFunctions: MidIRFunction[] = [];

  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly encodedFunctionName: string,
    private readonly typeDefinitionMapping: Readonly<Record<string, readonly MidIRType[]>>,
    private readonly functionTypeMapping: Readonly<Record<string, MidIRFunctionType>>,
    private readonly typeParameters: ReadonlySet<string>,
    private readonly typeSynthesizer: MidIRTypeSynthesizer,
    private readonly stringManager: HighIRStringManager
  ) {}

  private allocateTemporaryVariable(): string {
    const variableName = `_t${this.nextTemporaryVariableId}`;
    this.nextTemporaryVariableId += 1;
    return variableName;
  }

  private allocateSyntheticFunctionName(): string {
    const functionName = encodeFunctionNameGlobally(
      this.moduleReference,
      this.encodedFunctionName,
      `_SYNTHETIC_${this.nextSyntheticFunctionId}`
    );
    this.nextSyntheticFunctionId += 1;
    return functionName;
  }

  private loweredAndAddStatements(
    expression: SamlangExpression,
    statements: MidIRStatement[]
  ): MidIRExpression {
    const result = this.lower(expression);
    statements.push(...result.statements);
    return result.expression;
  }

  private lowerType(type: Type): MidIRType {
    return lowerSamlangType(type, this.typeParameters, this.typeSynthesizer);
  }

  private getTypeDefinition(identifier: string): readonly MidIRType[] {
    return checkNotNull(
      this.typeDefinitionMapping[identifier] ??
        this.typeSynthesizer.mappings.get(identifier)?.mappings
    );
  }

  private lowerWithPotentialCast(
    type: MidIRType,
    assignedExpression: MidIRExpression,
    mutableStatementCollector: MidIRStatement[]
  ): MidIRExpression {
    if (isTheSameMidIRType(type, assignedExpression.type)) {
      return assignedExpression;
    }
    const name = this.allocateTemporaryVariable();
    mutableStatementCollector.push(MIR_CAST({ name, type, assignedExpression }));
    return MIR_VARIABLE(name, type);
  }

  private lowerBindWithPotentialCast(
    name: string,
    type: MidIRType,
    assignedExpression: MidIRExpression,
    mutableStatementCollector: MidIRStatement[]
  ): MidIRExpression {
    if (isTheSameMidIRType(type, assignedExpression.type)) {
      this.varibleContext.bind(name, assignedExpression);
      return assignedExpression;
    }
    mutableStatementCollector.push(MIR_CAST({ name, type, assignedExpression }));
    return MIR_VARIABLE(name, type);
  }

  readonly lower = (expression: SamlangExpression): MidIRExpressionLoweringResult => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        switch (expression.literal.type) {
          case 'BoolLiteral':
            return { statements: [], expression: expression.literal.value ? MIR_TRUE : MIR_FALSE };
          case 'IntLiteral':
            return { statements: [], expression: MIR_INT(expression.literal.value) };
          case 'StringLiteral': {
            return {
              statements: [],
              expression: MIR_NAME(
                this.stringManager.allocateStringArrayGlobalVariable(expression.literal.value).name,
                MIR_STRING_TYPE
              ),
            };
          }
        }
      case 'ThisExpression':
        return {
          statements: [],
          expression: MIR_VARIABLE('_this', this.lowerType(expression.type)),
        };
      case 'VariableExpression': {
        const stored = this.varibleContext.getLocalValueType(expression.name);
        if (stored != null) return { statements: [], expression: stored };
        return {
          statements: [],
          expression: MIR_VARIABLE(expression.name, this.lowerType(expression.type)),
        };
      }
      case 'ClassMemberExpression':
        return this.lowerClassMember(expression);
      case 'TupleConstructorExpression':
        return this.lowerTupleConstructor(expression);
      case 'ObjectConstructorExpression':
        return this.lowerObjectConstructor(expression);
      case 'VariantConstructorExpression':
        return this.lowerVariantConstructor(expression);
      case 'FieldAccessExpression':
        return this.lowerFieldAccess(expression);
      case 'MethodAccessExpression':
        return this.lowerMethodAccess(expression);
      case 'UnaryExpression':
        return this.lowerUnary(expression);
      case 'FunctionCallExpression':
        return this.lowerFunctionCall(expression);
      case 'BinaryExpression':
        return this.lowerBinary(expression);
      case 'IfElseExpression':
        return this.lowerIfElse(expression);
      case 'MatchExpression':
        return this.lowerMatch(expression);
      case 'LambdaExpression':
        return this.lowerLambda(expression);
      case 'StatementBlockExpression':
        return this.lowerStatementBlock(expression);
    }
  };

  private get closureType(): MidIRType {
    const typeDefinition = this.typeSynthesizer.synthesize([MIR_ANY_TYPE, MIR_ANY_TYPE]);
    return MIR_IDENTIFIER_TYPE(typeDefinition.identifier);
  }

  private lowerClassMember(expression: ClassMemberExpression): MidIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const sourceLevelFunctionType = expression.type as FunctionType;
    const withContextIRFunctionType = MIR_FUNCTION_TYPE(
      [MIR_ANY_TYPE, ...sourceLevelFunctionType.argumentTypes.map((it) => this.lowerType(it))],
      this.lowerType(sourceLevelFunctionType.returnType)
    );
    const statements: MidIRStatement[] = [];
    const encodedOriginalFunctionName = encodeFunctionNameGlobally(
      expression.moduleReference,
      expression.className,
      expression.memberName
    );
    statements.push(
      MIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: this.closureType,
        expressionList: [
          this.lowerWithPotentialCast(
            MIR_ANY_TYPE,
            MIR_NAME(`${encodedOriginalFunctionName}_with_context`, withContextIRFunctionType),
            statements
          ),
          this.lowerWithPotentialCast(MIR_ANY_TYPE, MIR_ONE, statements),
        ],
      })
    );
    return { statements, expression: MIR_VARIABLE(structVariableName, this.closureType) };
  }

  private lowerTupleConstructor(
    expression: TupleConstructorExpression
  ): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    const tupleVariableName = this.allocateTemporaryVariable();
    const loweredTupleIdentifierType = MIR_IDENTIFIER_TYPE(
      (this.lowerType(expression.type) as MidIRIdentifierType).name
    );
    const loweredTupleMappings = this.getTypeDefinition(loweredTupleIdentifierType.name);
    const loweredExpressions = zip(expression.expressions, loweredTupleMappings).map(
      ([subExpression, tupleElementType]) =>
        this.lowerWithPotentialCast(
          tupleElementType,
          this.loweredAndAddStatements(subExpression, loweredStatements),
          loweredStatements
        )
    );
    return {
      statements: [
        ...loweredStatements,
        MIR_STRUCT_INITIALIZATION({
          structVariableName: tupleVariableName,
          type: loweredTupleIdentifierType,
          expressionList: loweredExpressions,
        }),
      ],
      expression: MIR_VARIABLE(tupleVariableName, loweredTupleIdentifierType),
    };
  }

  private lowerObjectConstructor(
    expression: ObjectConstructorExpression
  ): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    const loweredIdentifierType = this.lowerType(expression.type) as MidIRIdentifierType;
    const mappingsForIdentifierType = this.getTypeDefinition(loweredIdentifierType.name);
    const loweredFields = zip(expression.fieldDeclarations, mappingsForIdentifierType).map(
      ([fieldDeclaration, fieldType]) => {
        const fieldExpression = fieldDeclaration.expression ?? {
          __type__: 'VariableExpression',
          range: fieldDeclaration.range,
          precedence: 1,
          associatedComments: [],
          type: fieldDeclaration.type,
          name: fieldDeclaration.name,
        };
        return this.lowerWithPotentialCast(
          fieldType,
          this.loweredAndAddStatements(fieldExpression, loweredStatements),
          loweredStatements
        );
      }
    );
    const structVariableName = this.allocateTemporaryVariable();
    loweredStatements.push(
      MIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: loweredIdentifierType,
        expressionList: loweredFields,
      })
    );
    return {
      statements: loweredStatements,
      expression: MIR_VARIABLE(structVariableName, loweredIdentifierType),
    };
  }

  private lowerVariantConstructor(
    expression: VariantConstructorExpression
  ): MidIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const statements: MidIRStatement[] = [];
    const variantType = this.lowerType(expression.type);
    const dataExpression = this.loweredAndAddStatements(expression.data, statements);
    statements.push(
      MIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: variantType,
        expressionList: [
          MIR_INT(expression.tagOrder),
          this.lowerWithPotentialCast(MIR_ANY_TYPE, dataExpression, statements),
        ],
      })
    );
    return {
      statements,
      expression: MIR_VARIABLE(structVariableName, variantType),
    };
  }

  private lowerFieldAccess(expression: FieldAccessExpression): MidIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const mappingsForIdentifierType = this.getTypeDefinition(
      (this.lowerType(expression.expression.type) as MidIRIdentifierType).name
    );
    const expectedFieldType = this.lowerType(expression.type);
    const extractedFieldType = checkNotNull(mappingsForIdentifierType[expression.fieldOrder]);
    const valueName = this.allocateTemporaryVariable();
    const statements = [
      ...result.statements,
      MIR_INDEX_ACCESS({
        name: valueName,
        type: extractedFieldType,
        pointerExpression: result.expression,
        index: expression.fieldOrder,
      }),
    ];
    return {
      statements,
      expression: this.lowerWithPotentialCast(
        expectedFieldType,
        MIR_VARIABLE(valueName, extractedFieldType),
        statements
      ),
    };
  }

  private lowerMethodAccess(expression: MethodAccessExpression): MidIRExpressionLoweringResult {
    const structVariableName = this.allocateTemporaryVariable();
    const result = this.lower(expression.expression);
    return {
      statements: [
        ...result.statements,
        MIR_STRUCT_INITIALIZATION({
          structVariableName,
          type: this.closureType,
          expressionList: [
            MIR_NAME(
              encodeFunctionNameGlobally(
                (expression.expression.type as IdentifierType).moduleReference,
                (expression.expression.type as IdentifierType).identifier,
                expression.methodName
              ),
              this.lowerType(expression.type)
            ),
            result.expression,
          ],
        }),
      ],
      expression: MIR_VARIABLE(structVariableName, this.closureType),
    };
  }

  private lowerUnary(expression: UnaryExpression): MidIRExpressionLoweringResult {
    const result = this.lower(expression.expression);
    const valueName = this.allocateTemporaryVariable();
    switch (expression.operator) {
      case '!':
        return {
          statements: [
            ...result.statements,
            MIR_BINARY({ name: valueName, operator: '^', e1: result.expression, e2: MIR_TRUE }),
          ],
          expression: MIR_VARIABLE(valueName, MIR_BOOL_TYPE),
        };
      case '-':
        return {
          statements: [
            ...result.statements,
            MIR_BINARY({ name: valueName, operator: '-', e1: MIR_ZERO, e2: result.expression }),
          ],
          expression: MIR_VARIABLE(valueName, MIR_INT_TYPE),
        };
    }
  }

  private lowerFunctionCall(expression: FunctionCallExpression): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    const functionExpression = expression.functionExpression;
    const loweredReturnType = this.lowerType(expression.type);
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const returnCollectorName = this.allocateTemporaryVariable();
    let functionReturnCollectorType: MidIRType;
    let functionCall: MidIRStatement;
    switch (functionExpression.__type__) {
      case 'ClassMemberExpression': {
        const functionName = encodeFunctionNameGlobally(
          functionExpression.moduleReference,
          functionExpression.className,
          functionExpression.memberName
        );
        const functionTypeWithoutContext = checkNotNull(
          this.functionTypeMapping[functionName],
          `Missing function: ${functionName}`
        );
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME(functionName, functionTypeWithoutContext),
          functionArguments: zip(
            expression.functionArguments,
            functionTypeWithoutContext.argumentTypes
          ).map(([oneArgument, argumentType]) => {
            const loweredArgument = this.loweredAndAddStatements(oneArgument, loweredStatements);
            return this.lowerWithPotentialCast(argumentType, loweredArgument, loweredStatements);
          }),
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: isVoidReturn ? undefined : returnCollectorName,
        });
        break;
      }
      case 'MethodAccessExpression': {
        const functionName = encodeFunctionNameGlobally(
          (functionExpression.expression.type as IdentifierType).moduleReference,
          (functionExpression.expression.type as IdentifierType).identifier,
          functionExpression.methodName
        );
        const functionTypeWithoutContext = checkNotNull(this.functionTypeMapping[functionName]);
        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME(
            functionName,
            MIR_FUNCTION_TYPE(
              [
                this.lowerType(functionExpression.expression.type),
                ...functionTypeWithoutContext.argumentTypes,
              ],
              loweredReturnType
            )
          ),
          functionArguments: [
            this.loweredAndAddStatements(functionExpression.expression, loweredStatements),
            ...zip(expression.functionArguments, functionTypeWithoutContext.argumentTypes).map(
              ([oneArgument, argumentType]) => {
                const loweredArgument = this.loweredAndAddStatements(
                  oneArgument,
                  loweredStatements
                );
                return this.lowerWithPotentialCast(
                  argumentType,
                  loweredArgument,
                  loweredStatements
                );
              }
            ),
          ],
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: returnCollectorName,
        });
        break;
      }
      default: {
        /**
         * Closure ABI:
         * {
         *    __length__: 2
         *    [0]: reference to the function
         *    [1]: context
         * }
         *
         * It will call functionExpr(context, ...restArguments);
         */
        const sourceLevelFunctionTypeWithoutContext = functionExpression.type as FunctionType;
        const functionTypeWithoutContext = MIR_FUNCTION_TYPE(
          sourceLevelFunctionTypeWithoutContext.argumentTypes.map((it) => this.lowerType(it)),
          this.lowerType(sourceLevelFunctionTypeWithoutContext.returnType)
        );

        const loweredFunctionExpression = this.loweredAndAddStatements(
          functionExpression,
          loweredStatements
        );
        const closureExpression = this.lowerWithPotentialCast(
          this.closureType,
          loweredFunctionExpression,
          loweredStatements
        );
        const loweredFunctionArguments = zip(
          expression.functionArguments,
          functionTypeWithoutContext.argumentTypes
        ).map(([oneArgument, argumentType]) => {
          const loweredArgument = this.loweredAndAddStatements(oneArgument, loweredStatements);
          return this.lowerWithPotentialCast(argumentType, loweredArgument, loweredStatements);
        });
        const functionTempRaw = this.allocateTemporaryVariable();
        const contextTemp = this.allocateTemporaryVariable();

        loweredStatements.push(
          MIR_INDEX_ACCESS({
            name: functionTempRaw,
            type: MIR_ANY_TYPE,
            pointerExpression: closureExpression,
            index: 0,
          }),
          MIR_INDEX_ACCESS({
            name: contextTemp,
            type: MIR_ANY_TYPE,
            pointerExpression: closureExpression,
            index: 1,
          })
        );
        const functionTypeWithContext = MIR_FUNCTION_TYPE(
          [MIR_ANY_TYPE, ...functionTypeWithoutContext.argumentTypes],
          functionTypeWithoutContext.returnType
        );

        functionReturnCollectorType = functionTypeWithoutContext.returnType;
        functionCall = MIR_FUNCTION_CALL({
          functionExpression: this.lowerWithPotentialCast(
            functionTypeWithContext,
            MIR_VARIABLE(functionTempRaw, MIR_ANY_TYPE),
            loweredStatements
          ),
          functionArguments: [MIR_VARIABLE(contextTemp, MIR_ANY_TYPE), ...loweredFunctionArguments],
          returnType: functionTypeWithoutContext.returnType,
          returnCollector: isVoidReturn ? undefined : returnCollectorName,
        });
        break;
      }
    }

    loweredStatements.push(functionCall);
    return {
      statements: loweredStatements,
      expression: isVoidReturn
        ? MIR_ZERO
        : this.lowerWithPotentialCast(
            loweredReturnType,
            MIR_VARIABLE(returnCollectorName, functionReturnCollectorType),
            loweredStatements
          ),
    };
  }

  private shortCircuitBehaviorPreservingBoolExpressionLowering(
    expression: SamlangExpression
  ): MidIRExpressionLoweringResult {
    if (expression.__type__ === 'LiteralExpression' && expression.literal.type === 'BoolLiteral') {
      return { statements: [], expression: expression.literal.value ? MIR_TRUE : MIR_FALSE };
    }
    if (expression.__type__ !== 'BinaryExpression') {
      return this.lower(expression);
    }
    const {
      operator: { symbol: operatorSymbol },
      e1,
      e2,
    } = expression;
    switch (operatorSymbol) {
      case '&&': {
        const temp = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
        if (e1Result.expression.__type__ === 'MidIRIntLiteralExpression') {
          return e1Result.expression.value
            ? {
                statements: [...e1Result.statements, ...e2Result.statements],
                expression: e2Result.expression,
              }
            : { statements: e1Result.statements, expression: MIR_FALSE };
        }
        return {
          statements: [
            ...e1Result.statements,
            MIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: e2Result.statements,
              s2: [],
              finalAssignments: [
                {
                  name: temp,
                  type: MIR_BOOL_TYPE,
                  branch1Value: e2Result.expression,
                  branch2Value: MIR_FALSE,
                },
              ],
            }),
          ],
          expression: MIR_VARIABLE(temp, MIR_BOOL_TYPE),
        };
      }
      case '||': {
        const temp = this.allocateTemporaryVariable();
        const e1Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e1);
        const e2Result = this.shortCircuitBehaviorPreservingBoolExpressionLowering(e2);
        if (e1Result.expression.__type__ === 'MidIRIntLiteralExpression') {
          return e1Result.expression.value
            ? { statements: e1Result.statements, expression: MIR_TRUE }
            : {
                statements: [...e1Result.statements, ...e2Result.statements],
                expression: e2Result.expression,
              };
        }
        return {
          statements: [
            ...e1Result.statements,
            MIR_IF_ELSE({
              booleanExpression: e1Result.expression,
              s1: [],
              s2: e2Result.statements,
              finalAssignments: [
                {
                  name: temp,
                  type: MIR_BOOL_TYPE,
                  branch1Value: MIR_TRUE,
                  branch2Value: e2Result.expression,
                },
              ],
            }),
          ],
          expression: MIR_VARIABLE(temp, MIR_BOOL_TYPE),
        };
      }
      case '::': {
        if (
          expression.e1.__type__ === 'LiteralExpression' &&
          expression.e1.literal.type === 'StringLiteral' &&
          expression.e2.__type__ === 'LiteralExpression' &&
          expression.e2.literal.type === 'StringLiteral'
        ) {
          return {
            statements: [],
            expression: MIR_NAME(
              this.stringManager.allocateStringArrayGlobalVariable(
                expression.e1.literal.value + expression.e2.literal.value
              ).name,
              MIR_STRING_TYPE
            ),
          };
        }
        const loweredStatements: MidIRStatement[] = [];
        const loweredE1 = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2 = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const returnCollectorName = this.allocateTemporaryVariable();
        loweredStatements.push(
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(
              ENCODED_FUNCTION_NAME_STRING_CONCAT,
              MIR_FUNCTION_TYPE([MIR_STRING_TYPE, MIR_STRING_TYPE], MIR_STRING_TYPE)
            ),
            functionArguments: [loweredE1, loweredE2],
            returnType: MIR_STRING_TYPE,
            returnCollector: returnCollectorName,
          })
        );
        return {
          statements: loweredStatements,
          expression: MIR_VARIABLE(returnCollectorName, MIR_STRING_TYPE),
        };
      }
      default: {
        const loweredStatements: MidIRStatement[] = [];
        const loweredE1Original = this.loweredAndAddStatements(expression.e1, loweredStatements);
        const loweredE2Original = this.loweredAndAddStatements(expression.e2, loweredStatements);
        const valueTemp = this.allocateTemporaryVariable();
        const binaryStatement = MIR_BINARY({
          name: valueTemp,
          ...createMidIRFlexibleOrderOperatorNode(
            operatorSymbol,
            loweredE1Original,
            loweredE2Original
          ),
        });
        loweredStatements.push(binaryStatement);
        return {
          statements: loweredStatements,
          expression: MIR_VARIABLE(valueTemp, binaryStatement.type),
        };
      }
    }
  }

  private lowerBinary(expression: BinaryExpression): MidIRExpressionLoweringResult {
    return this.shortCircuitBehaviorPreservingBoolExpressionLowering(expression);
  }

  private lowerIfElse(expression: IfElseExpression): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    const loweredReturnType = this.lowerType(expression.type);
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const loweredBoolExpression = this.loweredAndAddStatements(
      expression.boolExpression,
      loweredStatements
    );
    const e1LoweringResult = this.lower(expression.e1);
    const e2LoweringResult = this.lower(expression.e2);
    const variableForIfElseAssign = this.allocateTemporaryVariable();
    loweredStatements.push(
      MIR_IF_ELSE({
        booleanExpression: loweredBoolExpression,
        s1: e1LoweringResult.statements,
        s2: e2LoweringResult.statements,
        finalAssignments: isVoidReturn
          ? []
          : [
              {
                name: variableForIfElseAssign,
                type: loweredReturnType,
                branch1Value: e1LoweringResult.expression,
                branch2Value: e2LoweringResult.expression,
              },
            ],
      })
    );
    return {
      statements: loweredStatements,
      expression: isVoidReturn
        ? MIR_ZERO
        : MIR_VARIABLE(variableForIfElseAssign, loweredReturnType),
    };
  }

  private lowerMatch(expression: MatchExpression): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    const loweredReturnType = this.lowerType(expression.type);
    const isVoidReturn =
      expression.type.type === 'PrimitiveType' && expression.type.name === 'unit';
    const matchedExpression = this.loweredAndAddStatements(
      expression.matchedExpression,
      loweredStatements
    );
    const variableForTag = this.allocateTemporaryVariable();
    loweredStatements.push(
      MIR_INDEX_ACCESS({
        name: variableForTag,
        type: MIR_INT_TYPE,
        pointerExpression: matchedExpression,
        index: 0,
      })
    );
    const loweredMatchingList = expression.matchingList.map(
      ({ tagOrder, dataVariable, expression: patternExpression }) => {
        const localStatements: MidIRStatement[] = [];
        return this.varibleContext.withNestedScope(() => {
          if (dataVariable != null) {
            const dataVariableRawTemp = this.allocateTemporaryVariable();
            const [dataVariableName, , dataVariableType] = dataVariable;
            localStatements.push(
              MIR_INDEX_ACCESS({
                name: dataVariableRawTemp,
                type: MIR_ANY_TYPE,
                pointerExpression: matchedExpression,
                index: 1,
              })
            );
            this.lowerBindWithPotentialCast(
              dataVariableName,
              this.lowerType(dataVariableType),
              MIR_VARIABLE(dataVariableRawTemp, MIR_ANY_TYPE),
              localStatements
            );
          }
          const result = this.lower(patternExpression);
          localStatements.push(...result.statements);
          const finalExpression = isVoidReturn ? undefined : result.expression;
          return { tagOrder, finalExpression, statements: localStatements };
        });
      }
    );
    const lastCase = checkNotNull(loweredMatchingList[loweredMatchingList.length - 1]);
    let finalExpression: MidIRExpression;
    if (isVoidReturn) {
      loweredStatements.push(
        ...loweredMatchingList
          .slice(0, loweredMatchingList.length - 1)
          .reduceRight((acc, oneCase) => {
            const comparisonTemporary = this.allocateTemporaryVariable();
            return [
              MIR_BINARY({
                name: comparisonTemporary,
                operator: '==',
                e1: MIR_VARIABLE(variableForTag, MIR_INT_TYPE),
                e2: MIR_INT(oneCase.tagOrder),
              }),
              MIR_IF_ELSE({
                booleanExpression: MIR_VARIABLE(comparisonTemporary, MIR_BOOL_TYPE),
                s1: oneCase.statements,
                s2: acc,
                finalAssignments: [],
              }),
            ];
          }, lastCase.statements)
      );
      finalExpression = MIR_ZERO;
    } else {
      const { s: chainedStatements, e: finalValue } = loweredMatchingList
        .slice(0, loweredMatchingList.length - 1)
        .reduceRight(
          (acc, oneCase) => {
            const comparisonTemporary = this.allocateTemporaryVariable();
            const finalAssignmentTemporary = this.allocateTemporaryVariable();
            return {
              s: [
                MIR_BINARY({
                  name: comparisonTemporary,
                  operator: '==',
                  e1: MIR_VARIABLE(variableForTag, MIR_INT_TYPE),
                  e2: MIR_INT(oneCase.tagOrder),
                }),
                MIR_IF_ELSE({
                  booleanExpression: MIR_VARIABLE(comparisonTemporary, MIR_BOOL_TYPE),
                  s1: oneCase.statements,
                  s2: acc.s,
                  finalAssignments: [
                    {
                      name: finalAssignmentTemporary,
                      type: loweredReturnType,
                      branch1Value: checkNotNull(oneCase.finalExpression),
                      branch2Value: acc.e,
                    },
                  ],
                }),
              ],
              e: MIR_VARIABLE(finalAssignmentTemporary, loweredReturnType),
            };
          },
          { s: lastCase.statements, e: checkNotNull(lastCase.finalExpression) }
        );
      loweredStatements.push(...chainedStatements);
      finalExpression = finalValue;
    }

    return {
      statements: loweredStatements,
      expression: finalExpression,
    };
  }

  private lowerLambda(expression: LambdaExpression): MidIRExpressionLoweringResult {
    const syntheticLambda = this.createSyntheticLambdaFunction(expression);
    this.syntheticFunctions.push(syntheticLambda);

    const captured = Object.entries(expression.captured);
    const loweredStatements: MidIRStatement[] = [];
    const structVariableName = this.allocateTemporaryVariable();
    let context: MidIRExpression;
    if (captured.length === 0) {
      // 1: A dummy value that is not zero, used to indicate nonnull context
      context = MIR_ONE;
    } else {
      const contextName = this.allocateTemporaryVariable();
      const expressionList = captured.map(([variableName, variableType]) =>
        MIR_VARIABLE(variableName, this.lowerType(variableType))
      );
      const contextType = MIR_IDENTIFIER_TYPE(
        this.typeSynthesizer.synthesize(expressionList.map((it) => it.type)).identifier
      );
      loweredStatements.push(
        MIR_STRUCT_INITIALIZATION({
          structVariableName: contextName,
          type: contextType,
          expressionList,
        })
      );
      context = MIR_VARIABLE(contextName, contextType);
    }
    loweredStatements.push(
      MIR_STRUCT_INITIALIZATION({
        structVariableName,
        type: this.closureType,
        expressionList: [
          this.lowerWithPotentialCast(
            MIR_ANY_TYPE,
            MIR_NAME(syntheticLambda.name, syntheticLambda.type),
            loweredStatements
          ),
          this.lowerWithPotentialCast(MIR_ANY_TYPE, context, loweredStatements),
        ],
      })
    );
    return {
      statements: loweredStatements,
      expression: MIR_VARIABLE(structVariableName, this.closureType),
    };
  }

  private createSyntheticLambdaFunction(expression: LambdaExpression): MidIRFunction {
    const loweringResult = this.lower(expression.body);
    const lambdaStatements: MidIRStatement[] = [];
    const contextType = MIR_IDENTIFIER_TYPE(
      this.typeSynthesizer.synthesize(
        Object.values(expression.captured).map((it) => this.lowerType(it))
      ).identifier
    );
    Object.entries(expression.captured).forEach(([variable, variableType], index) => {
      lambdaStatements.push(
        MIR_INDEX_ACCESS({
          name: variable,
          type: this.lowerType(variableType),
          pointerExpression: MIR_VARIABLE('_context', contextType),
          index,
        })
      );
    });
    lambdaStatements.push(...loweringResult.statements);
    return {
      name: this.allocateSyntheticFunctionName(),
      parameters: ['_context', ...expression.parameters.map(([name]) => name)],
      type: MIR_FUNCTION_TYPE(
        [contextType, ...expression.parameters.map(([, , type]) => this.lowerType(type))],
        this.lowerType(expression.type.returnType)
      ),
      body: lambdaStatements,
      returnValue: loweringResult.expression,
    };
  }

  private lowerStatementBlock({
    block: { statements: blockStatements, expression: finalExpression },
  }: StatementBlockExpression): MidIRExpressionLoweringResult {
    const loweredStatements: MidIRStatement[] = [];
    this.depth += 1;
    const loweredFinalExpression = this.varibleContext.withNestedScope(() => {
      blockStatements.forEach(({ pattern, assignedExpression }) => {
        const loweredAssignedExpression = this.loweredAndAddStatements(
          assignedExpression,
          loweredStatements
        );
        switch (pattern.type) {
          case 'TuplePattern': {
            const mappingsForTupleType = this.getTypeDefinition(
              (loweredAssignedExpression.type as MidIRIdentifierType).name
            );
            zip(pattern.destructedNames, mappingsForTupleType).forEach(
              ([{ name, type }, extractedFieldType], index) => {
                if (name == null) {
                  return;
                }
                const expectedFieldType = this.lowerType(type);
                const mangledName = this.getRenamedVariableForNesting(name, extractedFieldType);
                loweredStatements.push(
                  MIR_INDEX_ACCESS({
                    name: mangledName,
                    type: extractedFieldType,
                    pointerExpression: loweredAssignedExpression,
                    index,
                  })
                );
                this.lowerWithPotentialCast(
                  expectedFieldType,
                  MIR_VARIABLE(mangledName, extractedFieldType),
                  loweredStatements
                );
              }
            );
            break;
          }
          case 'ObjectPattern': {
            const mappingsForIdentifierType = this.getTypeDefinition(
              (loweredAssignedExpression.type as MidIRIdentifierType).name
            );
            zip(pattern.destructedNames, mappingsForIdentifierType).forEach(
              ([{ fieldName, fieldOrder, type, alias }, extractedFieldType]) => {
                const expectedFieldType = this.lowerType(type);
                const mangledName = this.getRenamedVariableForNesting(
                  alias?.[0] ?? fieldName,
                  extractedFieldType
                );
                loweredStatements.push(
                  MIR_INDEX_ACCESS({
                    name: mangledName,
                    type: extractedFieldType,
                    pointerExpression: loweredAssignedExpression,
                    index: fieldOrder,
                  })
                );
                this.lowerWithPotentialCast(
                  expectedFieldType,
                  MIR_VARIABLE(mangledName, extractedFieldType),
                  loweredStatements
                );
              }
            );
            break;
          }
          case 'VariablePattern':
            this.varibleContext.bind(pattern.name, loweredAssignedExpression);
            break;
          case 'WildCardPattern':
            break;
        }
      });
      if (finalExpression == null) return MIR_ZERO;
      return this.loweredAndAddStatements(finalExpression, loweredStatements);
    });
    this.blockID += 1;
    this.depth -= 1;
    return { statements: loweredStatements, expression: loweredFinalExpression };
  }

  private getRenamedVariableForNesting = (name: string, type: MidIRType): string => {
    if (this.depth === 0) {
      return name;
    }
    const renamed = `${name}__depth_${this.depth}__block_${this.blockID}`;
    this.varibleContext.bind(name, MIR_VARIABLE(renamed, type));
    return renamed;
  };
}

const lowerSamlangExpression = (
  moduleReference: ModuleReference,
  encodedFunctionName: string,
  typeDefinitionMapping: Readonly<Record<string, readonly MidIRType[]>>,
  functionTypeMapping: Readonly<Record<string, MidIRFunctionType>>,
  typeParameters: ReadonlySet<string>,
  typeSynthesizer: MidIRTypeSynthesizer,
  stringManager: HighIRStringManager,
  expression: SamlangExpression
): MidIRExpressionLoweringResultWithSyntheticFunctions => {
  const manager = new MidIRExpressionLoweringManager(
    moduleReference,
    encodedFunctionName,
    typeDefinitionMapping,
    functionTypeMapping,
    typeParameters,
    typeSynthesizer,
    stringManager
  );
  if (expression.__type__ === 'StatementBlockExpression') manager.depth = -1;
  const result = manager.lower(expression);
  return { ...result, syntheticFunctions: manager.syntheticFunctions };
};

export default lowerSamlangExpression;
