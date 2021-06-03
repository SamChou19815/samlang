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
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_MATCH,
  EXPRESSION_LAMBDA,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';

import fixExpressionType from '../expression-type-fixer';
import type { ReadOnlyTypeResolution } from '../type-resolution';
import resolveType from '../type-resolver';
import { undecidedTypeResolver } from './type-resolver.test';

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
    EXPRESSION_THIS({ range: Range.DUMMY, type: unitType, associatedComments: [] }),
    EXPRESSION_THIS({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      associatedComments: [],
    }),
    unitType
  );
  assertThrows(
    EXPRESSION_THIS({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      associatedComments: [],
    }),
    boolType
  );
});

it('Variable types are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, associatedComments: [], name: 'v' }),
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      associatedComments: [],
      name: 'v',
    }),
    unitType
  );
  assertThrows(
    EXPRESSION_VARIABLE({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      associatedComments: [],
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
      associatedComments: [],
      typeArguments: [boolType],
      moduleReference: ModuleReference.DUMMY,
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberPrecedingComments: [],
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 0 }),
      associatedComments: [],
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      moduleReference: ModuleReference.DUMMY,
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberPrecedingComments: [],
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    functionType([], unitType)
  );

  assertThrows(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 0 }),
      associatedComments: [],
      typeArguments: [{ type: 'UndecidedType', index: 1 }],
      moduleReference: ModuleReference.DUMMY,
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberPrecedingComments: [],
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
      associatedComments: [],
      expressions: [intOf(1), TRUE],
    }),
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      associatedComments: [],
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
      associatedComments: [],
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
      associatedComments: [],
      expressions: [TRUE, intOf(1)],
    }),
    tupleType([intType, boolType])
  );
});

it('Object constructors are correctly resolved', () => {
  assertCorrectlyFixed(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
      associatedComments: [],
      fieldDeclarations: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'a',
          nameRange: Range.DUMMY,
          type: intType,
        },
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'b',
          nameRange: Range.DUMMY,
          type: boolType,
          expression: TRUE,
        },
      ],
    }),
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      associatedComments: [],
      fieldDeclarations: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'a',
          nameRange: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
        },
        {
          range: Range.DUMMY,
          name: 'b',
          nameRange: Range.DUMMY,
          associatedComments: [],
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
        },
      ],
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [{ type: 'UndecidedType', index: 2 }]),
      associatedComments: [],
      fieldDeclarations: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'a',
          nameRange: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
        },
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'b',
          nameRange: Range.DUMMY,
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
        },
      ],
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 3 },
      ]),
      associatedComments: [],
      fieldDeclarations: [
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'a',
          nameRange: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
        },
        {
          range: Range.DUMMY,
          associatedComments: [],
          name: 'b',
          nameRange: Range.DUMMY,
          type: { type: 'UndecidedType', index: 1 },
          expression: TRUE,
        },
      ],
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );
});

it('Variant constructors are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
      associatedComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [
        { type: 'UndecidedType', index: 2 },
        { type: 'UndecidedType', index: 1 },
      ]),
      associatedComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [{ type: 'UndecidedType', index: 2 }]),
      associatedComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );

  assertThrows(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.DUMMY, 'A', [
        { type: 'UndecidedType', index: 1 },
        { type: 'UndecidedType', index: 2 },
      ]),
      associatedComments: [],
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
  );
});

it('Field accesses are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], intType),
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      fieldPrecedingComments: [],
      fieldName: 'bar',
      fieldOrder: 1,
    }),
    EXPRESSION_FIELD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      fieldPrecedingComments: [],
      fieldName: 'bar',
      fieldOrder: 1,
    }),
    functionType([], intType)
  );

  assertThrows(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 3 }),
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      methodPrecedingComments: [],
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
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      methodPrecedingComments: [],
      methodName: 'bar',
    }),
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 2 }),
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      methodPrecedingComments: [],
      methodName: 'bar',
    }),
    functionType([], intType)
  );

  assertThrows(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], { type: 'UndecidedType', index: 3 }),
      associatedComments: [],
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'Foo'),
        associatedComments: [],
      }),
      methodPrecedingComments: [],
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
      associatedComments: [],
      operator: '!',
      expression: TRUE,
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operator: '!',
      expression: TRUE,
    }),
    boolType
  );
  assertCorrectlyFixed(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: intType,
      associatedComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    intType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operator: '!',
      expression: TRUE,
    }),
    intType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      operator: '-',
      expression: intOf(1),
    }),
    boolType
  );

  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operator: '!',
      expression: intOf(1),
    }),
    boolType
  );
  assertThrows(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      operator: '-',
      expression: TRUE,
    }),
    intType
  );
});

it('Binary expressions are correctly resolved.', () => {
  assertCorrectlyFixed(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: intType,
      associatedComments: [],
      operatorPrecedingComments: [],
      operator: MUL,
      e1: intOf(1),
      e2: intOf(1),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
      operator: LT,
      e1: intOf(1),
      e2: intOf(1),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
      operator: AND,
      e1: TRUE,
      e2: TRUE,
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
      operator: CONCAT,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 3 },
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
      operator: EQ,
      e1: stringOf(''),
      e2: stringOf(''),
    }),
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 1 },
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      operatorPrecedingComments: [],
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
      associatedComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'A'),
        associatedComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: intType,
            associatedComments: [],
            name: '',
          }),
        },
      ],
    }),
    EXPRESSION_MATCH({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'A'),
        associatedComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            associatedComments: [],
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
      associatedComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'A'),
        associatedComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 2 },
            associatedComments: [],
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
      associatedComments: [],
      matchedExpression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.DUMMY, 'A'),
        associatedComments: [],
      }),
      matchingList: [
        {
          range: Range.DUMMY,
          tag: 'A',
          tagOrder: 1,
          expression: EXPRESSION_VARIABLE({
            range: Range.DUMMY,
            type: { type: 'UndecidedType', index: 1 },
            associatedComments: [],
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
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
          },
        ],
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 0 },
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
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
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
          },
        ],
        expression: intOf(1),
      },
    }),
    EXPRESSION_STATEMENT_BLOCK({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 2 },
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
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
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
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
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
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
      associatedComments: [],
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
            typeAnnotation: intType,
            assignedExpression: intOf(1),
            associatedComments: [],
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
    associatedComments: [],
    boolExpression: TRUE,
    e1: TRUE,
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: boolType,
      associatedComments: [],
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], boolType),
        associatedComments: [],
        parameters: [['a', Range.DUMMY, intType]],
        captured: { a: intType },
        body: TRUE,
      }),
      functionArguments: [
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
          name: 'v',
        }),
      ],
    }),
  });
  const unfixed = EXPRESSION_IF_ELSE({
    range: Range.DUMMY,
    type: { type: 'UndecidedType', index: 1 },
    associatedComments: [],
    boolExpression: TRUE,
    e1: TRUE,
    e2: EXPRESSION_FUNCTION_CALL({
      range: Range.DUMMY,
      type: { type: 'UndecidedType', index: 5 },
      associatedComments: [],
      functionExpression: EXPRESSION_LAMBDA({
        range: Range.DUMMY,
        type: functionType([intType], { type: 'UndecidedType', index: 9 }),
        associatedComments: [],
        parameters: [['a', Range.DUMMY, intType]],
        captured: { a: { type: 'UndecidedType', index: 2 } },
        body: TRUE,
      }),
      functionArguments: [
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: { type: 'UndecidedType', index: 2 },
          associatedComments: [],
          name: 'v',
        }),
      ],
    }),
  });
  assertCorrectlyFixed(expected, unfixed, boolType);
  assertThrows(unfixed, intType);
});
