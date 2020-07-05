import { PLUS } from '../../ast/common/binary-operators';
import ModuleReference from '../../ast/common/module-reference';
import Position from '../../ast/common/position';
import Range from '../../ast/common/range';
import {
  Type,
  unitType as unit,
  boolType as bool,
  intType as int,
  stringType as string,
  identifierType,
  tupleType,
  functionType,
} from '../../ast/common/types';
import {
  SamlangExpression,
  EXPRESSION_INT,
  EXPRESSION_VARIABLE,
  EXPRESSION_FUNCTION_CALL,
  EXPRESSION_BINARY,
  EXPRESSION_IF_ELSE,
  EXPRESSION_STATEMENT_BLOCK,
  EXPRESSION_LAMBDA,
} from '../../ast/lang/samlang-expressions';
import { createGlobalErrorCollector } from '../../errors/error-collector';
import { parseSamlangExpressionFromText } from '../../parser';
import { assertNotNull } from '../../util/type-assertions';
import typeCheckExpression from '../expression-type-checker';
import TypeResolution from '../type-resolution';
import { AccessibleGlobalTypingContext, LocalTypingContext } from '../typing-context';

const dummyModuleReference: ModuleReference = new ModuleReference(['Test']);

const position = (p: string): Position => {
  const [line, column] = p.split(':').map((part) => parseInt(part, 10) - 1);
  return new Position(line, column);
};

const range = (r: string): Range => {
  const [start, end] = r.split('-').map(position);
  return new Range(start, end);
};

const typeCheckInSandbox = (
  source: string,
  expectedType: Type,
  additionalBindings: readonly (readonly [string, Type])[] = [],
  currentClass?: string
): readonly [SamlangExpression, readonly string[]] => {
  const globalErrorCollector = createGlobalErrorCollector();
  const moduleErrorCollector = globalErrorCollector.getModuleErrorCollector(dummyModuleReference);
  const accessibleGlobalTypingContext: AccessibleGlobalTypingContext = new AccessibleGlobalTypingContext(
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
            foo: { isPublic: true, type: identifierType('E') },
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
            Foo: { isPublic: true, type: identifierType('E') },
            Bar: { isPublic: true, type: int },
          },
        },
        functions: {},
        methods: {},
      },
    },
    new Set(),
    currentClass ?? 'Test'
  );

  // Parse
  const parsedExpression = parseSamlangExpressionFromText(source, moduleErrorCollector);
  assertNotNull(parsedExpression);
  expect(globalErrorCollector.getErrors()).toEqual([]);

  // Type Check
  const checkedExpression = typeCheckExpression(
    parsedExpression,
    moduleErrorCollector,
    accessibleGlobalTypingContext,
    (() => {
      const context = new LocalTypingContext();
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
};

const assertTypeChecks = (
  source: string,
  expectedType: Type,
  expectedExpression?: SamlangExpression,
  additionalBindings?: readonly (readonly [string, Type])[],
  currentClass?: string
): void => {
  const [actualExpression, errors] = typeCheckInSandbox(
    source,
    expectedType,
    additionalBindings,
    currentClass
  );
  if (expectedExpression) {
    const serialize = (json: unknown): string =>
      JSON.stringify(json, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 4);
    expect(serialize(actualExpression)).toStrictEqual(serialize(expectedExpression));
  }
  expect(errors).toEqual([]);
};

const assertTypeErrors = (
  source: string,
  expectedType: Type,
  expectedErrors: readonly string[],
  additionalBindings?: readonly (readonly [string, Type])[],
  currentClass?: string
): void =>
  expect(typeCheckInSandbox(source, expectedType, additionalBindings, currentClass)[1]).toEqual(
    expectedErrors
  );

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
  assertTypeChecks('this', identifierType('Test'), undefined, [['this', identifierType('Test')]]);

  assertTypeErrors('this', int, [
    'Test.sam:1:1-1:5: [IllegalThis]: Keyword `this` cannot be used in this context.',
  ]);
});

it('Variable', () => {
  assertTypeChecks('foo', int, undefined, [['foo', int]]);
  assertTypeChecks('{ val foo = 3; foo }', int);

  assertTypeErrors('foo', int, ['Test.sam:1:1-1:4: [UnresolvedName]: Name `foo` is not resolved.']);
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
  assertTypeChecks('{foo:true,bar:3}', identifierType('Test'));
  assertTypeChecks('{ val foo=true; {foo,bar:3} }', identifierType('Test'));
  assertTypeChecks(
    '{ val foo=true; {foo,bar:3} }',
    identifierType('Test3', [bool]),
    undefined,
    undefined,
    'Test3'
  );

  assertTypeErrors('{foo:true,bar:3,foo:true}', identifierType('Test'), [
    'Test.sam:1:17-1:20: [DuplicateFieldDeclaration]: Field name `foo` is declared twice.',
  ]);
  assertTypeErrors('{foo:true,bar:3,baz:true}', identifierType('Test'), [
    'Test.sam:1:1-1:26: [InconsistentFieldsInObject]: Inconsistent fields. Expected: `bar, foo`, actual: `bar, baz, foo`.',
  ]);
  assertTypeErrors('{foo:true,bar:false}', identifierType('Test'), [
    'Test.sam:1:11-1:14: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ]);
  assertTypeErrors('{ val foo=3; {foo,bar:3} }', identifierType('Test'), [
    'Test.sam:1:15-1:18: [UnexpectedType]: Expected: `bool`, actual: `int`.',
  ]);
  assertTypeErrors('{foo:true,bar:3}', int, [
    'Test.sam:1:1-1:17: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    'Test.sam:1:1-1:17: [UnexpectedType]: Expected: `int`, actual: `Test`.',
  ]);
  assertTypeErrors(
    '{ val foo=true; {foo,bar:3} }',
    identifierType('Test2', [bool]),
    [
      "Test.sam:1:17-1:28: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    ],
    undefined,
    'Test2'
  );
});

it('VariantConstructor', () => {
  assertTypeChecks('Foo(true)', identifierType('Test2'), undefined, undefined, 'Test2');
  assertTypeChecks('Bar(42)', identifierType('Test2'), undefined, undefined, 'Test2');
  assertTypeChecks('Foo(true)}', identifierType('Test4', [bool]), undefined, undefined, 'Test4');

  assertTypeErrors('Foo(true)', identifierType('Test2'), [
    "Test.sam:1:1-1:10: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
  ]);
  assertTypeErrors('Bar(42)', identifierType('Test2'), [
    "Test.sam:1:1-1:8: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
  ]);
  assertTypeErrors(
    'Tars(42)',
    identifierType('Test2'),
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
    'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.',
  ]);
  assertTypeErrors('!true', int, [
    'Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ]);
  assertTypeErrors('!false', int, [
    'Test.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ]);
});

it('Panic', () => {
  assertTypeChecks('panic("")', unit);
  assertTypeChecks('panic("")', bool);
  assertTypeChecks('panic("")', int);
  assertTypeChecks('panic("")', string);
  assertTypeChecks('panic("")', tupleType([int, bool]));

  assertTypeErrors('panic(3)', unit, [
    'Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.',
  ]);
});

it('BuiltinFunctionCall', () => {
  assertTypeChecks('intToString(3)', string);
  assertTypeChecks('stringToInt("3")', int);
  assertTypeChecks('println("3")', unit);

  assertTypeErrors('intToString(3)', int, [
    'Test.sam:1:1-1:15: [UnexpectedType]: Expected: `int`, actual: `string`.',
  ]);
  assertTypeErrors('stringToInt("3")', unit, [
    'Test.sam:1:1-1:17: [UnexpectedType]: Expected: `unit`, actual: `int`.',
  ]);
  assertTypeErrors('println("3")', int, [
    'Test.sam:1:1-1:13: [UnexpectedType]: Expected: `int`, actual: `unit`.',
  ]);

  assertTypeErrors('intToString("3")', string, [
    'Test.sam:1:13-1:16: [UnexpectedType]: Expected: `int`, actual: `string`.',
  ]);
  assertTypeErrors('stringToInt(3)', int, [
    'Test.sam:1:13-1:14: [UnexpectedType]: Expected: `string`, actual: `int`.',
  ]);
  assertTypeErrors('println(3)', unit, [
    'Test.sam:1:9-1:10: [UnexpectedType]: Expected: `string`, actual: `int`.',
  ]);
});

it('FunctionCall', () => {
  assertTypeChecks('Test.helloWorld("")', unit);
  assertTypeChecks('{foo:true,bar:3}.baz(3)', bool);
  assertTypeChecks('((i) -> true)(3)', bool);

  assertTypeErrors('3(3)', unit, [
    'Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `function`, actual: `int`.',
    'Test.sam:1:1-1:2: [UnexpectedType]: Expected: `(int) -> unit`, actual: `int`.',
  ]);

  assertTypeErrors('Test.helloWorld(3)', unit, [
    'Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(int) -> unit`, actual: `(string) -> unit`.',
  ]);
  assertTypeErrors('{foo:true,bar:3}.baz({})', bool, [
    'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`.',
  ]);
  assertTypeErrors('((i: int) -> true)({})', bool, [
    'Test.sam:1:2-1:18: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`.',
  ]);

  assertTypeErrors('Test.helloWorld("")', bool, [
    'Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(string) -> bool`, actual: `(string) -> unit`.',
  ]);
  assertTypeErrors('{foo:true,bar:3}.baz(3)', int, [
    'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(int) -> int`, actual: `(int) -> bool`.',
  ]);
  assertTypeErrors('((i) -> true)(3)', int, [
    'Test.sam:1:2-1:13: [UnexpectedType]: Expected: `(int) -> int`, actual: `(__UNDECIDED__) -> bool`.',
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
    ['Test.sam:1:50-1:62: [UnresolvedName]: Name `Baz` is not resolved.'],
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
    EXPRESSION_STATEMENT_BLOCK({
      range: range('1:1-1:49'),
      type: unit,
      block: {
        range: range('1:1-1:49'),
        statements: [
          {
            range: range('1:3-1:47'),
            pattern: { type: 'WildCardPattern', range: range('1:7-1:8') },
            typeAnnotation: functionType([bool, int, int], int),
            assignedExpression: EXPRESSION_LAMBDA({
              range: range('1:11-1:47'),
              type: functionType([bool, int, int], int),
              parameters: [
                ['b', bool],
                ['t', int],
                ['f', int],
              ],
              captured: {},
              body: EXPRESSION_IF_ELSE({
                range: range('1:29-1:47'),
                type: int,
                boolExpression: EXPRESSION_VARIABLE({
                  range: range('1:32-1:33'),
                  type: bool,
                  name: 'b',
                }),
                e1: EXPRESSION_VARIABLE({
                  range: range('1:39-1:40'),
                  type: int,
                  name: 't',
                }),
                e2: EXPRESSION_VARIABLE({ range: range('1:46-1:47'), type: int, name: 'f' }),
              }),
            }),
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
  const expectedExpression = EXPRESSION_STATEMENT_BLOCK({
    range: range('1:1-7:2'),
    type: int,
    block: {
      range: range('1:1-7:2'),
      statements: [
        {
          range: range('2:5-5:7'),
          pattern: { type: 'VariablePattern', range: range('2:9-2:10'), name: 'f' },
          typeAnnotation: functionType([int, int, int], int),
          assignedExpression: EXPRESSION_LAMBDA({
            range: range('2:13-5:6'),
            type: functionType([int, int, int], int),
            parameters: [
              ['a', int],
              ['b', int],
              ['c', int],
            ],
            captured: {},
            body: EXPRESSION_STATEMENT_BLOCK({
              range: range('2:26-5:6'),
              type: int,
              block: {
                range: range('2:26-5:6'),
                statements: [
                  {
                    range: range('3:9-3:45'),
                    pattern: { type: 'VariablePattern', range: range('3:13-3:14'), name: 'f' },
                    typeAnnotation: functionType([int, int], int),
                    assignedExpression: EXPRESSION_LAMBDA({
                      range: range('3:17-3:44'),
                      type: functionType([int, int], int),
                      parameters: [
                        ['d', int],
                        ['e', int],
                      ],
                      captured: { a: int, b: int, c: int },
                      body: EXPRESSION_BINARY({
                        range: range('3:27-3:44'),
                        type: int,
                        operator: PLUS,
                        e1: EXPRESSION_BINARY({
                          range: range('3:27-3:40'),
                          type: int,
                          operator: PLUS,
                          e1: EXPRESSION_BINARY({
                            range: range('3:27-3:36'),
                            type: int,
                            operator: PLUS,
                            e1: EXPRESSION_BINARY({
                              range: range('3:27-3:32'),
                              type: int,
                              operator: PLUS,
                              e1: EXPRESSION_VARIABLE({
                                range: range('3:27-3:28'),
                                type: int,
                                name: 'a',
                              }),
                              e2: EXPRESSION_VARIABLE({
                                range: range('3:31-3:32'),
                                type: int,
                                name: 'b',
                              }),
                            }),
                            e2: EXPRESSION_VARIABLE({
                              range: range('3:35-3:36'),
                              type: int,
                              name: 'c',
                            }),
                          }),
                          e2: EXPRESSION_VARIABLE({
                            range: range('3:39-3:40'),
                            type: int,
                            name: 'd',
                          }),
                        }),
                        e2: EXPRESSION_VARIABLE({
                          range: range('3:43-3:44'),
                          type: int,
                          name: 'e',
                        }),
                      }),
                    }),
                  },
                ],
                expression: EXPRESSION_FUNCTION_CALL({
                  range: range('4:9-4:16'),
                  type: int,
                  functionExpression: EXPRESSION_VARIABLE({
                    range: range('4:9-4:10'),
                    type: functionType([int, int], int),
                    name: 'f',
                  }),
                  functionArguments: [
                    EXPRESSION_INT(range('4:11-4:12'), 1n),
                    EXPRESSION_INT(range('4:14-4:15'), 2n),
                  ],
                }),
              },
            }),
          }),
        },
      ],
      expression: EXPRESSION_FUNCTION_CALL({
        range: range('6:5-6:15'),
        type: int,
        functionExpression: EXPRESSION_VARIABLE({
          range: range('6:5-6:6'),
          type: functionType([int, int, int], int),
          name: 'f',
        }),
        functionArguments: [
          EXPRESSION_INT(range('6:7-6:8'), 3n),
          EXPRESSION_INT(range('6:10-6:11'), 4n),
          EXPRESSION_INT(range('6:13-6:14'), 5n),
        ],
      }),
    },
  });
  assertTypeChecks(source, int, expectedExpression);
});
