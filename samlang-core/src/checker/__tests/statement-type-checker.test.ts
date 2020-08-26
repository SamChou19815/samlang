import {
  Type,
  boolType,
  intType,
  tupleType,
  unitType,
  identifierType,
  isTheSameType,
} from '../../ast/common-nodes';
import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import {
  StatementBlock,
  SamlangExpression,
  SamlangValStatement,
  EXPRESSION_TRUE,
  EXPRESSION_INT,
  EXPRESSION_VARIABLE,
  EXPRESSION_STATEMENT_BLOCK,
} from '../../ast/samlang-expressions';
import type { Pattern } from '../../ast/samlang-pattern';
import { createGlobalErrorCollector } from '../../errors';
import StatementTypeChecker from '../statement-type-checker';
import { AccessibleGlobalTypingContext, LocalTypingContext } from '../typing-context';

const STATEMENT = (
  pattern: Pattern,
  typeAnnotation: Type,
  assignedExpression: SamlangExpression
): SamlangValStatement => ({ range: Range.DUMMY, pattern, typeAnnotation, assignedExpression });

const BLOCK = (
  statements: readonly SamlangValStatement[],
  expression?: SamlangExpression
): StatementBlock => ({ range: Range.DUMMY, statements, expression });

const typeCheckInSandbox = (
  block: StatementBlock,
  expectedType: Type
): readonly [StatementBlock, readonly string[]] => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(ModuleReference.ROOT);

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
      new Set(),
      'A'
    ),
    moduleErrorCollector,
    dummyExpressionTypeChecker
  );
  return [
    checker.typeCheck(block, expectedType, new LocalTypingContext()),
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
            ['a', Range.DUMMY],
            [null, Range.DUMMY],
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
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
            ['a', Range.DUMMY],
            [null, Range.DUMMY],
          ],
        },
        tupleType([intType, boolType]),
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
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
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('A'),
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
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
          ],
        },
        identifierType('A'),
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('A'),
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
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
    ]),
  ],
  [
    'variable pattern 2',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY)
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'b' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY)
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
          EXPRESSION_INT(Range.DUMMY, BigInt(1))
        ),
      ],
      EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'a' })
    ),
    intType,
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          intType,
          EXPRESSION_INT(Range.DUMMY, BigInt(1))
        ),
      ],
      EXPRESSION_VARIABLE({ range: Range.DUMMY, type: intType, name: 'a' })
    ),
  ],

  [
    'wildcard pattern',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
    ]),
    unitType,
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'WildCardPattern' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
    ]),
  ],

  ['de-facto unit literal', BLOCK([]), unitType, BLOCK([])],
  [
    'nested de-facto unit literal',
    BLOCK([], EXPRESSION_STATEMENT_BLOCK({ range: Range.DUMMY, type: unitType, block: BLOCK([]) })),
    unitType,
    BLOCK([], EXPRESSION_STATEMENT_BLOCK({ range: Range.DUMMY, type: unitType, block: BLOCK([]) })),
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
          destructedNames: [['a', Range.DUMMY]],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [TupleSizeMismatch]: Incorrect tuple size. Expected: 2, actual: 1.'],
  ],
  [
    'tuple destructuring 3',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [['a', Range.DUMMY]],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: intType,
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `tuple`, actual: `int`.'],
  ],
  [
    'tuple destructuring 4',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'TuplePattern',
          destructedNames: [
            ['a', Range.DUMMY],
            ['a', Range.DUMMY],
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([intType, boolType]),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],

  [
    'object destructuring 2',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('B'),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [UnresolvedName]: Name `b` is not resolved.'],
  ],
  [
    'object destructuring 3',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('C'),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    [
      ".sam:0:0-0:0: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
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
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'c' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: tupleType([]),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `[]`.'],
  ],
  [
    'object destructuring 5',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'd', fieldOrder: 1, alias: 'c' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('A'),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [UnresolvedName]: Name `d` is not resolved.'],
  ],
  [
    'object destructuring 6',
    BLOCK([
      STATEMENT(
        {
          range: Range.DUMMY,
          type: 'ObjectPattern',
          destructedNames: [
            { range: Range.DUMMY, fieldName: 'a', fieldOrder: 0 },
            { range: Range.DUMMY, fieldName: 'b', fieldOrder: 1, alias: 'a' },
          ],
        },
        { type: 'UndecidedType', index: 0 },
        EXPRESSION_VARIABLE({
          range: Range.DUMMY,
          type: identifierType('A'),
          name: 'foo',
        })
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],

  [
    'variable pattern 4',
    BLOCK([
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        intType,
        EXPRESSION_INT(Range.DUMMY, BigInt(1))
      ),
      STATEMENT(
        { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
        boolType,
        EXPRESSION_TRUE(Range.DUMMY)
      ),
    ]),
    unitType,
    ['.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.'],
  ],
  [
    'variable pattern 5',
    BLOCK(
      [
        STATEMENT(
          { range: Range.DUMMY, type: 'VariablePattern', name: 'a' },
          intType,
          EXPRESSION_INT(Range.DUMMY, BigInt(1))
        ),
      ],
      EXPRESSION_VARIABLE({
        range: Range.DUMMY,
        type: boolType,
        name: 'a',
      })
    ),
    intType,
    ['.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.'],
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
