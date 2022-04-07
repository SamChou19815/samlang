// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/32
// @origin https://github.com/SamChou19815/samlang/pull/34

import { DummySourceReason, Location, ModuleReference, Position } from '../../ast/common-nodes';
import {
  AND,
  CONCAT,
  DIV,
  EQ,
  GE,
  GT,
  LE,
  LT,
  MINUS,
  MOD,
  MUL,
  NE,
  OR,
  PLUS,
} from '../../ast/common-operators';
import {
  ObjectPattern,
  ObjectPatternDestucturedName,
  SamlangExpression,
  SamlangFunctionType,
  SamlangTupleType,
  SamlangValStatement,
  SourceBoolType,
  SourceExpressionBinary,
  SourceExpressionClassMember,
  SourceExpressionFalse,
  SourceExpressionFieldAccess,
  SourceExpressionFunctionCall,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionMethodAccess,
  SourceExpressionStatementBlock,
  SourceExpressionString,
  SourceExpressionThis,
  SourceExpressionTrue,
  SourceExpressionTupleConstructor,
  SourceExpressionUnary,
  SourceExpressionVariable,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  StatementBlock,
  TuplePattern,
  VariablePattern,
  VariantPatternToExpression,
  WildCardPattern,
} from '../../ast/samlang-nodes';
import { checkNotNull } from '../../utils';
import ExpressionInterpreter, {
  ClassValue,
  createDefaultInterpretationContext,
  EMPTY,
  FunctionValue,
  InterpretationContext,
  PanicException,
  Value,
} from '../expression-interpreter';

describe('expression-interpreter', () => {
  it('Throws Panic Exception', () => {
    try {
      throw new PanicException('panic!');
    } catch (e) {
      expect((e as PanicException).message).toBe('panic!');
    }
  });

  it('value equality test', () => {
    expect({ type: 'unit' }).toEqual({ type: 'unit' });
    expect({ type: 'unit' }).not.toEqual({ type: 'bool', value: true });
    expect({ type: 'unit' }).not.toEqual({ type: 'int', value: 1 });
    expect({ type: 'unit' }).not.toEqual({ type: 'string', value: 'string' });
    expect({ type: 'unit' }).not.toEqual({ type: 'tuple', tupleContent: [] });
    expect({ type: 'unit' }).not.toEqual({ type: 'object', objectContent: new Map() });
    expect({ type: 'unit' }).not.toEqual({ type: 'variant', tag: 'tag', data: { type: 'unit' } });

    expect({ type: 'bool', value: true }).toEqual({ type: 'bool', value: true });
    expect({ type: 'bool', value: false }).toEqual({ type: 'bool', value: false });
    expect({ type: 'bool', value: true }).not.toEqual({ type: 'bool', value: false });
    expect({ type: 'bool', value: false }).not.toEqual({ type: 'bool', value: true });

    expect({ type: 'int', value: 1 }).toEqual({ type: 'int', value: 1 });
    expect({ type: 'int', value: 1 }).not.toEqual({ type: 'int', value: 2 });

    expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
    expect({ type: 'string', value: 'string' }).not.toEqual({
      type: 'string',
      value: 'not a string',
    });

    expect({ type: 'string', value: 'string' }).toEqual({ type: 'string', value: 'string' });
    expect({ type: 'string', value: 'string' }).not.toEqual({
      type: 'string',
      value: 'not a string',
    });

    expect({ type: 'tuple', tupleContent: [] }).toEqual({ type: 'tuple', tupleContent: [] });
    expect({ type: 'tuple', tupleContent: [] }).not.toEqual({
      type: 'tuple',
      tupleContent: [{ type: 'unit' }],
    });
    expect({ type: 'tuple', tupleContent: [{ type: 'unit' }] }).toEqual({
      type: 'tuple',
      tupleContent: [{ type: 'unit' }],
    });

    expect({ type: 'object', objectContent: new Map() }).toEqual({
      type: 'object',
      objectContent: new Map(),
    });
    const objectContent1 = new Map<string, Value>();
    objectContent1.set('field1', { type: 'unit' });
    const objectContent2 = new Map<string, Value>();
    objectContent2.set('field1', 1);
    expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
      type: 'object',
      objectContent: objectContent2,
    });
    objectContent2.set('field2', { type: 'unit' });
    expect({ type: 'object', objectContent: objectContent1 }).not.toEqual({
      type: 'object',
      objectContent: objectContent2,
    });

    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).toEqual({
      type: 'variant',
      tag: 'tag',
      data: { type: 'unit' },
    });
    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
      type: 'variant',
      tag: 'diff tag',
      data: { type: 'unit' },
    });
    expect({ type: 'variant', tag: 'tag', data: { type: 'unit' } }).not.toEqual({
      type: 'variant',
      tag: 'diff tag',
      data: { type: 'int', value: 1 },
    });

    const samlangExpression = SourceExpressionTrue(
      new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4))
    );
    expect({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    }).toEqual({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    });
    expect({
      type: 'functionValue',
      arguments: ['param'],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    }).not.toEqual({
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: { classes: new Map(), localValues: new Map() },
    });
  });

  it('empty context equality check', () => {
    expect(EMPTY).toEqual(EMPTY);
  });

  it('non-empty context equality check', () => {
    const testFunctions = new Map<string, FunctionValue>();
    const testMethods = new Map<string, FunctionValue>();
    const samlangExpression = SourceExpressionTrue(
      new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4))
    );
    const functionValue: FunctionValue = {
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: EMPTY,
    };
    testFunctions.set('function1', functionValue);
    testMethods.set('method1', functionValue);
    const testClassValue = { functions: testFunctions, methods: testMethods };
    const testClasses = new Map([['class1', testClassValue]]);
    const testLocalValues = new Map<string, Value>([['v1', { type: 'unit' }]]);
    const testContext = { classes: testClasses, localValues: testLocalValues };

    expect(testContext).toEqual(testContext);
  });

  const interpreter = new ExpressionInterpreter();

  const exampleLocation: Location = new Location(
    ModuleReference.DUMMY,
    Position(1, 2),
    Position(3, 4)
  );
  const intLiteralExpression: SamlangExpression = SourceExpressionInt(5, exampleLocation);
  const intLiteralValue: Value = 5;
  const stringLiteralExpression: SamlangExpression = SourceExpressionString(
    'value',
    exampleLocation
  );
  const stringLiteralValue: Value = 'value';
  const boolLiteralExpression: SamlangExpression = SourceExpressionTrue(exampleLocation);
  const boolLiteralValue: Value = true;
  const classMemberFunction: Value = {
    type: 'functionValue',
    arguments: [],
    body: SourceExpressionInt(5, exampleLocation),
    context: EMPTY,
  };
  const functionType: SamlangFunctionType = {
    type: 'FunctionType',
    reason: DummySourceReason,
    argumentTypes: [SourceUnitType(DummySourceReason)],
    returnType: SourceStringType(DummySourceReason),
  };
  const objectConstructorExpressionNonEmpty = SourceExpressionFunctionCall({
    type: SourceIntType(DummySourceReason),
    functionExpression: SourceExpressionClassMember({
      type: functionType,
      typeArguments: [],
      moduleReference: ModuleReference.DUMMY,
      className: SourceId('Clazz'),
      memberName: SourceId('init'),
    }),
    functionArguments: [intLiteralExpression],
  });
  const functionExpression = SourceExpressionLambda({
    location: exampleLocation,
    type: functionType,
    parameters: [],
    captured: {},
    body: stringLiteralExpression,
  });

  it('literal expressions evaluate correctly', () => {
    expect(interpreter.eval(intLiteralExpression)).toEqual(intLiteralValue);
    expect(interpreter.eval(stringLiteralExpression)).toEqual(stringLiteralValue);
    expect(interpreter.eval(boolLiteralExpression)).toEqual(boolLiteralValue);
  });

  it('this expressions evaluate correctly', () => {
    const thisExpression = SourceExpressionThis({
      location: exampleLocation,
      type: SourceBoolType(DummySourceReason),
    });
    const thisLocalValues = new Map<string, Value>([['this', true]]);
    const thisContext = { classes: new Map<string, ClassValue>(), localValues: thisLocalValues };
    expect(interpreter.eval(thisExpression, thisContext)).toEqual(boolLiteralValue);
    expect(() => interpreter.eval(thisExpression)).toThrow('Missing `this`');
  });

  it('variable expressions evaluate correctly', () => {
    const variableExpression = SourceExpressionVariable({
      location: exampleLocation,
      type: SourceBoolType(DummySourceReason),
      name: 'test',
    });
    const variableLocalValues = new Map<string, Value>([['test', boolLiteralValue]]);
    const variableContext = {
      classes: new Map<string, ClassValue>(),
      localValues: variableLocalValues,
    };
    expect(interpreter.eval(variableExpression, variableContext)).toEqual(boolLiteralValue);
    expect(() => interpreter.eval(variableExpression)).toThrow(
      `Missing variable ${variableExpression.name}`
    );
  });

  it('class member expressions evaluate correctly', () => {
    const classMemberExpression = SourceExpressionClassMember({
      location: exampleLocation,
      type: SourceBoolType(DummySourceReason),
      typeArguments: [SourceBoolType(DummySourceReason)],
      moduleReference: ModuleReference.DUMMY,
      className: SourceId('myClass'),
      memberName: SourceId('func'),
    });
    const classMemberClasses = new Map<string, ClassValue>([
      [
        'myClass',
        {
          functions: new Map([['func', classMemberFunction]]),
          methods: new Map(),
        },
      ],
    ]);
    const classMemberContext = { classes: classMemberClasses, localValues: new Map() };
    expect(interpreter.eval(classMemberExpression, classMemberContext)).toEqual(
      classMemberFunction
    );
    expect(() => interpreter.eval(classMemberExpression)).toThrow('');
  });

  it('tuple expression evaluates correctly', () => {
    const tupleExpression = SourceExpressionTupleConstructor({
      location: exampleLocation,
      type: {
        type: 'TupleType',
        reason: DummySourceReason,
        mappings: [SourceIntType(DummySourceReason)],
      },
      expressions: [intLiteralExpression],
    });
    const tupleExpressionMultiple = SourceExpressionTupleConstructor({
      location: exampleLocation,
      type: {
        type: 'TupleType',
        reason: DummySourceReason,
        mappings: [SourceIntType(DummySourceReason), SourceBoolType(DummySourceReason)],
      },
      expressions: [intLiteralExpression, boolLiteralExpression],
    });
    expect(interpreter.eval(tupleExpression)).toEqual({
      type: 'tuple',
      tupleContent: [intLiteralValue],
    });
    expect(interpreter.eval(tupleExpressionMultiple)).toEqual({
      type: 'tuple',
      tupleContent: [intLiteralValue, boolLiteralValue],
    });
  });

  it('object constructor expression evaluates correctly', () => {
    const objectConstructorExpressionEmpty = SourceExpressionFunctionCall({
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Clazz'),
        memberName: SourceId('init'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const objectContentNonEmpty = new Map();
    objectContentNonEmpty.set('test', intLiteralValue);
    const context: InterpretationContext = {
      classes: new Map([
        [
          'Clazz',
          {
            functions: new Map([
              [
                'init',
                {
                  type: 'functionValue',
                  arguments: ['test'],
                  body: (localContext) => ({
                    type: 'object',
                    objectContent: new Map([
                      ['test', checkNotNull(localContext.localValues.get('test'))],
                    ]),
                  }),
                  context: EMPTY,
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
      localValues: new Map(),
    };
    expect(() => interpreter.eval(objectConstructorExpressionEmpty)).toThrow();
    expect(interpreter.eval(objectConstructorExpressionNonEmpty, context)).toEqual({
      type: 'object',
      objectContent: objectContentNonEmpty,
    });
  });

  it('variant expression evaluates correctly', () => {
    const variantExpression = SourceExpressionFunctionCall({
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Clazz'),
        memberName: SourceId('tag'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const context: InterpretationContext = {
      classes: new Map([
        [
          'Clazz',
          {
            functions: new Map([
              [
                'tag',
                {
                  type: 'functionValue',
                  arguments: ['data'],
                  body: (localContext) => ({
                    type: 'variant',
                    tag: 'tag',
                    data: checkNotNull(localContext.localValues.get('data')),
                  }),
                  context: EMPTY,
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
      localValues: new Map(),
    };
    expect(interpreter.eval(variantExpression, context)).toEqual({
      type: 'variant',
      tag: 'tag',
      data: 5,
    });
  });

  it('field access expression evaluates correctly', () => {
    const fieldAccessExpression = SourceExpressionFieldAccess({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      expression: objectConstructorExpressionNonEmpty,
      fieldName: SourceId('test'),
      fieldOrder: 0,
    });
    const fieldAccessExpressionFail = SourceExpressionFieldAccess({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      expression: stringLiteralExpression,
      fieldName: SourceId('test'),
      fieldOrder: 0,
    });
    const context: InterpretationContext = {
      classes: new Map([
        [
          'Clazz',
          {
            functions: new Map([
              [
                'init',
                {
                  type: 'functionValue',
                  arguments: ['test'],
                  body: (localContext) => ({
                    type: 'object',
                    objectContent: new Map([
                      ['test', checkNotNull(localContext.localValues.get('test'))],
                    ]),
                  }),
                  context: EMPTY,
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
      localValues: new Map(),
    };
    expect(interpreter.eval(fieldAccessExpression, context)).toEqual(intLiteralValue);
    expect(() => interpreter.eval(fieldAccessExpressionFail, context)).toThrow('');
  });

  it('method access expression evaluates correctly', () => {
    const identifier = SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'method', []);
    const identifierExpression = SourceExpressionFunctionCall({
      type: identifier,
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Clazz'),
        memberName: SourceId('tag'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const methodAccessExpression = SourceExpressionMethodAccess({
      location: exampleLocation,
      type: identifier,
      expression: identifierExpression,
      methodName: SourceId('method'),
    });
    const methodAccessClasses: Map<string, ClassValue> = new Map([
      [
        'method',
        {
          functions: new Map(),
          methods: new Map([['method', classMemberFunction]]),
        },
      ],
      [
        'Clazz',
        {
          functions: new Map([
            [
              'tag',
              {
                type: 'functionValue',
                arguments: ['data'],
                body: (localContext) => ({
                  type: 'variant',
                  tag: 'tag',
                  data: checkNotNull(localContext.localValues.get('data')),
                }),
                context: EMPTY,
              },
            ],
          ]),
          methods: new Map(),
        },
      ],
    ]);
    const methodAccessContext: InterpretationContext = {
      classes: methodAccessClasses,
      localValues: new Map(),
    };
    expect(interpreter.eval(methodAccessExpression, methodAccessContext)).toEqual(
      classMemberFunction
    );
    methodAccessClasses.delete('method');
    expect(() => interpreter.eval(methodAccessExpression, methodAccessContext)).toThrow('');
    methodAccessClasses.delete('Clazz');
    expect(() => interpreter.eval(methodAccessExpression, methodAccessContext)).toThrow('');
  });

  it('unary expression evaluates correctly', () => {
    const unaryExpressionNeg = SourceExpressionUnary({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      operator: '-',
      expression: intLiteralExpression,
    });
    const unaryExpressionNot = SourceExpressionUnary({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      operator: '!',
      expression: boolLiteralExpression,
    });
    expect(interpreter.eval(unaryExpressionNeg)).toEqual(-5);
    expect(interpreter.eval(unaryExpressionNot)).toEqual(false);
  });

  it('panic expression evaluates correctly', () => {
    const panicExpression = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('panic'),
      }),
      functionArguments: [stringLiteralExpression],
    });
    const context: InterpretationContext = createDefaultInterpretationContext(() => {});
    expect(() => interpreter.eval(panicExpression, context)).toThrow('value');
  });

  it('built in function call expression evaluates correctly', () => {
    const stringToIntFunctionCall = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('stringToInt'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const stringToIntFunctionCallFail = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('stringToInt'),
      }),
      functionArguments: [stringLiteralExpression],
    });
    const intToStringFunctionCall = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('intToString'),
      }),
      functionArguments: [SourceExpressionString('5', exampleLocation)],
    });
    const printlnFunctionCall = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('println'),
      }),
      functionArguments: [stringLiteralExpression],
    });
    const context: InterpretationContext = createDefaultInterpretationContext(() => {});
    expect(interpreter.eval(stringToIntFunctionCall, context)).toEqual(intLiteralValue);
    expect(() => interpreter.eval(stringToIntFunctionCallFail, context)).toThrow(
      `Cannot convert \`${stringLiteralExpression.literal.value}\` to int.`
    );
    expect(interpreter.eval(intToStringFunctionCall, context)).toEqual('5');
    expect(interpreter.eval(printlnFunctionCall, context)).toEqual({ type: 'unit' });
  });

  it('function expression evaluates correctly', () => {
    const functionExpressionWithArgs = SourceExpressionLambda({
      location: exampleLocation,
      type: functionType,
      parameters: [[SourceId('arg1'), SourceStringType(DummySourceReason)]],
      captured: {},
      body: stringLiteralExpression,
    });
    const functionCallExpressionNoArgs = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression,
      functionArguments: [],
    });
    const functionCallExpressionWithArgs = SourceExpressionFunctionCall({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      functionExpression: functionExpressionWithArgs,
      functionArguments: [stringLiteralExpression],
    });
    expect(interpreter.eval(functionCallExpressionNoArgs)).toEqual(stringLiteralValue);
    expect(interpreter.eval(functionCallExpressionWithArgs)).toEqual(stringLiteralValue);
  });

  it('binary expression evaluates correctly', () => {
    const binExpressionMul = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: MUL,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionDiv = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: DIV,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionDiv0 = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: DIV,
      e1: intLiteralExpression,
      e2: SourceExpressionInt(0, exampleLocation),
    });
    const binExpressionMod = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: MOD,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionMod0 = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: MOD,
      e1: intLiteralExpression,
      e2: SourceExpressionInt(0, exampleLocation),
    });
    const binExpressionAdd = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: PLUS,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionSub = SourceExpressionBinary({
      type: SourceIntType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: MINUS,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionLt = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: LT,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionLe = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: LE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionGt = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: GT,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionGe = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: GE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionEq = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: EQ,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionEqfn = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: EQ,
      e1: functionExpression,
      e2: functionExpression,
    });
    const binExpressionNe = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: NE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionNefn = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: NE,
      e1: functionExpression,
      e2: intLiteralExpression,
    });
    const binExpressionAnd = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: AND,
      e1: boolLiteralExpression,
      e2: boolLiteralExpression,
    });
    const binExpressionAndFalse = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: AND,
      e1: SourceExpressionFalse(exampleLocation),
      e2: boolLiteralExpression,
    });
    const binExpressionOr = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: OR,
      e1: boolLiteralExpression,
      e2: boolLiteralExpression,
    });
    const binExpressionOrFalse = SourceExpressionBinary({
      type: SourceBoolType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: OR,
      e1: SourceExpressionFalse(exampleLocation),
      e2: boolLiteralExpression,
    });
    const binExpressionConcat = SourceExpressionBinary({
      type: SourceStringType(DummySourceReason),
      location: exampleLocation,
      operatorPrecedingComments: [],
      operator: CONCAT,
      e1: stringLiteralExpression,
      e2: stringLiteralExpression,
    });
    expect(interpreter.eval(binExpressionMul)).toEqual(25);
    expect(interpreter.eval(binExpressionDiv)).toEqual(1);
    expect(() => interpreter.eval(binExpressionDiv0)).toThrow('Division by zero!');
    expect(interpreter.eval(binExpressionMod)).toEqual(0);
    expect(() => interpreter.eval(binExpressionMod0)).toThrow('Mod by zero!');
    expect(interpreter.eval(binExpressionAdd)).toEqual(10);
    expect(interpreter.eval(binExpressionSub)).toEqual(0);
    expect(interpreter.eval(binExpressionLt)).toEqual(false);
    expect(interpreter.eval(binExpressionLe)).toEqual(true);
    expect(interpreter.eval(binExpressionGt)).toEqual(false);
    expect(interpreter.eval(binExpressionGe)).toEqual(true);
    expect(interpreter.eval(binExpressionEq)).toEqual(true);
    expect(() => interpreter.eval(binExpressionEqfn)).toThrow('Cannot compare functions!');
    expect(interpreter.eval(binExpressionNe)).toEqual(false);
    expect(() => interpreter.eval(binExpressionNefn)).toThrow('Cannot compare functions!');
    expect(interpreter.eval(binExpressionAnd)).toEqual(true);
    expect(interpreter.eval(binExpressionAndFalse)).toEqual(false);
    expect(interpreter.eval(binExpressionOr)).toEqual(true);
    expect(interpreter.eval(binExpressionOrFalse)).toEqual(true);
    expect(interpreter.eval(binExpressionConcat)).toEqual('valuevalue');
  });

  it('if else expression evaluates correctly', () => {
    const ifElseExpressionTrue = SourceExpressionIfElse({
      type: SourceStringType(DummySourceReason),
      location: exampleLocation,
      boolExpression: boolLiteralExpression,
      e1: SourceExpressionString('true branch', exampleLocation),
      e2: SourceExpressionString('false branch', exampleLocation),
    });
    const ifElseExpressionFalse = SourceExpressionIfElse({
      type: SourceStringType(DummySourceReason),
      location: exampleLocation,
      boolExpression: SourceExpressionFalse(exampleLocation),
      e1: SourceExpressionString('true branch', exampleLocation),
      e2: SourceExpressionString('false branch', exampleLocation),
    });
    expect(interpreter.eval(ifElseExpressionTrue)).toEqual('true branch');
    expect(interpreter.eval(ifElseExpressionFalse)).toEqual('false branch');
  });

  it('matching list evaluates correctly', () => {
    const matchingList: VariantPatternToExpression[] = [
      {
        location: exampleLocation,
        tag: SourceId('tag'),
        tagOrder: 0,
        expression: stringLiteralExpression,
        dataVariable: [SourceId('data'), SourceIntType(DummySourceReason)],
      },
    ];
    const matchingListNoData: VariantPatternToExpression[] = [
      {
        location: exampleLocation,
        tag: SourceId('tag'),
        tagOrder: 0,
        expression: stringLiteralExpression,
      },
    ];
    const matchedExpression = SourceExpressionFunctionCall({
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Clazz'),
        memberName: SourceId('tag'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const matchExpression = SourceExpressionMatch({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      matchedExpression,
      matchingList,
    });
    const matchExpressionNoData = SourceExpressionMatch({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      matchedExpression,
      matchingList: matchingListNoData,
    });
    const matchExpressionFail = SourceExpressionMatch({
      location: exampleLocation,
      type: SourceStringType(DummySourceReason),
      matchedExpression,
      matchingList: [],
    });
    const context: InterpretationContext = {
      classes: new Map([
        [
          'Clazz',
          {
            functions: new Map([
              [
                'tag',
                {
                  type: 'functionValue',
                  arguments: ['data'],
                  body: (localContext) => ({
                    type: 'variant',
                    tag: 'tag',
                    data: checkNotNull(localContext.localValues.get('data')),
                  }),
                  context: EMPTY,
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
      localValues: new Map(),
    };
    expect(interpreter.eval(matchExpression, context)).toEqual(stringLiteralValue);
    expect(interpreter.eval(matchExpressionNoData, context)).toEqual(stringLiteralValue);
    expect(() => interpreter.eval(matchExpressionFail, context)).toThrow('');
  });

  it('lambda expression evaluates correctly', () => {
    const lambdaFunctionType: SamlangFunctionType = {
      type: 'FunctionType',
      reason: DummySourceReason,
      argumentTypes: [SourceUnitType(DummySourceReason)],
      returnType: SourceIntType(DummySourceReason),
    };
    const lambdaExpression = SourceExpressionLambda({
      location: exampleLocation,
      type: lambdaFunctionType,
      parameters: [],
      captured: {},
      body: intLiteralExpression,
    });
    expect(interpreter.eval(lambdaExpression)).toEqual({
      type: 'functionValue',
      arguments: [],
      body: intLiteralExpression,
      context: EMPTY,
    });
  });

  it('statement block expression evalutes correctly', () => {
    const tuplePattern: TuplePattern = {
      location: exampleLocation,
      type: 'TuplePattern',
      destructedNames: [{ name: SourceId('tuple'), type: SourceIntType(DummySourceReason) }],
    };
    const tuplePatternNull: TuplePattern = {
      location: exampleLocation,
      type: 'TuplePattern',
      destructedNames: [{ type: SourceIntType(DummySourceReason) }],
    };
    const tupleType: SamlangTupleType = {
      type: 'TupleType',
      reason: DummySourceReason,
      mappings: [SourceIntType(DummySourceReason)],
    };
    const tupleExpression: SamlangExpression = SourceExpressionTupleConstructor({
      location: exampleLocation,
      type: tupleType,
      expressions: [intLiteralExpression],
    });
    const tupleStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: tuplePattern,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: tupleExpression,
    };
    const tupleStatementNull: SamlangValStatement = {
      associatedComments: [],
      pattern: tuplePatternNull,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: tupleExpression,
    };
    const objectDestructedNames: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType(DummySourceReason),
      fieldOrder: 0,
      alias: SourceId('f'),
      location: exampleLocation,
    };
    const objectDestructedNamesNoAlias: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType(DummySourceReason),
      fieldOrder: 0,
      location: exampleLocation,
    };
    const objectDestructedNamesFail: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType(DummySourceReason),
      fieldOrder: 0,
      alias: SourceId('f'),
      location: exampleLocation,
    };
    const objectPattern: ObjectPattern = {
      location: exampleLocation,
      type: 'ObjectPattern',
      destructedNames: [objectDestructedNames, objectDestructedNamesNoAlias],
    };
    const objectPatternFail: ObjectPattern = {
      location: exampleLocation,
      type: 'ObjectPattern',
      destructedNames: [objectDestructedNamesFail],
    };
    const objectExpression: SamlangExpression = SourceExpressionFunctionCall({
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Clazz'),
        memberName: SourceId('init'),
      }),
      functionArguments: [intLiteralExpression],
    });
    const objectStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: objectPattern,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: objectExpression,
    };
    const objectStatementFail: SamlangValStatement = {
      associatedComments: [],
      pattern: objectPatternFail,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: objectExpression,
    };
    const variableLocalValues = new Map<string, Value>([['var', true]]);
    const variableContext: InterpretationContext = {
      classes: new Map([
        [
          'Clazz',
          {
            functions: new Map([
              [
                'init',
                {
                  type: 'functionValue',
                  arguments: ['test'],
                  body: (localContext) => ({
                    type: 'object',
                    objectContent: new Map([
                      ['test', checkNotNull(localContext.localValues.get('test'))],
                    ]),
                  }),
                  context: EMPTY,
                },
              ],
              [
                'tag',
                {
                  type: 'functionValue',
                  arguments: ['data'],
                  body: (localContext) => ({
                    type: 'variant',
                    tag: 'tag',
                    data: checkNotNull(localContext.localValues.get('data')),
                  }),
                  context: EMPTY,
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
      localValues: variableLocalValues,
    };
    const variablePattern: VariablePattern = {
      location: exampleLocation,
      type: 'VariablePattern',
      name: 'var',
    };
    const variableExpression: SamlangExpression = SourceExpressionVariable({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      name: 'var',
    });
    const variableStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: variablePattern,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: variableExpression,
    };
    const wildCardPattern: WildCardPattern = { type: 'WildCardPattern', location: exampleLocation };
    const wildCardStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: wildCardPattern,
      location: exampleLocation,
      typeAnnotation: SourceIntType(DummySourceReason),
      assignedExpression: intLiteralExpression,
    };
    const statementBlock: StatementBlock = {
      location: exampleLocation,
      statements: [
        tupleStatement,
        tupleStatementNull,
        objectStatement,
        variableStatement,
        wildCardStatement,
      ],
    };
    const statementBlockWithExpression: StatementBlock = {
      location: exampleLocation,
      statements: [],
      expression: intLiteralExpression,
    };
    const statementBlockFail: StatementBlock = {
      location: exampleLocation,
      statements: [objectStatementFail],
    };
    const statementBlockExpression = SourceExpressionStatementBlock({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      block: statementBlock,
    });
    const statementBlockExpressionWithBlockExpression = SourceExpressionStatementBlock({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      block: statementBlockWithExpression,
    });
    const statementBlockExpressionFail = SourceExpressionStatementBlock({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      block: statementBlockFail,
    });
    const nestedBlockExpressionFail = SourceExpressionStatementBlock({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      block: {
        location: exampleLocation,
        statements: [
          {
            associatedComments: [],
            pattern: {
              type: 'VariablePattern',
              name: 'diffVar',
              location: exampleLocation,
            },
            typeAnnotation: SourceIntType(DummySourceReason),
            assignedExpression: SourceExpressionStatementBlock({
              location: exampleLocation,
              type: SourceIntType(DummySourceReason),
              block: {
                location: exampleLocation,
                statements: [
                  {
                    associatedComments: [],
                    pattern: variablePattern,
                    location: exampleLocation,
                    typeAnnotation: SourceIntType(DummySourceReason),
                    assignedExpression: intLiteralExpression,
                  },
                ],
                expression: variableExpression,
              },
            }),
            location: exampleLocation,
          },
          variableStatement,
        ],
      },
    });
    const nestedBlockExpressionPass = SourceExpressionStatementBlock({
      location: exampleLocation,
      type: SourceIntType(DummySourceReason),
      block: {
        location: exampleLocation,
        statements: [
          {
            associatedComments: [],
            pattern: variablePattern,
            typeAnnotation: SourceIntType(DummySourceReason),
            assignedExpression: intLiteralExpression,
            location: exampleLocation,
          },
        ],
        expression: variableExpression,
      },
    });
    expect(interpreter.eval(statementBlockExpression, variableContext)).toEqual({ type: 'unit' });
    expect(() => interpreter.eval(nestedBlockExpressionFail)).toThrow('Missing variable var');
    expect(interpreter.eval(statementBlockExpressionWithBlockExpression)).toEqual(5);
    expect(interpreter.eval(nestedBlockExpressionPass)).toEqual(5);
    expect(() => interpreter.eval(statementBlockExpressionFail)).toThrow('');
  });
});
