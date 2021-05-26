import StatementTypeChecker from '../statement-type-checker';
import { AccessibleGlobalTypingContext } from '../typing-context';

import {
  Type,
  boolType,
  intType,
  tupleType,
  unitType,
  identifierType,
  isTheSameType,
  Range,
  ModuleReference,
} from 'samlang-core-ast/common-nodes';
import {
  StatementBlock,
  SamlangExpression,
  SamlangValStatement,
  EXPRESSION_TRUE,
  EXPRESSION_INT,
  EXPRESSION_VARIABLE,
  EXPRESSION_STATEMENT_BLOCK,
} from 'samlang-core-ast/samlang-expressions';
import type { Pattern } from 'samlang-core-ast/samlang-pattern';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { hashMapOf, LocalStackedContext } from 'samlang-core-utils';

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

const typeCheckInSandbox = (
  block: StatementBlock,
  expectedType: Type
): readonly [StatementBlock, readonly string[]] => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.DUMMY);

  const dummyExpressionTypeChecker = (
    expression: SamlangExpression,
    et: Type
  ): SamlangExpression => {
    if (et.type !== 'UndecidedType' && !isTheSameType(expression.type, et)) {
      moduleErrorCollector.reportUnexpectedTypeError(Range.DUMMY, et, expression.type);
    }
    return expression;
  };

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
};

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
            { name: 'a', type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
            { type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          associatedComments: [],
          name: 'foo',
        })
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            { name: 'a', type: intType, range: Range.DUMMY },
            { name: undefined, type: boolType, range: Range.DUMMY },
          ],
        },
        tupleType([intType, boolType]),
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          associatedComments: [],
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'A'),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: intType,
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: boolType,
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        identifierType(ModuleReference.DUMMY, 'A'),
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'A'),
          associatedComments: [],
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
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
    ]),
  ],
  [
    'variable pattern 2',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY, [])
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY, [])
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
          EXPRESSION_INT(Range.DUMMY, [], 1)
        ),
      ],
      EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, associatedComments: [], name: 'a' })
    ),
    intType,
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          intType,
          EXPRESSION_INT(Range.DUMMY, [], 1)
        ),
      ],
      EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, associatedComments: [], name: 'a' })
    ),
  ],

  [
    'wildcard pattern',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        intType,
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
    ]),
  ],

  ['de-facto unit literal', BLOCK([]), unitType, BLOCK([])],
  [
    'nested de-facto unit literal',
    BLOCK(
      [],
      EXPRESSION_STATEMENT_BLOCK({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        block: BLOCK([]),
      })
    ),
    unitType,
    BLOCK(
      [],
      EXPRESSION_STATEMENT_BLOCK({
        range: Range.DUMMY,
        type: unitType,
        associatedComments: [],
        block: BLOCK([]),
      })
    ),
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
          destructedNames: [
            { name: 'a', type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          associatedComments: [],
          name: 'foo',
        })
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
          destructedNames: [
            { name: 'a', type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: intType,
          associatedComments: [],
          name: 'foo',
        })
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
            { name: 'a', type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
            { name: 'a', type: { type: 'UndecidedType', index: 0 }, range: Range.DUMMY },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'B'),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'C'),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([]),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'd',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['c', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'A'),
          associatedComments: [],
          name: 'foo',
        })
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
              fieldName: 'a',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 0,
            },
            {
              range: Range.DUMMY,
              fieldName: 'b',
              fieldNameRange: Range.DUMMY,
              type: { type: 'UndecidedType', index: 0 },
              fieldOrder: 1,
              alias: ['a', Range.DUMMY],
            },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType(ModuleReference.DUMMY, 'A'),
          associatedComments: [],
          name: 'foo',
        })
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
        EXPRESSION_INT(Range.DUMMY, [], 1)
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY, [])
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
          EXPRESSION_INT(Range.DUMMY, [], 1)
        ),
      ],
      EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        type: boolType,
        associatedComments: [],
        name: 'a',
      })
    ),
    intType,
    ['__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.'],
  ],
];

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
