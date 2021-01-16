import { collectModuleReferenceFromExpression } from '../module-references-collector';

import {
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
import { MUL } from 'samlang-core-ast/common-operators';
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
import { hashSetOf } from 'samlang-core-utils';

const assertFoundAllModuleReferencesFromExpression = (
  expression: SamlangExpression,
  expected: readonly string[]
): void => {
  const collector = hashSetOf<ModuleReference>();
  collectModuleReferenceFromExpression(expression, collector);
  expect(
    collector
      .toArray()
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(expected);
};

const TRUE = EXPRESSION_TRUE(Range.DUMMY);
const intOf = (n: number) => EXPRESSION_INT(Range.DUMMY, n);
const stringOf = (s: string) => EXPRESSION_STRING(Range.DUMMY, s);

it('collectModuleReferenceFromExpression works 1/n', () => {
  assertFoundAllModuleReferencesFromExpression(TRUE, []);
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_VARIABLE({ range: Range.DUMMY, type: unitType, name: 'v' }),
    []
  );
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_THIS({ range: Range.DUMMY, type: unitType }),
    []
  );
});

it('collectModuleReferenceFromExpression works 2/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_CLASS_MEMBER({
      range: Range.DUMMY,
      type: functionType([], unitType),
      typeArguments: [boolType],
      moduleReference: ModuleReference.ROOT,
      className: 'Foo',
      classNameRange: Range.DUMMY,
      memberName: 'bar',
      memberNameRange: Range.DUMMY,
    }),
    ['']
  );
});

it('collectModuleReferenceFromExpression works 3/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_TUPLE_CONSTRUCTOR({
      range: Range.DUMMY,
      type: tupleType([
        intType,
        identifierType(ModuleReference.ROOT, 'f', [functionType([intType], tupleType([boolType]))]),
      ]),
      expressions: [intOf(1), TRUE],
    }),
    ['']
  );
});

it('collectModuleReferenceFromExpression works 4/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_OBJECT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      fieldDeclarations: [
        { range: Range.DUMMY, name: 'a', type: intType },
        { range: Range.DUMMY, name: 'b', type: boolType, expression: TRUE },
      ],
    }),
    ['']
  );
});

it('collectModuleReferenceFromExpression works 5/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_VARIANT_CONSTRUCTOR({
      range: Range.DUMMY,
      type: identifierType(ModuleReference.ROOT, 'A', [intType, boolType]),
      tag: 'Foo',
      tagOrder: 0,
      data: intOf(1),
    }),
    ['']
  );
});

it('collectModuleReferenceFromExpression works 6/n', () => {
  assertFoundAllModuleReferencesFromExpression(
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
    ['']
  );

  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_METHOD_ACCESS({
      range: Range.DUMMY,
      type: functionType([], intType),
      expression: EXPRESSION_THIS({
        range: Range.DUMMY,
        type: identifierType(ModuleReference.ROOT, 'Foo'),
      }),
      methodName: 'bar',
    }),
    ['']
  );

  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_UNARY({
      range: Range.DUMMY,
      type: boolType,
      operator: '!',
      expression: TRUE,
    }),
    []
  );

  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_PANIC({
      range: Range.DUMMY,
      type: intType,
      expression: stringOf(''),
    }),
    []
  );
});

it('collectModuleReferenceFromExpression works 7/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_BUILTIN_FUNCTION_CALL({
      range: Range.DUMMY,
      type: stringType,
      functionName: 'intToString',
      argumentExpression: intOf(1),
    }),
    []
  );
});

it('collectModuleReferenceFromExpression works 8/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_BINARY({
      range: Range.DUMMY,
      type: intType,
      operator: MUL,
      e1: intOf(1),
      e2: intOf(1),
    }),
    []
  );
});

it('collectModuleReferenceFromExpression works 9/n', () => {
  assertFoundAllModuleReferencesFromExpression(
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
    ['']
  );
});

it('collectModuleReferenceFromExpression works 10/n', () => {
  assertFoundAllModuleReferencesFromExpression(
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
            assignedExpression: intOf(1),
          },
        ],
      },
    }),
    []
  );

  assertFoundAllModuleReferencesFromExpression(
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
            assignedExpression: intOf(1),
          },
        ],
        expression: intOf(1),
      },
    }),
    []
  );
});

it('collectModuleReferenceFromExpression works 11/n', () => {
  assertFoundAllModuleReferencesFromExpression(
    EXPRESSION_IF_ELSE({
      range: Range.DUMMY,
      type: boolType,
      boolExpression: TRUE,
      e1: TRUE,
      e2: EXPRESSION_FUNCTION_CALL({
        range: Range.DUMMY,
        type: boolType,
        functionExpression: EXPRESSION_LAMBDA({
          range: Range.DUMMY,
          type: functionType([intType], boolType),
          parameters: [['a', intType]],
          captured: { a: intType },
          body: TRUE,
        }),
        functionArguments: [EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'v' })],
      }),
    }),
    []
  );
});
