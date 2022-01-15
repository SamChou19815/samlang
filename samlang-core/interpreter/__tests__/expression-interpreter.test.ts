// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/32
// @origin https://github.com/SamChou19815/samlang/pull/34

import { ModuleReference, Position, Range } from '../../ast/common-nodes';
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

    const samlangExpression = SourceExpressionTrue(new Range(Position(1, 2), Position(3, 4)));
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
    const testFunctions: Record<string, FunctionValue> = {};
    const testMethods: Record<string, FunctionValue> = {};
    const samlangExpression = SourceExpressionTrue(new Range(Position(1, 2), Position(3, 4)));
    const functionValue: FunctionValue = {
      type: 'functionValue',
      arguments: [],
      body: samlangExpression,
      context: EMPTY,
    };
    testFunctions.function1 = functionValue;
    testMethods.method1 = functionValue;
    const testClassValue = { functions: testFunctions, methods: testMethods };
    const testClasses: Record<string, ClassValue> = {};
    testClasses.class1 = testClassValue;
    const testLocalValues: Record<string, Value> = {};
    testLocalValues.v1 = { type: 'unit' };
    const testContext = { classes: testClasses, localValues: testLocalValues };

    expect(testContext).toEqual(testContext);
  });

  const interpreter = new ExpressionInterpreter();

  const exampleRange: Range = new Range(Position(1, 2), Position(3, 4));
  const intLiteralExpression: SamlangExpression = SourceExpressionInt(5, exampleRange);
  const intLiteralValue: Value = 5;
  const stringLiteralExpression: SamlangExpression = SourceExpressionString('value', exampleRange);
  const stringLiteralValue: Value = 'value';
  const boolLiteralExpression: SamlangExpression = SourceExpressionTrue(exampleRange);
  const boolLiteralValue: Value = true;
  const classMemberFunction: Value = {
    type: 'functionValue',
    arguments: [],
    body: SourceExpressionInt(5, exampleRange),
    context: EMPTY,
  };
  const functionType: SamlangFunctionType = {
    type: 'FunctionType',
    argumentTypes: [SourceUnitType],
    returnType: SourceStringType,
  };
  const objectConstructorExpressionNonEmpty = SourceExpressionFunctionCall({
    type: SourceIntType,
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
    range: exampleRange,
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
    const thisExpression = SourceExpressionThis({ range: exampleRange, type: SourceBoolType });
    const thisLocalValues: Record<string, Value> = {};
    thisLocalValues.this = true;
    const thisContext = { classes: {}, localValues: thisLocalValues };
    expect(interpreter.eval(thisExpression, thisContext)).toEqual(boolLiteralValue);
    expect(() => interpreter.eval(thisExpression)).toThrow('Missing `this`');
  });

  it('variable expressions evaluate correctly', () => {
    const variableExpression = SourceExpressionVariable({
      range: exampleRange,
      type: SourceBoolType,
      name: 'test',
    });
    const variableLocalValues: Record<string, Value> = {};
    variableLocalValues.test = boolLiteralValue;
    const variableContext = { classes: {}, localValues: variableLocalValues };
    expect(interpreter.eval(variableExpression, variableContext)).toEqual(boolLiteralValue);
    expect(() => interpreter.eval(variableExpression)).toThrow(
      `Missing variable ${variableExpression.name}`
    );
  });

  it('class member expressions evaluate correctly', () => {
    const classMemberExpression = SourceExpressionClassMember({
      range: exampleRange,
      type: SourceBoolType,
      typeArguments: [SourceBoolType],
      moduleReference: ModuleReference.DUMMY,
      className: SourceId('myClass'),
      memberName: SourceId('func'),
    });
    const classMemberClasses: Record<string, ClassValue> = {};
    const classMemberFunctions: Record<string, FunctionValue> = {};
    classMemberFunctions.func = classMemberFunction;
    const classMemberClassValue = { functions: classMemberFunctions, methods: {} };
    classMemberClasses.myClass = classMemberClassValue;
    const classMemberContext = { classes: classMemberClasses, localValues: {} };
    expect(interpreter.eval(classMemberExpression, classMemberContext)).toEqual(
      classMemberFunction
    );
    expect(() => interpreter.eval(classMemberExpression)).toThrow('');
  });

  it('tuple expression evaluates correctly', () => {
    const tupleExpression = SourceExpressionTupleConstructor({
      range: exampleRange,
      type: { type: 'TupleType', mappings: [SourceIntType] },
      expressions: [intLiteralExpression],
    });
    const tupleExpressionMultiple = SourceExpressionTupleConstructor({
      range: exampleRange,
      type: { type: 'TupleType', mappings: [SourceIntType, SourceBoolType] },
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
      type: SourceIntType,
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
      classes: {
        Clazz: {
          functions: {
            init: {
              type: 'functionValue',
              arguments: ['test'],
              body: (localContext) => ({
                type: 'object',
                objectContent: new Map([['test', checkNotNull(localContext.localValues['test'])]]),
              }),
              context: EMPTY,
            },
          },
          methods: {},
        },
      },
      localValues: {},
    };
    expect(() => interpreter.eval(objectConstructorExpressionEmpty)).toThrow();
    expect(interpreter.eval(objectConstructorExpressionNonEmpty, context)).toEqual({
      type: 'object',
      objectContent: objectContentNonEmpty,
    });
  });

  it('variant expression evaluates correctly', () => {
    const variantExpression = SourceExpressionFunctionCall({
      type: SourceIntType,
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
      classes: {
        Clazz: {
          functions: {
            tag: {
              type: 'functionValue',
              arguments: ['data'],
              body: (localContext) => ({
                type: 'variant',
                tag: 'tag',
                data: checkNotNull(localContext.localValues['data']),
              }),
              context: EMPTY,
            },
          },
          methods: {},
        },
      },
      localValues: {},
    };
    expect(interpreter.eval(variantExpression, context)).toEqual({
      type: 'variant',
      tag: 'tag',
      data: 5,
    });
  });

  it('field access expression evaluates correctly', () => {
    const fieldAccessExpression = SourceExpressionFieldAccess({
      range: exampleRange,
      type: SourceIntType,
      expression: objectConstructorExpressionNonEmpty,
      fieldName: SourceId('test'),
      fieldOrder: 0,
    });
    const fieldAccessExpressionFail = SourceExpressionFieldAccess({
      range: exampleRange,
      type: SourceIntType,
      expression: stringLiteralExpression,
      fieldName: SourceId('test'),
      fieldOrder: 0,
    });
    const context: InterpretationContext = {
      classes: {
        Clazz: {
          functions: {
            init: {
              type: 'functionValue',
              arguments: ['test'],
              body: (localContext) => ({
                type: 'object',
                objectContent: new Map([['test', checkNotNull(localContext.localValues['test'])]]),
              }),
              context: EMPTY,
            },
          },
          methods: {},
        },
      },
      localValues: {},
    };
    expect(interpreter.eval(fieldAccessExpression, context)).toEqual(intLiteralValue);
    expect(() => interpreter.eval(fieldAccessExpressionFail, context)).toThrow('');
  });

  it('method access expression evaluates correctly', () => {
    const identifier = SourceIdentifierType(ModuleReference.DUMMY, 'method', []);
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
      range: exampleRange,
      type: identifier,
      expression: identifierExpression,
      methodName: SourceId('method'),
    });
    const methodAccessMethods: Record<string, FunctionValue> = {};
    methodAccessMethods.method = classMemberFunction;
    const methodAccessClass = {
      functions: {},
      methods: methodAccessMethods,
    };
    const methodAccessClasses: Record<string, ClassValue> = {};
    methodAccessClasses.method = methodAccessClass;
    methodAccessClasses.Clazz = {
      functions: {
        tag: {
          type: 'functionValue',
          arguments: ['data'],
          body: (localContext) => ({
            type: 'variant',
            tag: 'tag',
            data: checkNotNull(localContext.localValues['data']),
          }),
          context: EMPTY,
        },
      },
      methods: {},
    };
    const methodAccessContext: InterpretationContext = {
      classes: methodAccessClasses,
      localValues: {},
    };
    expect(interpreter.eval(methodAccessExpression, methodAccessContext)).toEqual(
      classMemberFunction
    );
    delete methodAccessClasses.method;
    expect(() => interpreter.eval(methodAccessExpression, methodAccessContext)).toThrow('');
    delete methodAccessClasses.Clazz;
    expect(() => interpreter.eval(methodAccessExpression, methodAccessContext)).toThrow('');
  });

  it('unary expression evaluates correctly', () => {
    const unaryExpressionNeg = SourceExpressionUnary({
      range: exampleRange,
      type: SourceIntType,
      operator: '-',
      expression: intLiteralExpression,
    });
    const unaryExpressionNot = SourceExpressionUnary({
      range: exampleRange,
      type: SourceIntType,
      operator: '!',
      expression: boolLiteralExpression,
    });
    expect(interpreter.eval(unaryExpressionNeg)).toEqual(-5);
    expect(interpreter.eval(unaryExpressionNot)).toEqual(false);
  });

  it('panic expression evaluates correctly', () => {
    const panicExpression = SourceExpressionFunctionCall({
      range: exampleRange,
      type: SourceStringType,
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
      range: exampleRange,
      type: SourceStringType,
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
      range: exampleRange,
      type: SourceStringType,
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
      range: exampleRange,
      type: SourceIntType,
      functionExpression: SourceExpressionClassMember({
        type: functionType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('intToString'),
      }),
      functionArguments: [SourceExpressionString('5', exampleRange)],
    });
    const printlnFunctionCall = SourceExpressionFunctionCall({
      range: exampleRange,
      type: SourceStringType,
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
      range: exampleRange,
      type: functionType,
      parameters: [[SourceId('arg1'), SourceStringType]],
      captured: {},
      body: stringLiteralExpression,
    });
    const functionCallExpressionNoArgs = SourceExpressionFunctionCall({
      range: exampleRange,
      type: SourceStringType,
      functionExpression,
      functionArguments: [],
    });
    const functionCallExpressionWithArgs = SourceExpressionFunctionCall({
      range: exampleRange,
      type: SourceStringType,
      functionExpression: functionExpressionWithArgs,
      functionArguments: [stringLiteralExpression],
    });
    expect(interpreter.eval(functionCallExpressionNoArgs)).toEqual(stringLiteralValue);
    expect(interpreter.eval(functionCallExpressionWithArgs)).toEqual(stringLiteralValue);
  });

  it('binary expression evaluates correctly', () => {
    const binExpressionMul = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: MUL,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionDiv = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: DIV,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionDiv0 = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: DIV,
      e1: intLiteralExpression,
      e2: SourceExpressionInt(0, exampleRange),
    });
    const binExpressionMod = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: MOD,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionMod0 = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: MOD,
      e1: intLiteralExpression,
      e2: SourceExpressionInt(0, exampleRange),
    });
    const binExpressionAdd = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: PLUS,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionSub = SourceExpressionBinary({
      type: SourceIntType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: MINUS,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionLt = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: LT,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionLe = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: LE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionGt = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: GT,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionGe = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: GE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionEq = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: EQ,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionEqfn = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: EQ,
      e1: functionExpression,
      e2: functionExpression,
    });
    const binExpressionNe = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: NE,
      e1: intLiteralExpression,
      e2: intLiteralExpression,
    });
    const binExpressionNefn = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: NE,
      e1: functionExpression,
      e2: intLiteralExpression,
    });
    const binExpressionAnd = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: AND,
      e1: boolLiteralExpression,
      e2: boolLiteralExpression,
    });
    const binExpressionAndFalse = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: AND,
      e1: SourceExpressionFalse(exampleRange),
      e2: boolLiteralExpression,
    });
    const binExpressionOr = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: OR,
      e1: boolLiteralExpression,
      e2: boolLiteralExpression,
    });
    const binExpressionOrFalse = SourceExpressionBinary({
      type: SourceBoolType,
      range: exampleRange,
      operatorPrecedingComments: [],
      operator: OR,
      e1: SourceExpressionFalse(exampleRange),
      e2: boolLiteralExpression,
    });
    const binExpressionConcat = SourceExpressionBinary({
      type: SourceStringType,
      range: exampleRange,
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
      type: SourceStringType,
      range: exampleRange,
      boolExpression: boolLiteralExpression,
      e1: SourceExpressionString('true branch', exampleRange),
      e2: SourceExpressionString('false branch', exampleRange),
    });
    const ifElseExpressionFalse = SourceExpressionIfElse({
      type: SourceStringType,
      range: exampleRange,
      boolExpression: SourceExpressionFalse(exampleRange),
      e1: SourceExpressionString('true branch', exampleRange),
      e2: SourceExpressionString('false branch', exampleRange),
    });
    expect(interpreter.eval(ifElseExpressionTrue)).toEqual('true branch');
    expect(interpreter.eval(ifElseExpressionFalse)).toEqual('false branch');
  });

  it('matching list evaluates correctly', () => {
    const matchingList: VariantPatternToExpression[] = [
      {
        range: exampleRange,
        tag: SourceId('tag'),
        tagOrder: 0,
        expression: stringLiteralExpression,
        dataVariable: [SourceId('data'), SourceIntType],
      },
    ];
    const matchingListNoData: VariantPatternToExpression[] = [
      {
        range: exampleRange,
        tag: SourceId('tag'),
        tagOrder: 0,
        expression: stringLiteralExpression,
      },
    ];
    const matchedExpression = SourceExpressionFunctionCall({
      type: SourceIntType,
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
      range: exampleRange,
      type: SourceStringType,
      matchedExpression,
      matchingList,
    });
    const matchExpressionNoData = SourceExpressionMatch({
      range: exampleRange,
      type: SourceStringType,
      matchedExpression,
      matchingList: matchingListNoData,
    });
    const matchExpressionFail = SourceExpressionMatch({
      range: exampleRange,
      type: SourceStringType,
      matchedExpression,
      matchingList: [],
    });
    const context: InterpretationContext = {
      classes: {
        Clazz: {
          functions: {
            tag: {
              type: 'functionValue',
              arguments: ['data'],
              body: (localContext) => ({
                type: 'variant',
                tag: 'tag',
                data: checkNotNull(localContext.localValues['data']),
              }),
              context: EMPTY,
            },
          },
          methods: {},
        },
      },
      localValues: {},
    };
    expect(interpreter.eval(matchExpression, context)).toEqual(stringLiteralValue);
    expect(interpreter.eval(matchExpressionNoData, context)).toEqual(stringLiteralValue);
    expect(() => interpreter.eval(matchExpressionFail, context)).toThrow('');
  });

  it('lambda expression evaluates correctly', () => {
    const lambdaFunctionType: SamlangFunctionType = {
      type: 'FunctionType',
      argumentTypes: [SourceUnitType],
      returnType: SourceIntType,
    };
    const lambdaExpression = SourceExpressionLambda({
      range: exampleRange,
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
      range: exampleRange,
      type: 'TuplePattern',
      destructedNames: [{ name: SourceId('tuple'), type: SourceIntType }],
    };
    const tuplePatternNull: TuplePattern = {
      range: exampleRange,
      type: 'TuplePattern',
      destructedNames: [{ type: SourceIntType }],
    };
    const tupleType: SamlangTupleType = { type: 'TupleType', mappings: [SourceIntType] };
    const tupleExpression: SamlangExpression = SourceExpressionTupleConstructor({
      range: exampleRange,
      type: tupleType,
      expressions: [intLiteralExpression],
    });
    const tupleStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: tuplePattern,
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: tupleExpression,
    };
    const tupleStatementNull: SamlangValStatement = {
      associatedComments: [],
      pattern: tuplePatternNull,
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: tupleExpression,
    };
    const objectDestructedNames: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType,
      fieldOrder: 0,
      alias: SourceId('f'),
      range: exampleRange,
    };
    const objectDestructedNamesNoAlias: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType,
      fieldOrder: 0,
      range: exampleRange,
    };
    const objectDestructedNamesFail: ObjectPatternDestucturedName = {
      fieldName: SourceId('test'),
      type: SourceIntType,
      fieldOrder: 0,
      alias: SourceId('f'),
      range: exampleRange,
    };
    const objectPattern: ObjectPattern = {
      range: exampleRange,
      type: 'ObjectPattern',
      destructedNames: [objectDestructedNames, objectDestructedNamesNoAlias],
    };
    const objectPatternFail: ObjectPattern = {
      range: exampleRange,
      type: 'ObjectPattern',
      destructedNames: [objectDestructedNamesFail],
    };
    const objectExpression: SamlangExpression = SourceExpressionFunctionCall({
      type: SourceIntType,
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
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: objectExpression,
    };
    const objectStatementFail: SamlangValStatement = {
      associatedComments: [],
      pattern: objectPatternFail,
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: objectExpression,
    };
    const variableLocalValues: Record<string, Value> = {};
    variableLocalValues.var = true;
    const variableContext: InterpretationContext = {
      classes: {
        Clazz: {
          functions: {
            init: {
              type: 'functionValue',
              arguments: ['test'],
              body: (localContext) => ({
                type: 'object',
                objectContent: new Map([['test', checkNotNull(localContext.localValues['test'])]]),
              }),
              context: EMPTY,
            },
            tag: {
              type: 'functionValue',
              arguments: ['data'],
              body: (localContext) => ({
                type: 'variant',
                tag: 'tag',
                data: checkNotNull(localContext.localValues['data']),
              }),
              context: EMPTY,
            },
          },
          methods: {},
        },
      },
      localValues: variableLocalValues,
    };
    const variablePattern: VariablePattern = {
      range: exampleRange,
      type: 'VariablePattern',
      name: 'var',
    };
    const variableExpression: SamlangExpression = SourceExpressionVariable({
      range: exampleRange,
      type: SourceIntType,
      name: 'var',
    });
    const variableStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: variablePattern,
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: variableExpression,
    };
    const wildCardPattern: WildCardPattern = { type: 'WildCardPattern', range: exampleRange };
    const wildCardStatement: SamlangValStatement = {
      associatedComments: [],
      pattern: wildCardPattern,
      range: exampleRange,
      typeAnnotation: SourceIntType,
      assignedExpression: intLiteralExpression,
    };
    const statementBlock: StatementBlock = {
      range: exampleRange,
      statements: [
        tupleStatement,
        tupleStatementNull,
        objectStatement,
        variableStatement,
        wildCardStatement,
      ],
    };
    const statementBlockWithExpression: StatementBlock = {
      range: exampleRange,
      statements: [],
      expression: intLiteralExpression,
    };
    const statementBlockFail: StatementBlock = {
      range: exampleRange,
      statements: [objectStatementFail],
    };
    const statementBlockExpression = SourceExpressionStatementBlock({
      range: exampleRange,
      type: SourceIntType,
      block: statementBlock,
    });
    const statementBlockExpressionWithBlockExpression = SourceExpressionStatementBlock({
      range: exampleRange,
      type: SourceIntType,
      block: statementBlockWithExpression,
    });
    const statementBlockExpressionFail = SourceExpressionStatementBlock({
      range: exampleRange,
      type: SourceIntType,
      block: statementBlockFail,
    });
    const nestedBlockExpressionFail = SourceExpressionStatementBlock({
      range: exampleRange,
      type: SourceIntType,
      block: {
        range: exampleRange,
        statements: [
          {
            associatedComments: [],
            pattern: {
              type: 'VariablePattern',
              name: 'diffVar',
              range: exampleRange,
            },
            typeAnnotation: SourceIntType,
            assignedExpression: SourceExpressionStatementBlock({
              range: exampleRange,
              type: SourceIntType,
              block: {
                range: exampleRange,
                statements: [
                  {
                    associatedComments: [],
                    pattern: variablePattern,
                    range: exampleRange,
                    typeAnnotation: SourceIntType,
                    assignedExpression: intLiteralExpression,
                  },
                ],
                expression: variableExpression,
              },
            }),
            range: exampleRange,
          },
          variableStatement,
        ],
      },
    });
    const nestedBlockExpressionPass = SourceExpressionStatementBlock({
      range: exampleRange,
      type: SourceIntType,
      block: {
        range: exampleRange,
        statements: [
          {
            associatedComments: [],
            pattern: variablePattern,
            typeAnnotation: SourceIntType,
            assignedExpression: intLiteralExpression,
            range: exampleRange,
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
