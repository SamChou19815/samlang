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

const TRUE = EXPRESSION_TRUE(Range.DUMMY, []);
const intOf = (n: number) => EXPRESSION_INT(Range.DUMMY, [], n);
const stringOf = (s: string) => EXPRESSION_STRING(Range.DUMMY, [], s);

const assertThrows = (unfixed: SamlangExpression, type: Type): void =>
  expect(() => fixExpressionType(unfixed, type, TestingResolution)).toThrow();

it('Literal types are unchanged', () => {
  assertThrows(TRUE, intType);
  assertCorrectlyFixed(intOf(1), intOf(1), intType);
  assertThrows(intOf(1), unitType);
  assertCorrectlyFixed(TRUE, TRUE, boolType);
  assertThrows(TRUE, unitType);
  assertCorrectlyFixed(stringOf('foo'), stringOf('foo'), stringType);
  assertThrows(stringOf('foo'), unitType);
});

it('This expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_THIS({ range: Range.DUMMY, type: unitType, precedingComments: [] }),
    EXPRESSION_THIS({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
    }),
    unitType
  );
  assertThrows(
    EXPRESSION_THIS({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
    }),
    boolType
  );
});

it('Variable types are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, precedingComments: [], name: 'v' }),
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
      name: 'v',
    }),
    unitType
  );
  assertThrows(
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
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
      precedingComments: [],
      typeArguments: [boolType],
      moduleReference: ModuleReference.ROOT,
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 0 }),
      precedingComments: [],
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      moduleReference: ModuleReference.ROOT,
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
      precedingComments: [],
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      moduleReference: ModuleReference.ROOT,
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
      precedingComments: [],
      expressions: [intOf(1), TRUE],
    }),
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      precedingComments: [],
      expressions: [intOf(1), TRUE],
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
      precedingComments: [],
      expressions: [intOf(1), TRUE],
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
      precedingComments: [],
      expressions: [TRUE, intOf(1)],
    }),
    tupleType([intType, boolType])
  );
});

it('Object constructors are correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      precedingComments: [],
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: intType },
        { range: Range.DUMMY, name: 'b', type: boolType, expression: TRUE },
      ],
    }),
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      precedingComments: [],
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
        },
      ],
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [{ type: 'UndecidedType', index: 2 }]),
      precedingComments: [],
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
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
      precedingComments: [],
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: { type: 'UndecidedType', index: 2 } },
        {
          range: Range.DUMMY,
          name: 'b',
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
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
      precedingComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      precedingComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [{ type: 'UndecidedType', index: 2 }]),
      precedingComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
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
      precedingComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    identifierType(ModuleReference.ROOT, 'A', [intType, boolType])
  );
});

it('Field accesses are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], intType),
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
      }),
      fieldName: 'bar',
      fieldOrder: 1,
    }),
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
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
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
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
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
      }),
      methodName: 'bar',
    }),
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
      }),
      methodName: 'bar',
    }),
    functionType([], intType)
  );

  assertThrows(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 3 }),
      precedingComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
        precedingComments: [],
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
      precedingComments: [],
      operator: '!',
      expression: TRUE,
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: '!',
      expression: TRUE,
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: intType,
      precedingComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: '!',
      expression: TRUE,
    }),
    intType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    boolType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: '!',
      expression: intOf(1),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: '-',
      expression: TRUE,
    }),
    intType
  );
});

it('Panic expressions can be correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: intType,
      precedingComments: [],
      expression: stringOf(''),
    }),
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      expression: stringOf(''),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      expression: intOf(1),
    }),
    intType
  );
});

it('Built-in function calls can be correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: stringType,
      precedingComments: [],
      functionName: 'intToString',
      argumentExpression: intOf(1),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      precedingComments: [],
      functionName: 'intToString',
      argumentExpression: intOf(1),
    }),
    stringType
  );
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: intType,
      precedingComments: [],
      functionName: 'stringToInt',
      argumentExpression: stringOf(''),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      functionName: 'stringToInt',
      argumentExpression: stringOf(''),
    }),
    intType
  );
  assertCorrectlyFixed(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: unitType,
      precedingComments: [],
      functionName: 'println',
      argumentExpression: stringOf(''),
    }),
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
      functionName: 'println',
      argumentExpression: stringOf(''),
    }),
    unitType
  );

  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      functionName: 'intToString',
      argumentExpression: intOf(1),
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      functionName: 'stringToInt',
      argumentExpression: stringOf(''),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      functionName: 'println',
      argumentExpression: stringOf(''),
    }),
    unitType
  );

  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      precedingComments: [],
      functionName: 'intToString',
      argumentExpression: stringOf(''),
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      functionName: 'stringToInt',
      argumentExpression: intOf(1),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
      functionName: 'println',
      argumentExpression: intOf(1),
    }),
    unitType
  );
});

it('Binary expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: intType,
      precedingComments: [],
      operator: MUL,
      e1: intOf(1),
      e2: intOf(1),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: MUL,
      e1: intOf(1),
      e2: intOf(1),
    }),
    intType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      precedingComments: [],
      operator: LT,
      e1: intOf(1),
      e2: intOf(1),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: LT,
      e1: intOf(1),
      e2: intOf(1),
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      precedingComments: [],
      operator: AND,
      e1: TRUE,
      e2: TRUE,
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: AND,
      e1: TRUE,
      e2: TRUE,
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: stringType,
      precedingComments: [],
      operator: CONCAT,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      precedingComments: [],
      operator: CONCAT,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    stringType
  );
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: boolType,
      precedingComments: [],
      operator: EQ,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: EQ,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    boolType
  );

  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: MUL,
      e1: intOf(1),
      e2: intOf(1),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: LT,
      e1: intOf(1),
      e2: intOf(1),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: AND,
      e1: TRUE,
      e2: TRUE,
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      precedingComments: [],
      operator: CONCAT,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: EQ,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      operator: MUL,
      e1: stringOf(''),
      e2: intOf(1),
    }),
    intType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: LT,
      e1: intOf(1),
      e2: stringOf(''),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: AND,
      e1: stringOf(''),
      e2: TRUE,
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      precedingComments: [],
      operator: CONCAT,
      e1: stringOf(''),
      e2: TRUE,
    }),
    stringType
  );
  assertThrows(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      operator: EQ,
      e1: TRUE,
      e2: stringOf(''),
    }),
    boolType
  );
});

it('Match expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: intType,
      precedingComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
        precedingComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: intType,
            precedingComments: [],
            name: '',
          }),
        },
      ],
    }),
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
        precedingComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            precedingComments: [],
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
      precedingComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
        precedingComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            precedingComments: [],
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
      precedingComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'A'),
        precedingComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 1 },
            precedingComments: [],
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
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
          },
        ],
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
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
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
          },
        ],
        expression: intOf(1),
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
          },
        ],
        expression: intOf(1),
      },
    }),
    intType
  );

  assertThrows(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
          },
        ],
        expression: intOf(1),
      },
    }),
    intType
  );

  assertThrows(
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
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
      precedingComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
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
    precedingComments: [],
    boolExpression: TRUE,
    e1: TRUE,
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: boolType,
      precedingComments: [],
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], boolType),
        precedingComments: [],
        parameters: [['a', intType]],
        captured: { a: intType },
        body: TRUE,
      }),
      functionArguments: [
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: intType,
          precedingComments: [],
          name: 'v',
        }),
      ],
    }),
  });
  const unfixed = EXPRESSION_IF_ELSE({
    range: Range.DUMMY,
    type: { type: 'UndecidedType', index: 1 },
    precedingComments: [],
    boolExpression: TRUE,
    e1: TRUE,
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 5 },
      precedingComments: [],
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], { type: 'UndecidedType', index: 9 }),
        precedingComments: [],
        parameters: [['a', intType]],
        captured: { a: { type: 'UndecidedType', index: 2 } },
        body: TRUE,
      }),
      functionArguments: [
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
          precedingComments: [],
          name: 'v',
        }),
      ],
    }),
  });
  assertCorrectlyFixed(expected, unfixed, boolType);
  assertThrows(unfixed, intType);
});
