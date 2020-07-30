import {
  MUL,
  DIV,
  MOD,
  PLUS,
  MINUS,
  LT,
  LE,
  GT,
  GE,
  EQ,
  NE,
  AND,
  CONCAT,
  OR,
} from '../../ast/common/binary-operators';
import Position from '../../ast/common/position';
import Range from '../../ast/common/range';
import {
  boolType,
  intType,
  stringType,
  unitType,
  FunctionType,
  identifierType,
  TupleType,
} from '../../ast/common/types';
import {
  SamlangExpression,
  EXPRESSION_INT,
  EXPRESSION_STRING,
  EXPRESSION_TRUE,
  EXPRESSION_THIS,
  EXPRESSION_VARIABLE,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_OBJECT_CONSTRUCTOR,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_FIELD_ACCESS,
  EXPRESSION_METHOD_ACCESS,
  EXPRESSION_UNARY,
  EXPRESSION_BUILTIN_FUNCTION_CALL,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_FALSE,
  EXPRESSION_MATCH,
  VariantPatternToExpression,
  EXPRESSION_LAMBDA,
  EXPRESSION_PANIC,
  EXPRESSION_STATEMENT_BLOCK,
  StatementBlock,
  SamlangValStatement,
} from '../../ast/lang/samlang-expressions';
import {
  TuplePattern,
  ObjectPattern,
  ObjectPatternDestucturedName,
  VariablePattern,
  WildCardPattern,
} from '../../ast/lang/samlang-pattern';
import ExpressionInterpreter from '../expression-interpreter';
import { ClassValue, EMPTY, InterpretationContext } from '../interpretation-context';
import { isSameValue, Value, FunctionValue } from '../value';

const interpreter = new ExpressionInterpreter();

const exampleRange: Range = new Range(new Position(1, 2), new Position(3, 4));
const intLiteralExpression: SamlangExpression = EXPRESSION_INT(exampleRange, BigInt(5));
const stringLiteralExpression: SamlangExpression = EXPRESSION_STRING(exampleRange, 'value');
const boolLiteralExpression: SamlangExpression = EXPRESSION_TRUE(exampleRange);
const classMemberFunction: Value = {
  type: 'functionValue',
  arguments: [],
  body: EXPRESSION_INT(exampleRange, BigInt(5)),
  context: EMPTY,
};
const objectConstructorExpressionNonEmpty = EXPRESSION_OBJECT_CONSTRUCTOR({
  range: exampleRange,
  type: intType,
  fieldDeclarations: [
    { range: exampleRange, type: intType, name: 'test', expression: intLiteralExpression },
  ],
});
const functionType: FunctionType = {
  type: 'FunctionType',
  argumentTypes: [unitType],
  returnType: stringType,
};
const functionExpression = EXPRESSION_LAMBDA({
  range: exampleRange,
  type: functionType,
  parameters: [],
  captured: {},
  body: stringLiteralExpression,
});

it('literal expressions evaluate correctly', () => {
  expect(
    isSameValue(interpreter.eval(intLiteralExpression), { type: 'int', value: 5 })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(stringLiteralExpression), { type: 'string', value: 'value' })
  );
  expect(isSameValue(interpreter.eval(boolLiteralExpression), { type: 'bool', value: true }));
});

it('this expressions evaluate correctly', () => {
  const thisExpression = EXPRESSION_THIS({ range: exampleRange, type: boolType });
  const thisLocalValues = new Map<string, Value>();
  thisLocalValues.set('this', { type: 'bool', value: true });
  const thisContext = { classes: new Map(), localValues: thisLocalValues };
  expect(
    isSameValue(interpreter.eval(thisExpression, thisContext), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(() => interpreter.eval(thisExpression)).toThrow('Missing `this`');
});

it('variable expressions evaluate correctly', () => {
  const variableExpression = EXPRESSION_VARIABLE({
    range: exampleRange,
    type: boolType,
    name: 'test',
  });
  const variableLocalValues = new Map<string, Value>();
  variableLocalValues.set('test', { type: 'bool', value: true });
  const variableContext = { classes: new Map(), localValues: variableLocalValues };
  expect(
    isSameValue(interpreter.eval(variableExpression, variableContext), {
      type: 'bool',
      value: true,
    })
  ).toBeTruthy();
  expect(() => interpreter.eval(variableExpression)).toThrow(
    `Missing variable ${variableExpression.name}`
  );
});

it('class member expressions evaluate correctly', () => {
  const classMemberExpression = EXPRESSION_CLASS_MEMBER({
    range: exampleRange,
    type: boolType,
    typeArguments: [boolType],
    className: 'myClass',
    classNameRange: exampleRange,
    memberName: 'func',
    memberNameRange: exampleRange,
  });
  const classMemberClasses = new Map<string, ClassValue>();
  const classMemberFunctions = new Map<string, FunctionValue>();
  classMemberFunctions.set('func', classMemberFunction);
  const classMemberClassValue = { functions: classMemberFunctions, methods: new Map() };
  classMemberClasses.set('myClass', classMemberClassValue);
  const classMemberContext = { classes: classMemberClasses, localValues: new Map() };
  expect(
    isSameValue(interpreter.eval(classMemberExpression, classMemberContext), classMemberFunction)
  ).toBeTruthy();
  expect(() => interpreter.eval(classMemberExpression)).toThrow('');
});

it('tuple expression evaluates correctly', () => {
  const tupleExpression = EXPRESSION_TUPLE_CONSTRUCTOR({
    range: exampleRange,
    type: { type: 'TupleType', mappings: [intType] },
    expressions: [intLiteralExpression],
  });
  const tupleExpressionMultiple = EXPRESSION_TUPLE_CONSTRUCTOR({
    range: exampleRange,
    type: { type: 'TupleType', mappings: [intType, boolType] },
    expressions: [intLiteralExpression, boolLiteralExpression],
  });
  expect(
    isSameValue(interpreter.eval(tupleExpression), {
      type: 'tuple',
      tupleContent: [{ type: 'int', value: 5 }],
    })
  );
  expect(
    isSameValue(interpreter.eval(tupleExpressionMultiple), {
      type: 'tuple',
      tupleContent: [
        { type: 'int', value: 5 },
        { type: 'bool', value: true },
      ],
    })
  ).toBeTruthy();
});

it('object expression evaluates correctly', () => {
  const objectConstructorExpressionEmpty = EXPRESSION_OBJECT_CONSTRUCTOR({
    range: exampleRange,
    type: intType,
    fieldDeclarations: [{ range: exampleRange, type: intType, name: 'test' }],
  });
  const objectContentNonEmpty = new Map();
  objectContentNonEmpty.set('test', { type: 'int', value: 5 });
  expect(
    isSameValue(interpreter.eval(objectConstructorExpressionEmpty), {
      type: 'object',
      objectContent: new Map(),
    })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(objectConstructorExpressionNonEmpty), {
      type: 'object',
      objectContent: objectContentNonEmpty,
    })
  ).toBeTruthy();
});

it('variant expression evaluates correctly', () => {
  const variantExpression = EXPRESSION_VARIANT_CONSTRUCTOR({
    range: exampleRange,
    type: intType,
    tag: 'tag',
    tagOrder: 0,
    data: intLiteralExpression,
  });
  expect(
    isSameValue(interpreter.eval(variantExpression), {
      type: 'variant',
      tag: 'tag',
      data: { type: 'int', value: 5 },
    })
  ).toBeTruthy();
});

it('field access expression evaluates correctly', () => {
  const fieldAccessExpression = EXPRESSION_FIELD_ACCESS({
    range: exampleRange,
    type: intType,
    expression: objectConstructorExpressionNonEmpty,
    fieldName: 'test',
    fieldOrder: 0,
  });
  const fieldAccessExpressionFail = EXPRESSION_FIELD_ACCESS({
    range: exampleRange,
    type: intType,
    expression: stringLiteralExpression,
    fieldName: 'test',
    fieldOrder: 0,
  });
  expect(
    isSameValue(interpreter.eval(fieldAccessExpression), { type: 'int', value: 5 })
  ).toBeTruthy();
  expect(() => interpreter.eval(fieldAccessExpressionFail)).toThrow('');
});

it('method access expression evaluates correctly', () => {
  const identifier = identifierType('method', []);
  const identifierExpression = EXPRESSION_VARIANT_CONSTRUCTOR({
    range: exampleRange,
    type: identifier,
    tag: 'tag',
    tagOrder: 0,
    data: intLiteralExpression,
  });
  const methodAccessExpression = EXPRESSION_METHOD_ACCESS({
    range: exampleRange,
    type: identifier,
    expression: identifierExpression,
    methodName: 'method',
  });
  const methodAccessMethods = new Map<string, FunctionValue>();
  methodAccessMethods.set('method', classMemberFunction);
  const methodAccessClass = {
    functions: new Map<string, FunctionValue>(),
    methods: methodAccessMethods,
  };
  const methodAccessClasses = new Map<string, ClassValue>();
  methodAccessClasses.set('method', methodAccessClass);
  const methodAccessContext: InterpretationContext = {
    classes: methodAccessClasses,
    localValues: new Map<string, Value>(),
  };
  expect(
    isSameValue(interpreter.eval(methodAccessExpression, methodAccessContext), classMemberFunction)
  ).toBeTruthy();
  expect(() => interpreter.eval(methodAccessExpression)).toThrow('');
});

it('unary expression evaluates correctly', () => {
  const unaryExpressionNeg = EXPRESSION_UNARY({
    range: exampleRange,
    type: intType,
    operator: '-',
    expression: intLiteralExpression,
  });
  const unaryExpressionNot = EXPRESSION_UNARY({
    range: exampleRange,
    type: intType,
    operator: '!',
    expression: boolLiteralExpression,
  });
  expect(
    isSameValue(interpreter.eval(unaryExpressionNeg), { type: 'int', value: -5 })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(unaryExpressionNot), { type: 'bool', value: false })
  ).toBeTruthy();
});

it('panic expression evaluates correctly', () => {
  const panicExpression = EXPRESSION_PANIC({
    range: exampleRange,
    type: stringType,
    expression: stringLiteralExpression,
  });
  expect(() => interpreter.eval(panicExpression)).toThrow('value');
});

it('built in function call expression evaluates correctly', () => {
  const stringToIntFunctionCall = EXPRESSION_BUILTIN_FUNCTION_CALL({
    range: exampleRange,
    type: stringType,
    functionName: 'stringToInt',
    argumentExpression: intLiteralExpression,
  });
  const stringToIntFunctionCallFail = EXPRESSION_BUILTIN_FUNCTION_CALL({
    range: exampleRange,
    type: stringType,
    functionName: 'stringToInt',
    argumentExpression: stringLiteralExpression,
  });
  const intToStringFunctionCall = EXPRESSION_BUILTIN_FUNCTION_CALL({
    range: exampleRange,
    type: intType,
    functionName: 'intToString',
    argumentExpression: EXPRESSION_STRING(exampleRange, '5'),
  });
  const printlnFunctionCall = EXPRESSION_BUILTIN_FUNCTION_CALL({
    range: exampleRange,
    type: stringType,
    functionName: 'println',
    argumentExpression: stringLiteralExpression,
  });
  expect(
    isSameValue(interpreter.eval(stringToIntFunctionCall), { type: 'int', value: 5 })
  ).toBeTruthy();
  expect(() => interpreter.eval(stringToIntFunctionCallFail)).toThrow(
    `Cannot convert \`${stringLiteralExpression.literal.value}\` to int.`
  );
  expect(
    isSameValue(interpreter.eval(intToStringFunctionCall), { type: 'string', value: '5' })
  ).toBeTruthy();
  expect(isSameValue(interpreter.eval(printlnFunctionCall), { type: 'unit' })).toBeTruthy();
});

it('function expression evaluates correctly', () => {
  const functionExpressionWithArgs = EXPRESSION_LAMBDA({
    range: exampleRange,
    type: functionType,
    parameters: [['arg1', stringType]],
    captured: {},
    body: stringLiteralExpression,
  });
  const functionCallExpressionNoArgs = EXPRESSION_FUNCTION_CALL({
    range: exampleRange,
    type: stringType,
    functionExpression,
    functionArguments: [],
  });
  const functionCallExpressionWithArgs = EXPRESSION_FUNCTION_CALL({
    range: exampleRange,
    type: stringType,
    functionExpression: functionExpressionWithArgs,
    functionArguments: [stringLiteralExpression],
  });
  expect(
    isSameValue(interpreter.eval(functionCallExpressionNoArgs), { type: 'string', value: 'value' })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(functionCallExpressionWithArgs), {
      type: 'string',
      value: 'value',
    })
  ).toBeTruthy();
});

it('binary expression evaluates correctly', () => {
  const binExpressionMul = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: MUL,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionDiv = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: DIV,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionDiv0 = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: DIV,
    e1: intLiteralExpression,
    e2: EXPRESSION_INT(exampleRange, BigInt(0)),
  });
  const binExpressionMod = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: MOD,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionMod0 = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: MOD,
    e1: intLiteralExpression,
    e2: EXPRESSION_INT(exampleRange, BigInt(0)),
  });
  const binExpressionAdd = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: PLUS,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionSub = EXPRESSION_BINARY({
    type: intType,
    range: exampleRange,
    operator: MINUS,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionLt = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: LT,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionLe = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: LE,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionGt = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: GT,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionGe = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: GE,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionEq = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: EQ,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionEqfn = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: EQ,
    e1: functionExpression,
    e2: functionExpression,
  });
  const binExpressionNe = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: NE,
    e1: intLiteralExpression,
    e2: intLiteralExpression,
  });
  const binExpressionNefn = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: NE,
    e1: functionExpression,
    e2: intLiteralExpression,
  });
  const binExpressionAnd = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: AND,
    e1: boolLiteralExpression,
    e2: boolLiteralExpression,
  });
  const binExpressionAndFalse = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: AND,
    e1: EXPRESSION_FALSE(exampleRange),
    e2: boolLiteralExpression,
  });
  const binExpressionOr = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: OR,
    e1: boolLiteralExpression,
    e2: boolLiteralExpression,
  });
  const binExpressionOrFalse = EXPRESSION_BINARY({
    type: boolType,
    range: exampleRange,
    operator: OR,
    e1: EXPRESSION_FALSE(exampleRange),
    e2: boolLiteralExpression,
  });
  const binExpressionConcat = EXPRESSION_BINARY({
    type: stringType,
    range: exampleRange,
    operator: CONCAT,
    e1: stringLiteralExpression,
    e2: stringLiteralExpression,
  });
  expect(isSameValue(interpreter.eval(binExpressionMul), { type: 'int', value: 25 })).toBeTruthy();
  expect(isSameValue(interpreter.eval(binExpressionDiv), { type: 'int', value: 1 })).toBeTruthy();
  expect(() => interpreter.eval(binExpressionDiv0)).toThrow('Division by zero!');
  expect(isSameValue(interpreter.eval(binExpressionMod), { type: 'int', value: 0 })).toBeTruthy();
  expect(() => interpreter.eval(binExpressionMod0)).toThrow('Mod by zero!');
  expect(isSameValue(interpreter.eval(binExpressionAdd), { type: 'int', value: 10 })).toBeTruthy();
  expect(isSameValue(interpreter.eval(binExpressionSub), { type: 'int', value: 0 })).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionLt), { type: 'bool', value: false })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionLe), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionGt), { type: 'bool', value: false })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionGe), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionEq), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(() => interpreter.eval(binExpressionEqfn)).toThrow('Cannot compare functions!');
  expect(
    isSameValue(interpreter.eval(binExpressionNe), { type: 'bool', value: false })
  ).toBeTruthy();
  expect(() => interpreter.eval(binExpressionNefn)).toThrow('Cannot compare functions!');
  expect(
    isSameValue(interpreter.eval(binExpressionAnd), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionAndFalse), { type: 'bool', value: false })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionOr), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionOrFalse), { type: 'bool', value: true })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(binExpressionConcat), { type: 'string', value: 'valuevalue' })
  ).toBeTruthy();
});

it('if else expression evaluates correctly', () => {
  const ifElseExpressionTrue = EXPRESSION_IF_ELSE({
    type: stringType,
    range: exampleRange,
    boolExpression: boolLiteralExpression,
    e1: EXPRESSION_STRING(exampleRange, 'true branch'),
    e2: EXPRESSION_STRING(exampleRange, 'false branch'),
  });
  const ifElseExpressionFalse = EXPRESSION_IF_ELSE({
    type: stringType,
    range: exampleRange,
    boolExpression: EXPRESSION_FALSE(exampleRange),
    e1: EXPRESSION_STRING(exampleRange, 'true branch'),
    e2: EXPRESSION_STRING(exampleRange, 'false branch'),
  });
  expect(
    isSameValue(interpreter.eval(ifElseExpressionTrue), { type: 'string', value: 'true branch' })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(ifElseExpressionFalse), { type: 'string', value: 'false branch' })
  ).toBeTruthy();
});

it('matching list evaluates correctly', () => {
  const matchingList: VariantPatternToExpression[] = [
    {
      range: exampleRange,
      tag: 'tag',
      tagOrder: 0,
      expression: stringLiteralExpression,
      dataVariable: 'data',
    },
  ];
  const matchingListNoData: VariantPatternToExpression[] = [
    { range: exampleRange, tag: 'tag', tagOrder: 0, expression: stringLiteralExpression },
  ];
  const matchedExpression = EXPRESSION_VARIANT_CONSTRUCTOR({
    range: exampleRange,
    type: intType,
    tag: 'tag',
    tagOrder: 0,
    data: intLiteralExpression,
  });
  const matchExpression = EXPRESSION_MATCH({
    range: exampleRange,
    type: stringType,
    matchedExpression,
    matchingList,
  });
  const matchExpressionNoData = EXPRESSION_MATCH({
    range: exampleRange,
    type: stringType,
    matchedExpression,
    matchingList: matchingListNoData,
  });
  const matchExpressionFail = EXPRESSION_MATCH({
    range: exampleRange,
    type: stringType,
    matchedExpression,
    matchingList: [],
  });
  expect(
    isSameValue(interpreter.eval(matchExpression), { type: 'string', value: 'value' })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(matchExpressionNoData), { type: 'string', value: 'value' })
  ).toBeTruthy();
  expect(() => interpreter.eval(matchExpressionFail)).toThrow('');
});

it('lambda expression evaluates correctly', () => {
  const lambdaFunctionType: FunctionType = {
    type: 'FunctionType',
    argumentTypes: [unitType],
    returnType: intType,
  };
  const lambdaExpression = EXPRESSION_LAMBDA({
    range: exampleRange,
    type: lambdaFunctionType,
    parameters: [],
    captured: {},
    body: intLiteralExpression,
  });
  expect(isSameValue(interpreter.eval(lambdaExpression), { type: 'int', value: 5 }));
});

it('statement block expression evalutes correctly', () => {
  const tuplePattern: TuplePattern = {
    range: exampleRange,
    type: 'TuplePattern',
    destructedNames: [['tuple', exampleRange]],
  };
  const tuplePatternNull: TuplePattern = {
    range: exampleRange,
    type: 'TuplePattern',
    destructedNames: [[null, exampleRange]],
  };
  const tupleType: TupleType = { type: 'TupleType', mappings: [intType] };
  const tupleExpression: SamlangExpression = EXPRESSION_TUPLE_CONSTRUCTOR({
    range: exampleRange,
    type: tupleType,
    expressions: [intLiteralExpression],
  });
  const tupleStatement: SamlangValStatement = {
    pattern: tuplePattern,
    range: exampleRange,
    typeAnnotation: intType,
    assignedExpression: tupleExpression,
  };
  const tupleStatementNull: SamlangValStatement = {
    pattern: tuplePatternNull,
    range: exampleRange,
    typeAnnotation: intType,
    assignedExpression: tupleExpression,
  };
  const objectDestructedNames: ObjectPatternDestucturedName = {
    fieldName: 'field',
    fieldOrder: 0,
    alias: 'f',
    range: exampleRange,
  };
  const objectDestructedNamesNoAlias: ObjectPatternDestucturedName = {
    fieldName: 'field',
    fieldOrder: 0,
    range: exampleRange,
  };
  const objectDestructedNamesFail: ObjectPatternDestucturedName = {
    fieldName: 'fieldName',
    fieldOrder: 0,
    alias: 'f',
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
  const objectExpression: SamlangExpression = EXPRESSION_OBJECT_CONSTRUCTOR({
    range: exampleRange,
    type: intType,
    fieldDeclarations: [
      { range: exampleRange, type: intType, name: 'field', expression: intLiteralExpression },
    ],
  });
  const objectStatement: SamlangValStatement = {
    pattern: objectPattern,
    range: exampleRange,
    typeAnnotation: intType,
    assignedExpression: objectExpression,
  };
  const objectStatementFail: SamlangValStatement = {
    pattern: objectPatternFail,
    range: exampleRange,
    typeAnnotation: intType,
    assignedExpression: objectExpression,
  };
  const variableLocalValues = new Map<string, Value>();
  variableLocalValues.set('var', { type: 'bool', value: true });
  const variableContext = { classes: new Map(), localValues: variableLocalValues };
  const variablePattern: VariablePattern = {
    range: exampleRange,
    type: 'VariablePattern',
    name: 'var',
  };
  const variableExpression: SamlangExpression = EXPRESSION_VARIABLE({
    range: exampleRange,
    type: intType,
    name: 'var',
  });
  const variableStatement: SamlangValStatement = {
    pattern: variablePattern,
    range: exampleRange,
    typeAnnotation: intType,
    assignedExpression: variableExpression,
  };
  const wildCardPattern: WildCardPattern = { type: 'WildCardPattern', range: exampleRange };
  const wildCardStatement: SamlangValStatement = {
    pattern: wildCardPattern,
    range: exampleRange,
    typeAnnotation: intType,
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
  const statementBlockExpression = EXPRESSION_STATEMENT_BLOCK({
    range: exampleRange,
    type: intType,
    block: statementBlock,
  });
  const statementBlockExpressionWithBlockExpression = EXPRESSION_STATEMENT_BLOCK({
    range: exampleRange,
    type: intType,
    block: statementBlockWithExpression,
  });
  const statementBlockExpressionFail = EXPRESSION_STATEMENT_BLOCK({
    range: exampleRange,
    type: intType,
    block: statementBlockFail,
  });
  expect(
    isSameValue(interpreter.eval(statementBlockExpression, variableContext), { type: 'unit' })
  ).toBeTruthy();
  expect(
    isSameValue(interpreter.eval(statementBlockExpressionWithBlockExpression), {
      type: 'int',
      value: 5,
    })
  ).toBeTruthy();
  expect(() => interpreter.eval(statementBlockExpressionFail)).toThrow('');
});
