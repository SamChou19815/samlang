import fixExpressionType from '../expression-type-fixer';
import type { ReadOnlyTypeResolution } from '../type-resolution';
import resolveType from '../type-resolver';
import { undecidedTypeResolver } from './type-resolver.test';

import {
  Type,
  unitType,
  boolType,
  intType,
  stringType,
  identifierType,
  tupleType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import { MUL, LT, AND, EQ, CONCAT } from 'samlang-core-ast/common-operators';
import {
  SamlangExpression,
  EXPRESSION_TRUE,
  EXPRESSION_INT,
  EXPRESSION_STRING,
  EXPRESSION_THIS,
  EXPRESSION_VARIABLE,
  EXPRESSION_CLASS_MEMBER,
  EXPRESSION_TUPLE_CONSTRUCTOR,
  EXPRESSION_OBJECT_CONSTRUCTOR,
  EXPRESSION_VARIANT_CONSTRUCTOR,
  EXPRESSION_FIELD_ACCESS,
  EXPRESSION_METHOD_ACCESS,
  EXPRESSION_UNARY,
  EXPRESSION_PANIC,
  EXPRESSION_BUILTIN_FUNCTION_CALL,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_MATCH,
  EXPRESSION_LAMBDA,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';

const TestingResolution: ReadOnlyTypeResolution = {
  getPartiallyResolvedType() {
    throw new Error('Not necessary for this test.');
  },
  resolveType: (unresolvedType) => resolveType(unresolvedType, undecidedTypeResolver),
};

const assertCorrectlyFixed = (
  expected: SamlangExpression,
  unfixed: SamlangExpression,
  type: Type
): void => expect(fixExpressionType(unfixed, type, TestingResolution)).toEqual(expected);

const assertThrows = (unfixed: SamlangExpression, type: Type): void =>
  expect(() => fixExpressionType(unfixed, type, TestingResolution)).toThrow();

it('Literal types are unchanged', () => {
  assertThrows(EXPRESSION_TRUE(Range.DUMMY), intType);
  assertCorrectlyFixed(
    EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    intType
  );
  assertThrows(EXPRESSION_INT(Range.DUMMY, BigInt(1)), unitType);
  assertCorrectlyFixed(EXPRESSION_TRUE(Range.DUMMY), EXPRESSION_TRUE(Range.DUMMY), boolType);
  assertThrows(EXPRESSION_TRUE(Range.DUMMY), unitType);
  assertCorrectlyFixed(
    EXPRESSION_STRING(Range.DUMMY, 'foo'),
    EXPRESSION_STRING(Range.DUMMY, 'foo'),
    stringType
  );
  assertThrows(EXPRESSION_STRING(Range.DUMMY, 'foo'), unitType);
});

it('This expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_THIS({ range: Range.DUMMY, type: unitType }),
    EXPRESSION_THIS({ range: Range.DUMMY, type: { type: 'UndecidedType', index: 0 } }),
    unitType
  );
  assertThrows(
    EXPRESSION_THIS({ range: Range.DUMMY, type: { type: 'UndecidedType', index: 0 } }),
    boolType
  );
});

it('Variable types are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'v' }),
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      name: 'v',
    }),
    unitType
  );
  assertThrows(
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      name: 'v',
    }),
    boolType
  );
});

it('Class members are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], unitType),
      typeArguments: [boolType],
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 0 }),
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    functionType([], unitType)
  );

  assertThrows(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 0 }),
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    functionType([], intType)
  );
});

it('Tuple constructors are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([intType, boolType]),
      expressions: [EXPRESSION_INT(Range.DUMMY, BigInt(1)), EXPRESSION_TRUE(Range.DUMMY)],
    }),
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      expressions: [EXPRESSION_INT(Range.DUMMY, BigInt(1)), EXPRESSION_TRUE(Range.DUMMY)],
    }),
    tupleType([intType, boolType])
  );

  assertThrows(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      expressions: [EXPRESSION_INT(Range.DUMMY, BigInt(1)), EXPRESSION_TRUE(Range.DUMMY)],
    }),
    tupleType([boolType, intType])
  );

  assertThrows(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      expressions: [EXPRESSION_TRUE(Range.DUMMY), EXPRESSION_INT(Range.DUMMY, BigInt(1))],
    }),
    tupleType([intType, boolType])
  );
});

it('Object constructors are correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: intType },
        { range: Range.DUMMY, name: 'b', type: boolType, expression: EXPRESSION_TRUE(Range.DUMMY) },
      ],
    }),
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: EXPRESSION_TRUE(Range.DUMMY),
        },
      ],
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [{ type: 'UndecidedType', index: 2 }]),
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: EXPRESSION_TRUE(Range.DUMMY),
        },
      ],
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 3 },
      ]),
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: EXPRESSION_TRUE(Range.DUMMY),
        },
      ],
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );
});

it('Variant constructors are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      tag: 'Foo',
      tagOrder: 0,
      data: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      tag: 'Foo',
      tagOrder: 0,
      data: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [{ type: 'UndecidedType', index: 2 }]),
      tag: 'Foo',
      tagOrder: 0,
      data: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 1 },
        { type: 'UndecidedType', index: 2 },
      ]),
      tag: 'Foo',
      tagOrder: 0,
      data: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );
});

it('Field accesses are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], intType),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      fieldName: 'bar',
      fieldOrder: 1,
    }),
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      fieldName: 'bar',
      fieldOrder: 1,
    }),
    functionType([], intType)
  );

  assertThrows(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 3 }),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      methodName: 'bar',
    }),
    functionType([], intType)
  );
});

it('Method accesses are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], intType),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      methodName: 'bar',
    }),
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      methodName: 'bar',
    }),
    functionType([], intType)
  );

  assertThrows(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 3 }),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      methodName: 'bar',
    }),
    functionType([], intType)
  );
});

it('Unary expressions are correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: boolType,
      operator: '!',
      expression: EXPRESSION_TRUE(Range.DUMMY),
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: '!',
      expression: EXPRESSION_TRUE(Range.DUMMY),
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: intType,
      operator: '-',
      expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: '-',
      expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: '!',
      expression: EXPRESSION_TRUE(Range.DUMMY),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: '-',
      expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    boolType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: '!',
      expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: '-',
      expression: EXPRESSION_TRUE(Range.DUMMY),
    }),
    intType
  );
});

it('Panic expressions can be correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: intType,
      expression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      expression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );
});

it('Built-in function calls can be correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: stringType,
      functionName: 'intToString',
      argumentExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      functionName: 'intToString',
      argumentExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    stringType
  );
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      functionName: 'stringToInt',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      functionName: 'stringToInt',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    intType
  );
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      functionName: 'println',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      functionName: 'println',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    unitType
  );

  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      functionName: 'intToString',
      argumentExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      functionName: 'stringToInt',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      functionName: 'println',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    unitType
  );

  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      functionName: 'intToString',
      argumentExpression: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      functionName: 'stringToInt',
      argumentExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      functionName: 'println',
      argumentExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    unitType
  );
});

it('Binary expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: intType,
      operator: MUL,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: MUL,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: LT,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: LT,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: AND,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_TRUE(Range.DUMMY),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: AND,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_TRUE(Range.DUMMY),
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: stringType,
      operator: CONCAT,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      operator: CONCAT,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    stringType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      operator: EQ,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: EQ,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    boolType
  );

  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: MUL,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: LT,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: AND,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_TRUE(Range.DUMMY),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      operator: CONCAT,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: EQ,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      operator: MUL,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: LT,
      e1: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: AND,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_TRUE(Range.DUMMY),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      operator: CONCAT,
      e1: EXPRESSION_STRING(Range.DUMMY, ''),
      e2: EXPRESSION_TRUE(Range.DUMMY),
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      operator: EQ,
      e1: EXPRESSION_TRUE(Range.DUMMY),
      e2: EXPRESSION_STRING(Range.DUMMY, ''),
    }),
    boolType
  );
});

it('Match expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: intType,
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: '' }),
        },
      ],
    }),
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            name: '',
          }),
        },
      ],
    }),
    intType
  );

  assertThrows(
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            name: '',
          }),
        },
      ],
    }),
    intType
  );

  assertThrows(
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 1 },
            name: '',
          }),
        },
      ],
    }),
    intType
  );
});

it('Statement block expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: unitType,
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
      },
    }),
    unitType
  );
  assertCorrectlyFixed(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: intType,
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
        expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
        expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      },
    }),
    intType
  );

  assertThrows(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
        expression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
      },
    }),
    intType
  );

  assertThrows(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
      },
    }),
    intType
  );

  assertThrows(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: EXPRESSION_INT(Range.DUMMY, BigInt(1)),
          },
        ],
      },
    }),
    intType
  );
});

it('Deep expression integration test', () => {
  const expected = EXPRESSION_IF_ELSE({
    range: Range.DUMMY,
    type: boolType,
    boolExpression: EXPRESSION_TRUE(Range.DUMMY),
    e1: EXPRESSION_TRUE(Range.DUMMY),
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: boolType,
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], boolType),
        parameters: [['a', intType]],
        captured: { a: intType },
        body: EXPRESSION_TRUE(Range.DUMMY),
      }),
      functionArguments: [EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'v' })],
    }),
  });
  const unfixed = EXPRESSION_IF_ELSE({
    range: Range.DUMMY,
    type: { type: 'UndecidedType', index: 1 },
    boolExpression: EXPRESSION_TRUE(Range.DUMMY),
    e1: EXPRESSION_TRUE(Range.DUMMY),
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 5 },
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], { type: 'UndecidedType', index: 9 }),
        parameters: [['a', intType]],
        captured: { a: { type: 'UndecidedType', index: 2 } },
        body: EXPRESSION_TRUE(Range.DUMMY),
      }),
      functionArguments: [
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
          name: 'v',
        }),
      ],
    }),
  });
  assertCorrectlyFixed(expected, unfixed, boolType);
  assertThrows(unfixed, intType);
});
