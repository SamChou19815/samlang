import { DummySourceReason, Location, ModuleReference } from '../../ast/common-nodes';
import {
  prettyPrintType,
  SamlangExpression,
  SamlangFunctionType,
  SamlangType,
  SourceBoolType,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionStatementBlock,
  SourceExpressionTrue,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceUnitType,
  SourceUnknownType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import typeCheckFunctionCall from '../function-call-type-checker';

const IdType = (id: string, typeArguments?: readonly SamlangType[]) =>
  SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, id, typeArguments);

function typeCheck(
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly string[],
  functionArguments: readonly SamlangExpression[],
  returnTypeHint: SamlangType | null
) {
  const errorCollector = createGlobalErrorCollector();
  const { solvedGenericType, checkedArguments } = typeCheckFunctionCall(
    genericFunctionType,
    typeParameters,
    DummySourceReason,
    functionArguments,
    returnTypeHint,
    (e, hint) => (hint == null ? e : ({ ...e, type: hint } as SamlangExpression)),
    errorCollector.getErrorReporter()
  );
  return {
    solvedGenericType: prettyPrintType(solvedGenericType),
    checkedArgumentsTypes: checkedArguments.map((it) => prettyPrintType(it.type)),
    errors: errorCollector
      .getErrors()
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b)),
  };
}

describe('function-call-type-checker', () => {
  it('function call args mismatch', () => {
    expect(
      typeCheck(
        SourceFunctionType(DummySourceReason, [], SourceBoolType(DummySourceReason)),
        [],
        [SourceExpressionInt(0)],
        null
      )
    ).toEqual({
      solvedGenericType: '() -> bool',
      checkedArgumentsTypes: ['int'],
      errors: [
        '__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect arguments size. Expected: 0, actual: 1.',
      ],
    });
  });

  it('easy case when all arguments can be independently type checked', () => {
    expect(
      typeCheck(
        SourceFunctionType(DummySourceReason, [IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        ['A', 'B', 'C'],
        [
          SourceExpressionInt(0),
          SourceExpressionIfElse({
            type: SourceBoolType(DummySourceReason),
            boolExpression: SourceExpressionTrue(),
            e1: SourceExpressionTrue(),
            e2: SourceExpressionTrue(),
          }),
          SourceExpressionMatch({
            type: SourceBoolType(DummySourceReason),
            matchedExpression: SourceExpressionTrue(),
            matchingList: [
              {
                location: Location.DUMMY,
                tag: SourceId('A'),
                tagOrder: 0,
                expression: SourceExpressionTrue(),
              },
              {
                location: Location.DUMMY,
                tag: SourceId('B'),
                tagOrder: 1,
                expression: SourceExpressionTrue(),
              },
            ],
          }),
        ],
        null
      )
    ).toEqual({
      solvedGenericType: '(int, bool, bool) -> D',
      checkedArgumentsTypes: ['int', 'bool', 'bool'],
      errors: [],
    });
  });

  it('easy case when all arguments can be independently type checked, and return type can be inferred from hint', () => {
    expect(
      typeCheck(
        SourceFunctionType(DummySourceReason, [IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        ['A', 'B', 'C', 'D'],
        [
          SourceExpressionInt(0),
          SourceExpressionStatementBlock({
            type: SourceBoolType(DummySourceReason),
            block: {
              location: Location.DUMMY,
              statements: [],
              expression: SourceExpressionTrue(),
            },
          }),
          SourceExpressionStatementBlock({
            type: SourceUnitType(DummySourceReason),
            block: {
              location: Location.DUMMY,
              statements: [],
            },
          }),
        ],
        SourceBoolType(DummySourceReason)
      )
    ).toEqual({
      solvedGenericType: '(int, bool, unit) -> bool',
      checkedArgumentsTypes: ['int', 'bool', 'unit'],
      errors: [],
    });
  });

  it('easy case when all arguments can be independently type checked, but return type cannot', () => {
    expect(
      typeCheck(
        SourceFunctionType(DummySourceReason, [IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        ['A', 'B', 'C', 'D'],
        [
          SourceExpressionInt(0),
          SourceExpressionStatementBlock({
            type: SourceBoolType(DummySourceReason),
            block: {
              location: Location.DUMMY,
              statements: [],
              expression: SourceExpressionTrue(),
            },
          }),
          SourceExpressionStatementBlock({
            type: SourceUnitType(DummySourceReason),
            block: {
              location: Location.DUMMY,
              statements: [],
            },
          }),
        ],
        null
      )
    ).toEqual({
      solvedGenericType: '(int, bool, unit) -> unknown',
      checkedArgumentsTypes: ['int', 'bool', 'unit'],
      errors: [
        '__DUMMY__.sam:0:0-0:0: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      ],
    });
  });

  it('Lambda expressions must be contextually typed', () => {
    expect(
      typeCheck(
        SourceFunctionType(
          DummySourceReason,
          [SourceFunctionType(DummySourceReason, [IdType('A')], IdType('D')), IdType('T')],
          SourceBoolType(DummySourceReason)
        ),
        ['T'],
        [
          SourceExpressionLambda({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason)
            ),
            parameters: [{ name: SourceId('a'), typeAnnotation: null }],
            captured: {},
            body: SourceExpressionTrue(),
          }),
          SourceExpressionInt(1),
        ],
        null
      )
    ).toEqual({
      solvedGenericType: '((A) -> D, int) -> bool',
      checkedArgumentsTypes: ['(A) -> D', 'int'],
      errors: [],
    });
  });

  it('Lambda can be type checked on its own', () => {
    expect(
      typeCheck(
        SourceFunctionType(
          DummySourceReason,
          [SourceFunctionType(DummySourceReason, [IdType('A')], IdType('B'))],
          SourceBoolType(DummySourceReason)
        ),
        ['A', 'B'],
        [
          SourceExpressionLambda({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceIntType(DummySourceReason)],
              SourceIntType(DummySourceReason)
            ),
            parameters: [{ name: SourceId('a'), typeAnnotation: SourceIntType(DummySourceReason) }],
            captured: {},
            body: SourceExpressionTrue(),
          }),
        ],
        null
      )
    ).toEqual({
      solvedGenericType: '((int) -> int) -> bool',
      checkedArgumentsTypes: ['(int) -> int'],
      errors: [],
    });
  });

  it('Lambda under constrained', () => {
    expect(
      typeCheck(
        SourceFunctionType(
          DummySourceReason,
          [SourceFunctionType(DummySourceReason, [IdType('A')], IdType('B'))],
          SourceBoolType(DummySourceReason)
        ),
        ['A', 'B'],
        [
          SourceExpressionLambda({
            type: SourceFunctionType(
              DummySourceReason,
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason)
            ),
            parameters: [{ name: SourceId('a'), typeAnnotation: null }],
            captured: {},
            body: SourceExpressionTrue(),
          }),
        ],
        null
      )
    ).toEqual({
      solvedGenericType: '((unknown) -> unknown) -> bool',
      checkedArgumentsTypes: ['(unknown) -> unknown'],
      errors: [
        '__DUMMY__.sam:0:0-0:0: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      ],
    });
  });
});
