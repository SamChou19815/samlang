import { DummySourceReason, ModuleReference, Range } from '../../ast/common-nodes';
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
    assertThrows(TRUE, SourceIntType(DummySourceReason));
    assertCorrectlyFixed(intOf(1), intOf(1), SourceIntType(DummySourceReason));
    assertThrows(intOf(1), SourceUnitType(DummySourceReason));
    assertCorrectlyFixed(TRUE, TRUE, SourceBoolType(DummySourceReason));
    assertThrows(TRUE, SourceUnitType(DummySourceReason));
    assertCorrectlyFixed(stringOf('foo'), stringOf('foo'), SourceStringType(DummySourceReason));
    assertThrows(stringOf('foo'), SourceUnitType(DummySourceReason));
  });

  it('This expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionThis({ type: SourceUnitType(DummySourceReason) }),
      SourceExpressionThis({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
      }),
      SourceUnitType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionThis({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
      }),
      SourceBoolType(DummySourceReason)
    );
  });

  it('Variable types are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionVariable({ type: SourceUnitType(DummySourceReason), name: 'v' }),
      SourceExpressionVariable({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        name: 'v',
      }),
      SourceUnitType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionVariable({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        name: 'v',
      }),
      SourceBoolType(DummySourceReason)
    );
  });

  it('Class members are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionClassMember({
        type: SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason)),
        typeArguments: [SourceBoolType(DummySourceReason)],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceExpressionClassMember({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 0,
        }),
        typeArguments: [{ type: 'UndecidedType', reason: DummySourceReason, index: 1 }],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceFunctionType(DummySourceReason, [], SourceUnitType(DummySourceReason))
    );

    assertThrows(
      SourceExpressionClassMember({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 0,
        }),
        typeArguments: [{ type: 'UndecidedType', reason: DummySourceReason, index: 1 }],
        moduleReference: ModuleReference.DUMMY,
        className: SourceId('Foo'),
        memberName: SourceId('bar'),
      }),
      SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason))
    );
  });

  it('Tuple constructors are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionTupleConstructor({
        type: SourceTupleType(DummySourceReason, [
          SourceIntType(DummySourceReason),
          SourceBoolType(DummySourceReason),
        ]),
        expressions: [intOf(1), TRUE],
      }),
      SourceExpressionTupleConstructor({
        type: SourceTupleType(DummySourceReason, [
          { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
          { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      SourceTupleType(DummySourceReason, [
        SourceIntType(DummySourceReason),
        SourceBoolType(DummySourceReason),
      ])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: SourceTupleType(DummySourceReason, [
          { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
          { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        ]),
        expressions: [intOf(1), TRUE],
      }),
      SourceTupleType(DummySourceReason, [
        SourceBoolType(DummySourceReason),
        SourceIntType(DummySourceReason),
      ])
    );

    assertThrows(
      SourceExpressionTupleConstructor({
        type: SourceTupleType(DummySourceReason, [
          { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
          { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        ]),
        expressions: [TRUE, intOf(1)],
      }),
      SourceTupleType(DummySourceReason, [
        SourceIntType(DummySourceReason),
        SourceBoolType(DummySourceReason),
      ])
    );
  });

  it('Field accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionFieldAccess({
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      SourceExpressionFieldAccess({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 2,
        }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        fieldName: SourceId('bar'),
        fieldOrder: 1,
      }),
      SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason))
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 3,
        }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason))
    );
  });

  it('Method accesses are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionMethodAccess({
        type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceExpressionMethodAccess({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 2,
        }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason))
    );

    assertThrows(
      SourceExpressionMethodAccess({
        type: SourceFunctionType(DummySourceReason, [], {
          type: 'UndecidedType',
          reason: DummySourceReason,
          index: 3,
        }),
        expression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo'),
        }),
        methodName: SourceId('bar'),
      }),
      SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason))
    );
  });

  it('Unary expressions are correctly resolved', () => {
    assertCorrectlyFixed(
      SourceExpressionUnary({
        type: SourceBoolType(DummySourceReason),
        operator: '!',
        expression: TRUE,
      }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      SourceBoolType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionUnary({
        type: SourceIntType(DummySourceReason),
        operator: '-',
        expression: intOf(1),
      }),
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operator: '!',
        expression: TRUE,
      }),
      SourceIntType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operator: '-',
        expression: intOf(1),
      }),
      SourceBoolType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operator: '!',
        expression: intOf(1),
      }),
      SourceBoolType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionUnary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operator: '-',
        expression: TRUE,
      }),
      SourceIntType(DummySourceReason)
    );
  });

  it('Binary expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceIntType(DummySourceReason),
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceIntType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType(DummySourceReason),
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceBoolType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType(DummySourceReason),
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      SourceBoolType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceStringType(DummySourceReason),
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceStringType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionBinary({
        type: SourceBoolType(DummySourceReason),
        operatorPrecedingComments: [],
        operator: EQ,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: EQ,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceBoolType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceBoolType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: intOf(1),
      }),
      SourceIntType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: TRUE,
        e2: TRUE,
      }),
      SourceIntType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceIntType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        associatedComments: [],
        operatorPrecedingComments: [],
        operator: EQ,
        e1: stringOf(''),
        e2: stringOf(''),
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        operatorPrecedingComments: [],
        operator: MUL,
        e1: stringOf(''),
        e2: intOf(1),
      }),
      SourceIntType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: LT,
        e1: intOf(1),
        e2: stringOf(''),
      }),
      SourceBoolType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: AND,
        e1: stringOf(''),
        e2: TRUE,
      }),
      SourceBoolType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 3 },
        operatorPrecedingComments: [],
        operator: CONCAT,
        e1: stringOf(''),
        e2: TRUE,
      }),
      SourceStringType(DummySourceReason)
    );
    assertThrows(
      SourceExpressionBinary({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        operatorPrecedingComments: [],
        operator: EQ,
        e1: TRUE,
        e2: stringOf(''),
      }),
      SourceBoolType(DummySourceReason)
    );
  });

  it('Match expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionMatch({
        type: SourceIntType(DummySourceReason),
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: SourceIntType(DummySourceReason),
              name: '',
            }),
          },
        ],
      }),
      SourceExpressionMatch({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionMatch({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        matchedExpression: SourceExpressionThis({
          type: SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
        }),
        matchingList: [
          {
            range: Range.DUMMY,
            tag: SourceId('A'),
            tagOrder: 1,
            expression: SourceExpressionVariable({
              type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
              name: '',
            }),
          },
        ],
      }),
      SourceIntType(DummySourceReason)
    );
  });

  it('Statement block expressions are correctly resolved.', () => {
    assertCorrectlyFixed(
      SourceExpressionStatementBlock({
        type: SourceUnitType(DummySourceReason),
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 0 },
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceUnitType(DummySourceReason)
    );
    assertCorrectlyFixed(
      SourceExpressionStatementBlock({
        type: SourceIntType(DummySourceReason),
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
          expression: intOf(1),
        },
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceIntType(DummySourceReason)
    );

    assertThrows(
      SourceExpressionStatementBlock({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { range: Range.DUMMY, type: 'WildCardPattern' },
              typeAnnotation: SourceIntType(DummySourceReason),
              assignedExpression: intOf(1),
              associatedComments: [],
            },
          ],
        },
      }),
      SourceIntType(DummySourceReason)
    );
  });

  it('Deep expression integration test', () => {
    const expected = SourceExpressionIfElse({
      type: SourceBoolType(DummySourceReason),
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: SourceBoolType(DummySourceReason),
        functionExpression: SourceExpressionLambda({
          type: SourceFunctionType(
            DummySourceReason,
            [SourceIntType(DummySourceReason)],
            SourceBoolType(DummySourceReason)
          ),
          parameters: [[SourceId('a'), SourceIntType(DummySourceReason)]],
          captured: { a: SourceIntType(DummySourceReason) },
          body: TRUE,
        }),
        functionArguments: [
          SourceExpressionVariable({ type: SourceIntType(DummySourceReason), name: 'v' }),
        ],
      }),
    });
    const unfixed = SourceExpressionIfElse({
      type: { type: 'UndecidedType', reason: DummySourceReason, index: 1 },
      boolExpression: TRUE,
      e1: TRUE,
      e2: SourceExpressionFunctionCall({
        type: { type: 'UndecidedType', reason: DummySourceReason, index: 5 },
        functionExpression: SourceExpressionLambda({
          type: SourceFunctionType(DummySourceReason, [SourceIntType(DummySourceReason)], {
            type: 'UndecidedType',
            reason: DummySourceReason,
            index: 9,
          }),
          parameters: [[SourceId('a'), SourceIntType(DummySourceReason)]],
          captured: { a: { type: 'UndecidedType', reason: DummySourceReason, index: 2 } },
          body: TRUE,
        }),
        functionArguments: [
          SourceExpressionVariable({
            type: { type: 'UndecidedType', reason: DummySourceReason, index: 2 },
            name: 'v',
          }),
        ],
      }),
    });
    assertCorrectlyFixed(expected, unfixed, SourceBoolType(DummySourceReason));
    assertThrows(unfixed, SourceIntType(DummySourceReason));
  });
});
