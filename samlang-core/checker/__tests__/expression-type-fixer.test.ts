import { ModuleReference, Range } from '../../ast/common-nodes';
import { AND, CONCAT, EQ, LT, MUL } from '../../ast/common-operators';
import {
  SamlangExpression,
  SamlangType,
  SourceBoolType,
  SourceExpressionBinary,
  SourceExpressionClassMember,
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
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceTupleType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
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
  type: SamlangType
): void => expect(fixExpressionType(unfixed, type, TestingResolution)).toEqual(expected);

const TRUE = SourceExpressionTrue();
const intOf = (n: number) => SourceExpressionInt(n);
const stringOf = (s: string) => SourceExpressionString(s);

const assertThrows = (unfixed: SamlangExpression, type: SamlangType): void =>
  expect(() => fixExpressionType(unfixed, type, TestingResolution)).toThrow();

describe('expression-type-fixer', () => {
  it('Literal types are unchanged', () => {
    assertThrows(TRUE, SourceIntType);
    assertCorrectlyFixed(intOf(1), intOf(1), SourceIntType);
    assertThrows(intOf(1), SourceUnitType);
    assertCorrectlyFixed(TRUE, TRUE, SourceBoolType);
    assertThrows(TRUE, SourceUnitType);
    assertCorrectlyFixed(stringOf('foo'), stringOf('foo'), SourceStringType);
    assertThrows(stringOf('foo'), SourceUnitType);
  });

  it('This expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionThis({ type: SourceUnitType }),
      SourceExpressionThis({ type: { type: 'UndecidedType', index: 0 } }),
      SourceUnitType
    );
    assertThrows(
      SourceExpressionThis({ type: { type: 'UndecidedType', index: 0 } }),
      SourceBoolType
    );
  });

  it('Variable types are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionVariable({ type: SourceUnitType, name: 'v' }),
      SourceExpressionVariable({ type: { type: 'UndecidedType', index: 0 }, name: 'v' }),
      SourceUnitType
    );
    assertThrows(
      SourceExpressionVariable({ type: { type: 'UndecidedType', index: 0 }, name: 'v' }),
      SourceBoolType
    );
  });

  it('Class members are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionClassMember({
        type: SourceFunctionType([], SourceUnitType),
        typeArguments: [SourceBoolType],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceExpressionClassMember({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 0 }),
        typeArguments: [{ type: 'UndecidedType', index: 1 }],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceFunctionType([], SourceUnitType)
    );

    assertThrows(
      SourceExpressionClassMember({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 0 }),
        typeArguments: [{ type: 'UndecidedType', index: 1 }],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceFunctionType([], SourceIntType)
    );
  });

  it('Tuple constructors are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionTupleConstructor({
        type: SourceTupleType([SourceIntType, SourceBoolType]),
        expressions: [intOf(1), TRUE],
      }),
      SourceExpressionTupleConstructor({
        type: SourceTupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      SourceTupleType([SourceIntType, SourceBoolType])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: SourceTupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      SourceTupleType([SourceBoolType, SourceIntType])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: SourceTupleType([
          { type: 'UndecidedType', index: 2 },
          { type: 'UndecidedType', index: 1 },
        ]),
        expressions: [TRUE, intOf(1)],
      }),
      SourceTupleType([SourceIntType, SourceBoolType])
    );
  });

  it('Field accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionFieldAccess({
        type: SourceFunctionType([], SourceIntType),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      SourceExpressionFieldAccess({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 2 }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      SourceFunctionType([], SourceIntType)
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 3 }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType([], SourceIntType)
    );
  });

  it('Method accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionMethodAccess({
        type: SourceFunctionType([], SourceIntType),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceExpressionMethodAccess({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 2 }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType([], SourceIntType)
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: SourceFunctionType([], { type: 'UndecidedType', index: 3 }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType([], SourceIntType)
    );
  });

  it('Unary expressions are correctly resolved', () => {
    assertCorrectlyFixed(
      SourceExpressionUnary({ type: SourceBoolType, operator: '!', expression: TRUE }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      SourceBoolType
    );
    assertCorrectlyFixed(
      SourceExpressionUnary({ type: SourceIntType, operator: '-', expression: intOf(1) }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      SourceIntType
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      SourceIntType
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      SourceBoolType
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 1 },
        operator: '!',
        expression: intOf(1),
      }),
      SourceBoolType
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', index: 2 },
        operator: '-',
        expression: TRUE,
      }),
      SourceIntType
    );
  });

  it('Binary expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceIntType,
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
      SourceIntType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType,
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
      SourceBoolType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType,
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
      SourceBoolType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceStringType,
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
      SourceStringType
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType,
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
      SourceBoolType
    );

    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceBoolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceIntType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      SourceIntType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceIntType
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
      SourceIntType
    );

    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: stringOf(''),
        e2: intOf(1),
      }),
      SourceIntType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: stringOf(''),
      }),
      SourceBoolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: stringOf(''),
        e2: TRUE,
      }),
      SourceBoolType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: TRUE,
      }),
      SourceStringType
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', index: 1 },
        operatorPrecedingComments: [],
        operator: EQ,
        e1: TRUE,
        e2: stringOf(''),
      }),
      SourceBoolType
    );
  });

  it('Match expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionMatch({
        type: SourceIntType,
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({ type: SourceIntType, name: '' }),
          },
        ],
      }),
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 2 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', index: 2 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 1 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', index: 2 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', index: 2 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', index: 1 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType
    );
  });

  it('Statement block expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionStatementBlock({
        type: SourceUnitType,
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType,
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
              typeAnnotation: SourceIntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceUnitType
    );
    assertCorrectlyFixed(
      SourceExpressionStatementBlock({
        type: SourceIntType,
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType,
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
              typeAnnotation: SourceIntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      SourceIntType
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
              typeAnnotation: SourceIntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      SourceIntType
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
              typeAnnotation: SourceIntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceIntType
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
              typeAnnotation: SourceIntType,
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceIntType
    );
  });

  it('Deep expression integration test', () => {
    const expected = SourceExpressionIfElse({
      type: SourceBoolType,
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: SourceBoolType,
        functionExpression: SourceExpressionLambda({
          type: SourceFunctionType([SourceIntType], SourceBoolType),
          parameters: [[SourceId('a'), SourceIntType]],
          captured: { a: SourceIntType },
          body: TRUE,
        }),
        functionArguments: [SourceExpressionVariable({ type: SourceIntType, name: 'v' })],
      }),
    });
    const unfixed = SourceExpressionIfElse({
      type: { type: 'UndecidedType', index: 1 },
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: { type: 'UndecidedType', index: 5 },
        functionExpression: SourceExpressionLambda({
          type: SourceFunctionType([SourceIntType], { type: 'UndecidedType', index: 9 }),
          parameters: [[SourceId('a'), SourceIntType]],
          captured: { a: { type: 'UndecidedType', index: 2 } },
          body: TRUE,
        }),
        functionArguments: [
          SourceExpressionVariable({ type: { type: 'UndecidedType', index: 2 }, name: 'v' }),
        ],
      }),
    });
    assertCorrectlyFixed(expected, unfixed, SourceBoolType);
    assertThrows(unfixed, SourceIntType);
  });
});
