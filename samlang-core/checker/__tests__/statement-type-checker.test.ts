import { ModuleReference, Range } from '../../ast/common-nodes';
import {
  isTheSameType,
  Pattern,
  SamlangExpression,
  SamlangType,
  SamlangValStatement,
  SourceBoolType,
  SourceExpressionInt,
  SourceExpressionStatementBlock,
  SourceExpressionTrue,
  SourceExpressionVariable,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceTupleType,
  SourceUnitType,
  StatementBlock,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { hashMapOf, LocalStackedContext } from '../../utils';
import StatementTypeChecker from '../statement-type-checker';
import { AccessibleGlobalTypingContext } from '../typing-context';

const STATEMENT = (
  pattern: Pattern,
  typeAnnotation: SamlangType,
  assignedExpression: SamlangExpression
): SamlangValStatement => ({
  range: Range.DUMMY,
  pattern,
  typeAnnotation,
  assignedExpression,
  associatedComments: [],
});

const BLOCK = (
  statements: readonly SamlangValStatement[],
  expression?: SamlangExpression
): StatementBlock => ({ range: Range.DUMMY, statements, expression });

function typeCheckInSandbox(
  block: StatementBlock,
  expectedType: SamlangType
): readonly [StatementBlock, readonly string[]] {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.DUMMY);

  function dummyExpressionTypeChecker(
    expression: SamlangExpression,
    et: SamlangType
  ): SamlangExpression {
    if (et.type !== 'UndecidedType' && !isTheSameType(expression.type, et)) {
      moduleErrorCollector.reportUnexpectedTypeError(Range.DUMMY, et, expression.type);
    }
    return expression;
  }

  const checker = new StatementTypeChecker(
    new AccessibleGlobalTypingContext(
      ModuleReference.DUMMY,
      hashMapOf([
        ModuleReference.DUMMY,
        {
          A: {
            typeParameters: [],
            typeDefinition: {
              range: Range.DUMMY,
              type: 'object',
              names: [SourceId('a'), SourceId('b')],
              mappings: {
                a: { isPublic: true, type: SourceIntType },
                b: { isPublic: false, type: SourceBoolType },
              },
            },
            functions: {},
            methods: {},
          },
          B: {
            typeParameters: [],
            typeDefinition: {
              range: Range.DUMMY,
              type: 'object',
              names: [SourceId('a'), SourceId('b')],
              mappings: {
                a: { isPublic: true, type: SourceIntType },
                b: { isPublic: false, type: SourceBoolType },
              },
            },
            functions: {},
            methods: {},
          },
          C: {
            typeParameters: [],
            typeDefinition: {
              range: Range.DUMMY,
              type: 'variant',
              names: [SourceId('a'), SourceId('b')],
              mappings: {
                a: { isPublic: true, type: SourceIntType },
                b: { isPublic: true, type: SourceBoolType },
              },
            },
            functions: {},
            methods: {},
          },
        },
      ]),
      new Set(),
      'A'
    ),
    moduleErrorCollector,
    dummyExpressionTypeChecker
  );
  return [
    checker.typeCheck(block, expectedType, new LocalStackedContext<SamlangType>()),
    globalErrorCollector.getErrors().map((it) => it.toString()),
  ];
}

const passingTypeCheckerTestCases: readonly (readonly [
  string,
  StatementBlock,
  SamlangType,
  StatementBlock
])[] = [
  [
    'tuple destructuring 1',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            { name: SourceId('a'), type: { type: 'UndecidedType', index: 0 } },
            { type: { type: 'UndecidedType', index: 0 } },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceTupleType([SourceIntType, SourceBoolType]),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            { name: SourceId('a'), type: SourceIntType },
            { name: undefined, type: SourceBoolType },
          ],
        },
        SourceTupleType([SourceIntType, SourceBoolType]),
        SourceExpressionVariable({
          type: SourceTupleType([SourceIntType, SourceBoolType]),
          name: 'foo',
        })
      ),
    ]),
  ],

  [
    'object destructuring 1',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: SourceIntType,
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: SourceBoolType,
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        SourceIdentifierType(ModuleReference.DUMMY, 'A'),
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
          name: 'foo',
        })
      ),
    ]),
  ],

  [
    'variable pattern 1',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
    ]),
    SourceUnitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
    ]),
  ],
  [
    'variable pattern 2',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        SourceBoolType,
        SourceExpressionTrue()
      ),
    ]),
    SourceUnitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        SourceBoolType,
        SourceExpressionTrue()
      ),
    ]),
  ],
  [
    'variable pattern 3',
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          SourceIntType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: SourceIntType, name: 'a' })
    ),
    SourceIntType,
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          SourceIntType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: SourceIntType, name: 'a' })
    ),
  ],

  [
    'wildcard pattern',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
    ]),
    SourceUnitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
    ]),
  ],

  ['de-facto unit literal', BLOCK([]), SourceUnitType, BLOCK([])],
  [
    'nested de-facto unit literal',
    BLOCK([], SourceExpressionStatementBlock({ type: SourceUnitType, block: BLOCK([]) })),
    SourceUnitType,
    BLOCK([], SourceExpressionStatementBlock({ type: SourceUnitType, block: BLOCK([]) })),
  ],
];

const failingTypeCheckerTestCases: readonly (readonly [
  string,
  StatementBlock,
  SamlangType,
  readonly string[]
])[] = [
  [
    'tuple destructuring 2',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [{ name: SourceId('a'), type: { type: 'UndecidedType', index: 0 } }],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceTupleType([SourceIntType, SourceBoolType]),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [TupleSizeMismatch]: Incorrect tuple size. Expected: 2, actual: 1.'],
  ],
  [
    'tuple destructuring 3',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [{ name: SourceId('a'), type: { type: 'UndecidedType', index: 0 } }],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({ type: SourceIntType, name: 'foo' })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `tuple`, actual: `int`.'],
  ],
  [
    'tuple destructuring 4',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            { name: SourceId('a'), type: { type: 'UndecidedType', index: 0 } },
            { name: SourceId('a'), type: { type: 'UndecidedType', index: 0 } },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceTupleType([SourceIntType, SourceBoolType]),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],

  [
    'object destructuring 2',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'B'),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [UnresolvedName]: Name `b` is not resolved.'],
  ],
  [
    'object destructuring 3',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'C'),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    [
      "__DUMMY__.sam:0:0-0:0: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    ],
  ],
  [
    'object destructuring 4',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({ type: SourceTupleType([]), name: 'foo' })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `[]`.'],
  ],
  [
    'object destructuring 5',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('d'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [UnresolvedName]: Name `d` is not resolved.'],
  ],
  [
    'object destructuring 6',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: SourceId('a'),
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        SourceExpressionVariable({
          type: SourceIdentifierType(ModuleReference.DUMMY, 'A'),
          name: 'foo',
        })
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],

  [
    'variable pattern 4',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceIntType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        SourceBoolType,
        SourceExpressionTrue()
      ),
    ]),
    SourceUnitType,
    ['__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],
  [
    'variable pattern 5',
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          SourceIntType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: SourceBoolType, name: 'a' })
    ),
    SourceIntType,
    ['__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.'],
  ],
];

describe('statement-type-checker', () => {
  passingTypeCheckerTestCases.forEach(([name, block, expectedType, expectedResult]) => {
    it(`It passes: ${name}`, () => {
      const [actualResult, actualErrors] = typeCheckInSandbox(block, expectedType);
      expect(actualResult).toEqual(expectedResult);
      expect(actualErrors).toEqual([]);
    });
  });

  failingTypeCheckerTestCases.forEach(([name, block, expectedType, expectedErrors]) => {
    it(`It fails: ${name}`, () =>
      expect(typeCheckInSandbox(block, expectedType)[1]).toEqual(expectedErrors));
  });
});
