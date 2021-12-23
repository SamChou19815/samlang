import {
  boolType,
  identifierType,
  intType,
  isTheSameType,
  ModuleReference,
  Range,
  tupleType,
  Type,
  unitType,
} from '../../ast/common-nodes';
import {
  Pattern,
  SamlangExpression,
  SamlangValStatement,
  SourceExpressionInt,
  SourceExpressionStatementBlock,
  SourceExpressionTrue,
  SourceExpressionVariable,
  SourceId,
  StatementBlock,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { hashMapOf, LocalStackedContext } from '../../utils';
import StatementTypeChecker from '../statement-type-checker';
import { AccessibleGlobalTypingContext } from '../typing-context';

const STATEMENT = (
  pattern: Pattern,
  typeAnnotation: Type,
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
  expectedType: Type
): readonly [StatementBlock, readonly string[]] {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.DUMMY);

  function dummyExpressionTypeChecker(expression: SamlangExpression, et: Type): SamlangExpression {
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
              names: ['a', 'b'],
              mappings: {
                a: { isPublic: true, type: intType },
                b: { isPublic: false, type: boolType },
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
              names: ['a', 'b'],
              mappings: {
                a: { isPublic: true, type: intType },
                b: { isPublic: false, type: boolType },
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
              names: ['a', 'b'],
              mappings: {
                a: { isPublic: true, type: intType },
                b: { isPublic: true, type: boolType },
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
    checker.typeCheck(block, expectedType, new LocalStackedContext<Type>()),
    globalErrorCollector.getErrors().map((it) => it.toString()),
  ];
}

const passingTypeCheckerTestCases: readonly (readonly [
  string,
  StatementBlock,
  Type,
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
        SourceExpressionVariable({ type: tupleType([intType, boolType]), name: 'foo' })
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            { name: SourceId('a'), type: intType },
            { name: undefined, type: boolType },
          ],
        },
        tupleType([intType, boolType]),
        SourceExpressionVariable({ type: tupleType([intType, boolType]), name: 'foo' })
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
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'A'), name: 'foo' })
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            {
              range: Range.DUMMY,
              fieldName: SourceId('a'),
              type: intType,
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: SourceId('b'),
              type: boolType,
              fieldOrder: 1,
              alias: SourceId('c'),
            },
          ],
        },
        identifierType(ModuleReference.DUMMY, 'A'),
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'A'), name: 'foo' })
      ),
    ]),
  ],

  [
    'variable pattern 1',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        SourceExpressionInt(1)
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        SourceExpressionInt(1)
      ),
    ]),
  ],
  [
    'variable pattern 2',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
        SourceExpressionTrue()
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
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
          intType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: intType, name: 'a' })
    ),
    intType,
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          intType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: intType, name: 'a' })
    ),
  ],

  [
    'wildcard pattern',
    BLOCK([
      STATEMENT({ range: Range.DUMMY, type: 'WildCardPattern' }, intType, SourceExpressionInt(1)),
    ]),
    unitType,
    BLOCK([
      STATEMENT({ range: Range.DUMMY, type: 'WildCardPattern' }, intType, SourceExpressionInt(1)),
    ]),
  ],

  ['de-facto unit literal', BLOCK([]), unitType, BLOCK([])],
  [
    'nested de-facto unit literal',
    BLOCK([], SourceExpressionStatementBlock({ type: unitType, block: BLOCK([]) })),
    unitType,
    BLOCK([], SourceExpressionStatementBlock({ type: unitType, block: BLOCK([]) })),
  ],
];

const failingTypeCheckerTestCases: readonly (readonly [
  string,
  StatementBlock,
  Type,
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
        SourceExpressionVariable({ type: tupleType([intType, boolType]), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: intType, name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: tupleType([intType, boolType]), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'B'), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'C'), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: tupleType([]), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'A'), name: 'foo' })
      ),
    ]),
    unitType,
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
        SourceExpressionVariable({ type: identifierType(ModuleReference.DUMMY, 'A'), name: 'foo' })
      ),
    ]),
    unitType,
    ['__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],

  [
    'variable pattern 4',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        SourceExpressionInt(1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        boolType,
        SourceExpressionTrue()
      ),
    ]),
    unitType,
    ['__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],
  [
    'variable pattern 5',
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          intType,
          SourceExpressionInt(1)
        ),
      ],
      SourceExpressionVariable({ type: boolType, name: 'a' })
    ),
    intType,
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
