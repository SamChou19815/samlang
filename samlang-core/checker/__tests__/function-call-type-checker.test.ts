import { DummySourceReason, Location } from '../../ast/common-nodes';
import {
  AstBuilder,
  prettyPrintType,
  SamlangExpression,
  SamlangFunctionType,
  SamlangType,
  SourceExpressionIfElse,
  SourceExpressionInt,
  SourceExpressionLambda,
  SourceExpressionMatch,
  SourceExpressionStatementBlock,
  SourceId,
  SourceUnknownType,
  TypeParameterSignature,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import typeCheckFunctionCall from '../function-call-type-checker';

const IdType = AstBuilder.IdType;

function typeCheck(
  genericFunctionType: SamlangFunctionType,
  typeParameters: readonly TypeParameterSignature[],
  functionArguments: readonly SamlangExpression[],
  returnTypeHint: SamlangType | null,
  isSubtypeMock = true,
) {
  const errorCollector = createGlobalErrorCollector();
  const { solvedGenericType, checkedArguments } = typeCheckFunctionCall(
    genericFunctionType,
    typeParameters,
    DummySourceReason,
    functionArguments,
    returnTypeHint,
    (e, hint) => (hint == null ? e : ({ ...e, type: hint } as SamlangExpression)),
    () => isSubtypeMock,
    errorCollector.getErrorReporter(),
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
      typeCheck(AstBuilder.FunType([], AstBuilder.BoolType), [], [SourceExpressionInt(0)], null),
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
        AstBuilder.FunType([IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        [
          { name: 'A', bound: null },
          { name: 'B', bound: null },
          { name: 'C', bound: null },
        ],
        [
          AstBuilder.ZERO,
          SourceExpressionIfElse({
            type: AstBuilder.BoolType,
            boolExpression: AstBuilder.TRUE,
            e1: AstBuilder.TRUE,
            e2: AstBuilder.TRUE,
          }),
          SourceExpressionMatch({
            type: AstBuilder.BoolType,
            matchedExpression: AstBuilder.TRUE,
            matchingList: [
              {
                location: Location.DUMMY,
                tag: SourceId('A'),
                tagOrder: 0,
                expression: AstBuilder.TRUE,
              },
              {
                location: Location.DUMMY,
                tag: SourceId('B'),
                tagOrder: 1,
                expression: AstBuilder.TRUE,
              },
            ],
          }),
        ],
        null,
      ),
    ).toEqual({
      solvedGenericType: '(int, bool, bool) -> D',
      checkedArgumentsTypes: ['int', 'bool', 'bool'],
      errors: [],
    });
  });

  it('easy case when all arguments can be independently type checked, and return type can be inferred from hint', () => {
    expect(
      typeCheck(
        AstBuilder.FunType([IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        [
          { name: 'A', bound: null },
          { name: 'B', bound: null },
          { name: 'C', bound: null },
          { name: 'D', bound: null },
        ],
        [
          AstBuilder.ZERO,
          SourceExpressionStatementBlock({
            type: AstBuilder.BoolType,
            block: { location: Location.DUMMY, statements: [], expression: AstBuilder.TRUE },
          }),
          SourceExpressionStatementBlock({
            type: AstBuilder.UnitType,
            block: { location: Location.DUMMY, statements: [] },
          }),
        ],
        AstBuilder.BoolType,
      ),
    ).toEqual({
      solvedGenericType: '(int, bool, unit) -> bool',
      checkedArgumentsTypes: ['int', 'bool', 'unit'],
      errors: [],
    });
  });

  it('easy case when all arguments can be independently type checked, but return type cannot', () => {
    expect(
      typeCheck(
        AstBuilder.FunType([IdType('A'), IdType('B'), IdType('C')], IdType('D')),
        [
          { name: 'A', bound: null },
          { name: 'B', bound: null },
          { name: 'C', bound: null },
          { name: 'D', bound: null },
        ],
        [
          AstBuilder.ZERO,
          SourceExpressionStatementBlock({
            type: AstBuilder.BoolType,
            block: { location: Location.DUMMY, statements: [], expression: AstBuilder.TRUE },
          }),
          SourceExpressionStatementBlock({
            type: AstBuilder.UnitType,
            block: { location: Location.DUMMY, statements: [] },
          }),
        ],
        null,
      ),
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
        AstBuilder.FunType(
          [AstBuilder.FunType([IdType('A')], IdType('D')), IdType('T')],
          AstBuilder.BoolType,
        ),
        [{ name: 'T', bound: null }],
        [
          SourceExpressionLambda({
            type: AstBuilder.FunType(
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            parameters: [{ name: SourceId('a'), typeAnnotation: null }],
            captured: new Map(),
            body: AstBuilder.TRUE,
          }),
          SourceExpressionInt(1),
        ],
        null,
      ),
    ).toEqual({
      solvedGenericType: '((A) -> D, int) -> bool',
      checkedArgumentsTypes: ['(A) -> D', 'int'],
      errors: [],
    });
  });

  it('Lambda can be type checked on its own', () => {
    expect(
      typeCheck(
        AstBuilder.FunType([AstBuilder.FunType([IdType('A')], IdType('B'))], AstBuilder.BoolType),
        [
          { name: 'A', bound: null },
          { name: 'B', bound: null },
        ],
        [
          SourceExpressionLambda({
            type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
            parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.IntType }],
            captured: new Map(),
            body: AstBuilder.TRUE,
          }),
        ],
        null,
      ),
    ).toEqual({
      solvedGenericType: '((int) -> int) -> bool',
      checkedArgumentsTypes: ['(int) -> int'],
      errors: [],
    });
  });

  it('Subtype failure', () => {
    expect(
      typeCheck(
        AstBuilder.FunType(
          [AstBuilder.FunType([IdType('A')], AstBuilder.IntType)],
          AstBuilder.BoolType,
        ),
        [{ name: 'A', bound: IdType('A') }],
        [
          SourceExpressionLambda({
            type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
            parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.IntType }],
            captured: new Map(),
            body: AstBuilder.TRUE,
          }),
        ],
        null,
        false,
      ),
    ).toEqual({
      solvedGenericType: '((int) -> int) -> bool',
      checkedArgumentsTypes: ['(int) -> int'],
      errors: [],
    });

    expect(
      typeCheck(
        AstBuilder.FunType(
          [AstBuilder.FunType([IdType('A')], AstBuilder.IntType)],
          AstBuilder.BoolType,
        ),
        [{ name: 'A', bound: IdType('B') }],
        [
          SourceExpressionLambda({
            type: AstBuilder.FunType([AstBuilder.IntType], AstBuilder.IntType),
            parameters: [{ name: SourceId('a'), typeAnnotation: AstBuilder.IntType }],
            captured: new Map(),
            body: AstBuilder.TRUE,
          }),
        ],
        null,
        false,
      ),
    ).toEqual({
      solvedGenericType: '((int) -> int) -> bool',
      checkedArgumentsTypes: ['(int) -> int'],
      errors: [
        '__DUMMY__.sam:0:0-0:0: [UnexpectedSubType]: Expected: subtype of `B`, actual: `int`.',
      ],
    });
  });

  it('Lambda under constrained', () => {
    expect(
      typeCheck(
        AstBuilder.FunType([AstBuilder.FunType([IdType('A')], IdType('B'))], AstBuilder.BoolType),
        [
          { name: 'A', bound: null },
          { name: 'B', bound: null },
        ],
        [
          SourceExpressionLambda({
            type: AstBuilder.FunType(
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            parameters: [{ name: SourceId('a'), typeAnnotation: null }],
            captured: new Map(),
            body: AstBuilder.TRUE,
          }),
        ],
        null,
      ),
    ).toEqual({
      solvedGenericType: '((unknown) -> unknown) -> bool',
      checkedArgumentsTypes: ['(unknown) -> unknown'],
      errors: [
        '__DUMMY__.sam:0:0-0:0: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      ],
    });
  });
});
