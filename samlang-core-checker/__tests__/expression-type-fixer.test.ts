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
  SourceExpressionTrue,
  SourceExpressionInt,
  SourceExpressionString,
  SourceExpressionThis,
  SourceExpressionVariable,
  SourceExpressionClassMember,
  SourceExpressionTupleConstructor,
  SourceExpressionObjectConstructor,
  SourceExpressionVariantConstructor,
  SourceExpressionFieldAccess,
  SourceExpressionMethodAccess,
  SourceExpressionUnary,
  SourceExpressionFunctionCall,
  SourceExpressionBinary,
  SourceExpressionIfElse,
  SourceExpressionMatch,
  SourceExpressionLambda,
  SourceExpressionStatementBlock,
} from 'samlang-core-ast/samlang-nodes';

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

const TRUE = SourceExpressionTrue();
const intOf = (n: number) => SourceExpressionInt(n);
const stringOf = (s: string) => SourceExpressionString(s);

const assertThrows = (unfixed: SamlangExpression, type: Type): void =>
  expect(() => fixExpressionType(unfixed, type, TestingResolution)).toThrow();

describe('expression-type-fixer', () => {
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
      SourceExpressionThis({ type: unitType }),
      SourceExpressionThis({ type: { type: 'UndecidedType', index: 0 } }),
      unitType
    );
    assertThrows(SourceExpressionThis({ type: { type: 'UndecidedType', index: 0 } }), boolType);
  });

  it('Variable types are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionVariable({ type: unitType, name: 'v' }),
      SourceExpressionVariable({ type: { type: 'UndecidedType', index: 0 }, name: 'v' }),
      unitType
    );
    assertThrows(
      SourceExpressionVariable({ type: { type: 'UndecidedType', index: 0 }, name: 'v' }),
      boolType
    );
  });

  it('Class members are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionClassMember({
        type: functionType([], unitType),
        typeArguments: [boolType],
        moduleReference: ModuleReference.DUMMY,
        className: 'Foo',
        classNameRange: Range.DUMMY,
        memberPrecedingComments: [],
        memberName: 'bar',
        memberNameRange: Range.DUMMY,
      }),
      SourceExpressionClassMember({
        type: functionType([], { type: 'UndecidedType', index: 0 }),
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
      SourceExpressionClassMember({
        type: functionType([], { type: 'UndecidedType', index: 0 }),
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
      SourceExpressionTupleConstructor({
        type: tupleType([intType, boolType]),
        expressions: [intOf(1), TRUE],
      }),
      SourceExpressionTupleConstructor({
        type: tupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      tupleType([intType, boolType])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: tupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      tupleType([boolType, intType])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: tupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [TRUE, intOf(1)],
      }),
      tupleType([intType, boolType])
    );
  });

  it('Object constructors are correctly resolved', () => {
    assertCorrectlyFixed(
      SourceExpressionObjectConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
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
      SourceExpressionObjectConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
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
      SourceExpressionObjectConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [{ type: 'UndecidedType', index: 2 }]),
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
      SourceExpressionObjectConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 3 },
        ]),
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
      SourceExpressionVariantConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [intType, boolType]),
        tag: 'Foo',
        tagOrder: 0,
        data: intOf(1),
      }),
      SourceExpressionVariantConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        tag: 'Foo',
        tagOrder: 0,
        data: intOf(1),
      }),
      identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
    );

    assertThrows(
      SourceExpressionVariantConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [{ type: 'UndecidedType', index: 2 }]),
        tag: 'Foo',
        tagOrder: 0,
        data: intOf(1),
      }),
      identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
    );

    assertThrows(
      SourceExpressionVariantConstructor({
        type: identifierType(ModuleReference.DUMMY, 'A', [
          { type: 'UndecidedType', index: 1 },
          { type: 'UndecidedType', index: 2 },
        ]),
        tag: 'Foo',
        tagOrder: 0,
        data: intOf(1),
      }),
      identifierType(ModuleReference.DUMMY, 'A', [intType, boolType])
    );
  });

  it('Field accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionFieldAccess({
        type: functionType([], intType),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        fieldPrecedingComments: [],
        fieldName: 'bar',
        fieldOrder: 1,
      }),
      SourceExpressionFieldAccess({
        type: functionType([], { type: 'UndecidedType', index: 2 }),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        fieldPrecedingComments: [],
        fieldName: 'bar',
        fieldOrder: 1,
      }),
      functionType([], intType)
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: functionType([], { type: 'UndecidedType', index: 3 }),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        methodPrecedingComments: [],
        methodName: 'bar',
      }),
      functionType([], intType)
    );
  });

  it('Method accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionMethodAccess({
        type: functionType([], intType),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        methodPrecedingComments: [],
        methodName: 'bar',
      }),
      SourceExpressionMethodAccess({
        type: functionType([], { type: 'UndecidedType', index: 2 }),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        methodPrecedingComments: [],
        methodName: 'bar',
      }),
      functionType([], intType)
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: functionType([], { type: 'UndecidedType', index: 3 }),
        expression: SourceExpressionThis({ type: identifierType(ModuleReference.DUMMY, 'Foo') }),
        methodPrecedingComments: [],
        methodName: 'bar',
      }),
      functionType([], intType)
    );
  });

  it('Unary expressions are correctly resolved', () => {
    assertCorrectlyFixed(
      SourceExpressionUnary({ type: boolType, operator: '!', expression: TRUE }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      boolType
    );
    assertCorrectlyFixed(
      SourceExpressionUnary({ type: intType, operator: '-', expression: intOf(1) }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      intType
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      intType
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      boolType
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: intOf(1),
      }),
      boolType
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: TRUE,
      }),
      intType
    );
  });

  it('Binary expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: intType,
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      intType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: boolType,
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      boolType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: boolType,
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      boolType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: stringType,
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      stringType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: boolType,
        operatorPrecedingComments: [],
        operator: EQ,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: EQ,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      boolType
    );

    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      boolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      intType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      intType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      intType
    );
    assertThrows(
      SourceExpressionBinary({
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
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: stringOf(''),
        e2: intOf(1),
      }),
      intType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: stringOf(''),
      }),
      boolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: stringOf(''),
        e2: TRUE,
      }),
      boolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: TRUE,
      }),
      stringType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
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
      SourceExpressionMatch({
        type: intType,
        matchedExpression: SourceExpressionThis({
          type: identifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: 'A',
            tagOrder: 1,
            expression: SourceExpressionVariable({ type: intType, name: '' }),
          },
        ],
      }),
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 2 },
        matchedExpression: SourceExpressionThis({
          type: identifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: 'A',
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', index: 2 },
              name: '',
            }),
          },
        ],
      }),
      intType
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 1 },
        matchedExpression: SourceExpressionThis({
          type: identifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: 'A',
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', index: 2 },
              name: '',
            }),
          },
        ],
      }),
      intType
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 2 },
        matchedExpression: SourceExpressionThis({
          type: identifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: 'A',
            tagOrder: 1,
            expression: SourceExpressionVariable({
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
      SourceExpressionStatementBlock({
        type: unitType,
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
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', index: 0 },
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
      SourceExpressionStatementBlock({
        type: intType,
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
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', index: 2 },
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
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', index: 1 },
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
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', index: 2 },
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
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', index: 2 },
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
    const expected = SourceExpressionIfElse({
      type: boolType,
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: boolType,
        functionExpression: SourceExpressionLambda({
          type: functionType([intType], boolType),
          parameters: [['a', Range.DUMMY, intType]],
          captured: { a: intType },
          body: TRUE,
        }),
        functionArguments: [SourceExpressionVariable({ type: intType, name: 'v' })],
      }),
    });
    const unfixed = SourceExpressionIfElse({
      type: { type: 'UndecidedType', index: 1 },
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: { type: 'UndecidedType', index: 5 },
        functionExpression: SourceExpressionLambda({
          type: functionType([intType], { type: 'UndecidedType', index: 9 }),
          parameters: [['a', Range.DUMMY, intType]],
          captured: { a: { type: 'UndecidedType', index: 2 } },
          body: TRUE,
        }),
        functionArguments: [
          SourceExpressionVariable({ type: { type: 'UndecidedType', index: 2 }, name: 'v' }),
        ],
      }),
    });
    assertCorrectlyFixed(expected, unfixed, boolType);
    assertThrows(unfixed, intType);
  });
});
