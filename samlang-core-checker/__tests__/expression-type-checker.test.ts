import { parseSamlangExpressionFromText } from 'samlang-core-parser';
import {
  Type,
  unitType as unit,
  boolType as bool,
  intType as int,
  stringType as string,
  identifierType,
  tupleType,
  functionType,
  Range,
  ModuleReference,
} from 'samlang-core/ast/common-nodes';
import { PLUS } from 'samlang-core/ast/common-operators';
import {
  SamlangExpression,
  SourceExpressionInt,
  SourceExpressionVariable,
  SourceExpressionFunctionCall,
  SourceExpressionBinary,
  SourceExpressionIfElse,
  SourceExpressionStatementBlock,
  SourceExpressionLambda,
} from 'samlang-core/ast/samlang-nodes';
import { createGlobalErrorCollector } from 'samlang-core/errors';
import { checkNotNull, hashMapOf, LocalStackedContext } from 'samlang-core/utils';

import typeCheckExpression from '../expression-type-checker';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from '../global-typing-context-builder';
import TypeResolution from '../type-resolution';
import { AccessibleGlobalTypingContext } from '../typing-context';

const dummyModuleReference: ModuleReference = new ModuleReference(['Test']);

function typeCheckInSandbox(
  source: string,
  expectedType: Type,
  additionalBindings: readonly (readonly [string, Type])[] = [],
  currentClass?: string
): readonly [SamlangExpression, readonly string[]] {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(dummyModuleReference);
  const accessibleGlobalTypingContext: AccessibleGlobalTypingContext =
    new AccessibleGlobalTypingContext(
      dummyModuleReference,
      hashMapOf(
        [ModuleReference.ROOT, DEFAULT_BUILTIN_TYPING_CONTEXT],
        [
          dummyModuleReference,
          {
            Test: {
              typeParameters: [],
              typeDefinition: {
                range: Range.DUMMY,
                type: 'object',
                names: ['foo', 'bar'],
                mappings: {
                  foo: { isPublic: true, type: bool },
                  bar: { isPublic: false, type: int },
                },
              },
              functions: {
                helloWorld: {
                  isPublic: false,
                  typeParameters: [],
                  type: functionType([string], unit),
                },
              },
              methods: {
                baz: { isPublic: false, typeParameters: [], type: functionType([int], bool) },
              },
            },
            Test2: {
              typeParameters: [],
              typeDefinition: {
                range: Range.DUMMY,
                type: 'variant',
                names: ['Foo', 'Bar'],
                mappings: {
                  Foo: { isPublic: true, type: bool },
                  Bar: { isPublic: true, type: int },
                },
              },
              functions: {},
              methods: {},
            },
            Test3: {
              typeParameters: ['E'],
              typeDefinition: {
                range: Range.DUMMY,
                type: 'object',
                names: ['foo', 'bar'],
                mappings: {
                  foo: { isPublic: true, type: identifierType(dummyModuleReference, 'E') },
                  bar: { isPublic: false, type: int },
                },
              },
              functions: {},
              methods: {},
            },
            Test4: {
              typeParameters: ['E'],
              typeDefinition: {
                range: Range.DUMMY,
                type: 'variant',
                names: ['Foo', 'Bar'],
                mappings: {
                  Foo: { isPublic: true, type: identifierType(dummyModuleReference, 'E') },
                  Bar: { isPublic: true, type: int },
                },
              },
              functions: {},
              methods: {},
            },
          },
        ]
      ),
      new Set(),
      currentClass ?? 'Test'
    );

  // Parse
  const parsedExpression = checkNotNull(
    parseSamlangExpressionFromText(
      source,
      dummyModuleReference,
      new Set(Object.keys(DEFAULT_BUILTIN_TYPING_CONTEXT)),
      moduleErrorCollector
    )
  );
  expect(globalErrorCollector.getErrors()).toEqual([]);

  // Type Check
  const checkedExpression = typeCheckExpression(
    parsedExpression,
    moduleErrorCollector,
    accessibleGlobalTypingContext,
    (() => {
      const context = new LocalStackedContext<Type>();
      additionalBindings.forEach(([name, type]) => context.addLocalValueType(name, type, () => {}));
      return context;
    })(),
    new TypeResolution(),
    expectedType
  );
  return [
    checkedExpression,
    globalErrorCollector
      .getErrors()
      .map((error) => error.toString())
      .sort(),
  ];
}

function assertTypeChecks(
  source: string,
  expectedType: Type,
  expectedExpression?: SamlangExpression,
  additionalBindings?: readonly (readonly [string, Type])[],
  currentClass?: string
): void {
  const [actualExpression, errors] = typeCheckInSandbox(
    source,
    expectedType,
    additionalBindings,
    currentClass
  );
  if (expectedExpression) {
    const standardize = (json: unknown): unknown =>
      JSON.parse(
        JSON.stringify(
          json,
          (_, value) => {
            if (value instanceof Range) return '';
            if (value instanceof ModuleReference) {
              return value.toString();
            }
            return value;
          },
          4
        )
      );
    expect(standardize(actualExpression)).toStrictEqual(standardize(expectedExpression));
  }
  expect(errors).toEqual([]);
}

function assertTypeErrors(
  source: string,
  expectedType: Type,
  expectedErrors: readonly string[],
  additionalBindings?: readonly (readonly [string, Type])[],
  currentClass?: string
): void {
  expect(typeCheckInSandbox(source, expectedType, additionalBindings, currentClass)[1]).toEqual(
    expectedErrors
  );
}

describe('expression-type-checker', () => {
  it('Literal', () => {
    assertTypeChecks('true', bool);
    assertTypeChecks('false', bool);
    assertTypeChecks('42', int);
    assertTypeChecks('"a"', string);

    assertTypeErrors('true', unit, [
      'Test.sam:1:1-1:5: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('false', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('42', unit, [
      'Test.sam:1:1-1:3: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('"a"', unit, [
      'Test.sam:1:1-1:4: [UnexpectedType]: Expected: `unit`, actual: `string`.',
    ]);
  });

  it('This', () => {
    assertTypeChecks('this', identifierType(dummyModuleReference, 'Test'), undefined, [
      ['this', identifierType(dummyModuleReference, 'Test')],
    ]);

    assertTypeErrors('this', int, [
      'Test.sam:1:1-1:5: [IllegalThis]: Keyword `this` cannot be used in this context.',
    ]);
  });

  it('Variable', () => {
    assertTypeChecks('foo', int, undefined, [['foo', int]]);
    assertTypeChecks('{ val foo = 3; foo }', int);

    assertTypeErrors('foo', int, [
      'Test.sam:1:1-1:4: [UnresolvedName]: Name `foo` is not resolved.',
    ]);
    assertTypeErrors('{ val foo = true; foo }', int, [
      'Test.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
  });

  it('ClassMember', () => {
    assertTypeChecks('Test.helloWorld', functionType([string], unit));

    assertTypeErrors('Test.helloWorld2', functionType([string], unit), [
      'Test.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved.',
    ]);
  });

  it('TupleConstructor', () => {
    assertTypeChecks('[1, 2, 3]', tupleType([int, int, int]));

    assertTypeErrors('[1, 2, 3]', tupleType([int, int, bool]), [
      'Test.sam:1:1-1:10: [UnexpectedType]: Expected: `[int * int * bool]`, actual: `[int * int * int]`.',
    ]);
    assertTypeErrors('[1, 2, 3]', int, [
      'Test.sam:1:1-1:10: [UnexpectedTypeKind]: Expected kind: `tuple`, actual: `int`.',
      'Test.sam:1:1-1:10: [UnexpectedType]: Expected: `int`, actual: `[int * int * int]`.',
    ]);
  });

  it('FieldConstructor', () => {
    assertTypeChecks('{foo:true,bar:3}', identifierType(dummyModuleReference, 'Test'));
    assertTypeChecks('{ val foo=true; {foo,bar:3} }', identifierType(dummyModuleReference, 'Test'));
    assertTypeChecks(
      '{ val foo=true; {foo,bar:3} }',
      identifierType(dummyModuleReference, 'Test3', [bool]),
      undefined,
      undefined,
      'Test3'
    );

    assertTypeErrors('{foo:true,bar:3,foo:true}', identifierType(dummyModuleReference, 'Test'), [
      'Test.sam:1:17-1:25: [DuplicateFieldDeclaration]: Field name `foo` is declared twice.',
    ]);
    assertTypeErrors('{foo:true,bar:3,baz:true}', identifierType(dummyModuleReference, 'Test'), [
      'Test.sam:1:1-1:26: [InconsistentFieldsInObject]: Inconsistent fields. Expected: `bar, foo`, actual: `bar, baz, foo`.',
    ]);
    assertTypeErrors('{foo:true,bar:false}', identifierType(dummyModuleReference, 'Test'), [
      'Test.sam:1:11-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('{ val foo=3; {foo,bar:3} }', identifierType(dummyModuleReference, 'Test'), [
      'Test.sam:1:15-1:18: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}', int, [
      'Test.sam:1:1-1:17: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
      'Test.sam:1:1-1:17: [UnexpectedType]: Expected: `int`, actual: `Test`.',
    ]);
    assertTypeErrors(
      '{ val foo=true; {foo,bar:3} }',
      identifierType(dummyModuleReference, 'Test2', [bool]),
      [
        "Test.sam:1:17-1:28: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      ],
      undefined,
      'Test2'
    );
  });

  it('VariantConstructor', () => {
    assertTypeChecks(
      'Foo(true)',
      identifierType(dummyModuleReference, 'Test2'),
      undefined,
      undefined,
      'Test2'
    );
    assertTypeChecks(
      'Bar(42)',
      identifierType(dummyModuleReference, 'Test2'),
      undefined,
      undefined,
      'Test2'
    );
    assertTypeChecks(
      'Foo(true)}',
      identifierType(dummyModuleReference, 'Test4', [bool]),
      undefined,
      undefined,
      'Test4'
    );

    assertTypeErrors('Foo(true)', identifierType(dummyModuleReference, 'Test2'), [
      "Test.sam:1:1-1:10: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
    ]);
    assertTypeErrors('Bar(42)', identifierType(dummyModuleReference, 'Test2'), [
      "Test.sam:1:1-1:8: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
    ]);
    assertTypeErrors(
      'Tars(42)',
      identifierType(dummyModuleReference, 'Test2'),
      ['Test.sam:1:1-1:9: [UnresolvedName]: Name `Tars` is not resolved.'],
      undefined,
      'Test2'
    );
  });

  it('FieldAccess && MethodAccess', () => {
    assertTypeChecks('{foo:true,bar:3}.foo', bool);
    assertTypeChecks('{foo:true,bar:3}.bar', int);
    assertTypeChecks('{foo:true,bar:3}.baz', functionType([int], bool));

    assertTypeErrors('3.foo', int, [
      'Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.bazz', int, [
      'Test.sam:1:1-1:22: [UnresolvedName]: Name `bazz` is not resolved.',
    ]);
    assertTypeErrors('{ val _ = (t3: Test3<bool>) -> t3.bar }', unit, [
      'Test.sam:1:32-1:38: [UnresolvedName]: Name `bar` is not resolved.',
    ]);
    assertTypeErrors(
      'Foo(true).foo',
      int,
      [
        "Test.sam:1:1-1:10: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      ],
      undefined,
      'Test2'
    );

    assertTypeErrors('{foo:true,bar:3}.foo', int, [
      'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.bar', bool, [
      'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.baz', int, [
      'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.baz', functionType([bool], int), [
      'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.',
    ]);

    assertTypeErrors('{ val _ = (t) -> t.foo; }', unit, [
      'Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.bar; }', unit, [
      'Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.baz; }', unit, [
      'Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
  });

  it('Unary', () => {
    assertTypeChecks('-(1)', int);
    assertTypeChecks('!true', bool);
    assertTypeChecks('!false', bool);

    assertTypeErrors('-(false)', int, [
      'Test.sam:1:3-1:8: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('!1', bool, [
      'Test.sam:1:2-1:3: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('-(1+1)', bool, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('!true', int, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('!false', int, [
      'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
  });

  it('Panic', () => {
    assertTypeChecks('Builtins.panic("")', unit);
    assertTypeChecks('Builtins.panic("")', bool);
    assertTypeChecks('Builtins.panic("")', int);
    assertTypeChecks('Builtins.panic("")', string);
    assertTypeChecks('Builtins.panic("")', tupleType([int, bool]));

    assertTypeErrors('Builtins.panic(3)', unit, [
      'Test.sam:1:16-1:17: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
  });

  it('FunctionCall', () => {
    assertTypeChecks('Test.helloWorld("")', unit);
    assertTypeChecks('{foo:true,bar:3}.baz(3)', bool);
    assertTypeChecks('((i) -> true)(3)', bool);

    assertTypeErrors('3(3)', unit, [
      'Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `function`, actual: `int`.',
      'Test.sam:1:1-1:2: [UnexpectedType]: Expected: `(__UNDECIDED__) -> unit`, actual: `int`.',
    ]);

    assertTypeErrors('Test.helloWorld(3)', unit, [
      'Test.sam:1:17-1:18: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.baz({})', bool, [
      'Test.sam:1:22-1:24: [UnexpectedType]: Expected: `int`, actual: `unit`.',
    ]);
    assertTypeErrors('((i: int) -> true)({})', bool, [
      'Test.sam:1:20-1:22: [UnexpectedType]: Expected: `int`, actual: `unit`.',
    ]);

    assertTypeErrors('Test.helloWorld("")', bool, [
      'Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(__UNDECIDED__) -> bool`, actual: `(string) -> unit`.',
    ]);
    assertTypeErrors('{foo:true,bar:3}.baz(3)', int, [
      'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(__UNDECIDED__) -> int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors('((i) -> true)(3)', int, [
      'Test.sam:1:2-1:13: [UnexpectedType]: Expected: `(__UNDECIDED__) -> int`, actual: `(__UNDECIDED__) -> bool`.',
      'Test.sam:1:2-1:13: [UnexpectedType]: Expected: `(__UNDECIDED__) -> int`, actual: `(__UNDECIDED__) -> bool`.',
    ]);
  });

  it('Binary', () => {
    assertTypeChecks('1 * 1', int);
    assertTypeChecks('1 - 1', int);
    assertTypeChecks('1 % 1', int);
    assertTypeChecks('1 + 1', int);
    assertTypeChecks('1 - 1', int);
    assertTypeChecks('1 < 1', bool);
    assertTypeChecks('1 <= 1', bool);
    assertTypeChecks('1 > 1', bool);
    assertTypeChecks('1 >= 1', bool);
    assertTypeChecks('true || false', bool);
    assertTypeChecks('false && true', bool);
    assertTypeChecks('"false" :: "string"', string);
    assertTypeChecks('1 == 1', bool);
    assertTypeChecks('true == false', bool);
    assertTypeChecks('false != true', bool);
    assertTypeChecks('"" != "3"', bool);
    assertTypeChecks('{ val _ = (t, f) -> t == f; }', unit);

    assertTypeErrors('"1" * "1"', int, [
      'Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.',
      'Test.sam:1:7-1:10: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('"1" - 1', int, [
      'Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('1 % "1"', int, [
      'Test.sam:1:5-1:8: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('1 + false', int, [
      'Test.sam:1:5-1:10: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('false - 1', int, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('"" < false', bool, [
      'Test.sam:1:1-1:3: [UnexpectedType]: Expected: `int`, actual: `string`.',
      'Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('1 <= false', bool, [
      'Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('1 > ""', bool, [
      'Test.sam:1:5-1:7: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('true >= 1', bool, [
      'Test.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('false || 4', bool, [
      'Test.sam:1:10-1:11: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('2 && 3', bool, [
      'Test.sam:1:1-1:2: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'Test.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('1 == false', bool, [
      'Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('true == 3', bool, [
      'Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('true != 3', bool, [
      'Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('"" != 3', bool, [
      'Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('{ val _ = (t: int, f: bool) -> t == f; }', unit, [
      'Test.sam:1:37-1:38: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);

    assertTypeErrors('1 * 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 - 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 % 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 + 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 - 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 < 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 <= 1', unit, [
      'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 > 1', unit, [
      'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 >= 1', unit, [
      'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true || false', unit, [
      'Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('false && true', unit, [
      'Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 == 1', unit, [
      'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true == false', unit, [
      'Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true != true', unit, [
      'Test.sam:1:1-1:13: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('"" != "3"', unit, [
      'Test.sam:1:1-1:10: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
  });

  it('IfElse', () => {
    assertTypeChecks('if true then false else true', bool);
    assertTypeChecks('if false then 1 else 0', int);
    assertTypeChecks('if false then "" else ""', string);
    assertTypeChecks('{ val _ = (b, t: int, f) -> if b then t else f }', unit);

    assertTypeErrors('if true then false else 1', bool, [
      'Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      'Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('if false then 1 else false', int, [
      'Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      'Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('if false then "" else 3', string, [
      'Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.',
      'Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('{ val _ = (b, t: bool, f: int) -> if b then t else f }', unit, [
      'Test.sam:1:52-1:53: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
  });

  it('Match', () => {
    assertTypeChecks(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }',
      unit,
      undefined,
      undefined,
      'Test2'
    );

    assertTypeErrors('{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }', unit, [
      "Test.sam:1:32-1:33: [IllegalOtherClassMatch]: It is illegal to match on a value of other class's type.",
    ]);
    assertTypeErrors('{ val _ = (t) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }', unit, [
      'Test.sam:1:25-1:26: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
    assertTypeErrors('match (3) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      'Test.sam:1:8-1:9: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('match ({foo:true,bar:3}) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      "Test.sam:1:8-1:24: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
    ]);
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Baz s -> 2 }; }',
      unit,
      [
        'Test.sam:1:25-1:64: [NonExhausiveMatch]: The following tags are not considered in the match: [Bar].',
        'Test.sam:1:50-1:62: [UnresolvedName]: Name `Baz` is not resolved.',
      ],
      undefined,
      'Test2'
    );
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar t -> 2 }; }',
      unit,
      ['Test.sam:1:50-1:62: [Collision]: Name `t` collides with a previously defined name.'],
      undefined,
      'Test2'
    );
  });

  it('Lambda', () => {
    assertTypeChecks('{val _ = (a, b, c) -> if a(b + 1) then b else c;}', unit);

    assertTypeErrors('(a, a) -> a', functionType([int, int], int), [
      'Test.sam:1:1-1:12: [Collision]: Name `a` collides with a previously defined name.',
    ]);
  });

  it('IfElse integration test', () => {
    assertTypeChecks(
      '{ val _ = (b, t, f: int) -> if b then t else f }',
      unit,
      SourceExpressionStatementBlock({
        type: unit,
        block: {
          range: Range.DUMMY,
          statements: [
            {
              range: Range.DUMMY,
              pattern: { type: 'WildCardPattern', range: Range.DUMMY },
              typeAnnotation: functionType([bool, int, int], int),
              assignedExpression: SourceExpressionLambda({
                type: functionType([bool, int, int], int),
                parameters: [
                  ['b', Range.DUMMY, bool],
                  ['t', Range.DUMMY, int],
                  ['f', Range.DUMMY, int],
                ],
                captured: {},
                body: SourceExpressionIfElse({
                  type: int,
                  boolExpression: SourceExpressionVariable({ type: bool, name: 'b' }),
                  e1: SourceExpressionVariable({ type: int, name: 't' }),
                  e2: SourceExpressionVariable({ type: int, name: 'f' }),
                }),
              }),
              associatedComments: [],
            },
          ],
        },
      })
    );
  });

  it('Lambda integration test', () => {
    const source = `{
    val f = (a, b, c) -> {
        val f = (d, e) -> a + b + c + d + e;
        f(1, 2)
    };
    f(3, 4, 5)
}
`;
    const expectedExpression = SourceExpressionStatementBlock({
      type: int,
      block: {
        range: Range.DUMMY,
        statements: [
          {
            range: Range.DUMMY,
            pattern: { type: 'VariablePattern', range: Range.DUMMY, name: 'f' },
            typeAnnotation: functionType([int, int, int], int),
            assignedExpression: SourceExpressionLambda({
              type: functionType([int, int, int], int),
              parameters: [
                ['a', Range.DUMMY, int],
                ['b', Range.DUMMY, int],
                ['c', Range.DUMMY, int],
              ],
              captured: {},
              body: SourceExpressionStatementBlock({
                type: int,
                block: {
                  range: Range.DUMMY,
                  statements: [
                    {
                      range: Range.DUMMY,
                      pattern: { type: 'VariablePattern', range: Range.DUMMY, name: 'f' },
                      typeAnnotation: functionType([int, int], int),
                      assignedExpression: SourceExpressionLambda({
                        type: functionType([int, int], int),
                        parameters: [
                          ['d', Range.DUMMY, int],
                          ['e', Range.DUMMY, int],
                        ],
                        captured: { a: int, b: int, c: int },
                        body: SourceExpressionBinary({
                          type: int,
                          operatorPrecedingComments: [],
                          operator: PLUS,
                          e1: SourceExpressionBinary({
                            type: int,
                            operatorPrecedingComments: [],
                            operator: PLUS,
                            e1: SourceExpressionBinary({
                              type: int,
                              operatorPrecedingComments: [],
                              operator: PLUS,
                              e1: SourceExpressionBinary({
                                type: int,
                                operatorPrecedingComments: [],
                                operator: PLUS,
                                e1: SourceExpressionVariable({ type: int, name: 'a' }),
                                e2: SourceExpressionVariable({ type: int, name: 'b' }),
                              }),
                              e2: SourceExpressionVariable({ type: int, name: 'c' }),
                            }),
                            e2: SourceExpressionVariable({ type: int, name: 'd' }),
                          }),
                          e2: SourceExpressionVariable({ type: int, name: 'e' }),
                        }),
                      }),
                      associatedComments: [],
                    },
                  ],
                  expression: SourceExpressionFunctionCall({
                    type: int,
                    functionExpression: SourceExpressionVariable({
                      type: functionType([int, int], int),
                      name: 'f',
                    }),
                    functionArguments: [SourceExpressionInt(1), SourceExpressionInt(2)],
                  }),
                },
              }),
            }),
            associatedComments: [],
          },
        ],
        expression: SourceExpressionFunctionCall({
          type: int,
          functionExpression: SourceExpressionVariable({
            type: functionType([int, int, int], int),
            name: 'f',
          }),
          functionArguments: [
            SourceExpressionInt(3),
            SourceExpressionInt(4),
            SourceExpressionInt(5),
          ],
        }),
      },
    });
    assertTypeChecks(source, int, expectedExpression);
  });
});
