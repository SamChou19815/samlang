import { Location, ModuleReference, ModuleReferenceCollections } from '../../ast/common-nodes';
import { AstBuilder, SamlangExpression, SamlangType } from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangExpressionFromText } from '../../parser';
import { checkNotNull } from '../../utils';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from '../builtins';
import { typeCheckExpression } from '../main-type-checker';
import { performSSAAnalysisOnSamlangExpression } from '../ssa-analysis';
import {
  InterfaceTypingContext,
  LocationBasedLocalTypingContext,
  ModuleTypingContext,
  TypeDefinitionTypingContext,
  TypingContext,
} from '../typing-context';

const int = AstBuilder.IntType;
const string = AstBuilder.StringType;
const unit = AstBuilder.UnitType;
const bool = AstBuilder.BoolType;

function typeCheckInSandbox(
  source: string,
  expectedType: SamlangType,
  currentClass?: string,
): readonly [SamlangExpression, readonly string[]] {
  const globalErrorCollector = createGlobalErrorCollector();
  const errorReporter = globalErrorCollector.getErrorReporter();

  // Parse
  const parsedExpression = checkNotNull(
    parseSamlangExpressionFromText(source, ModuleReference.DUMMY, errorReporter),
  );
  expect(globalErrorCollector.getErrors().map((it) => it.toString())).toEqual([]);

  const ssaAnalysisResult = performSSAAnalysisOnSamlangExpression(parsedExpression);
  const localTypingContext = new LocationBasedLocalTypingContext(ssaAnalysisResult);
  const context = new TypingContext(
    ModuleReferenceCollections.hashMapOf<ModuleTypingContext>(
      [ModuleReference.ROOT, DEFAULT_BUILTIN_TYPING_CONTEXT],
      [
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map<string, TypeDefinitionTypingContext>([
            [
              'Test',
              {
                type: 'object',
                names: ['foo', 'bar'],
                mappings: new Map([
                  ['foo', { isPublic: true, type: bool }],
                  ['bar', { isPublic: false, type: int }],
                ]),
              },
            ],
            [
              'Test2',
              {
                type: 'variant',
                names: ['Foo', 'Bar'],
                mappings: new Map([
                  ['Foo', { isPublic: true, type: bool }],
                  ['Bar', { isPublic: true, type: int }],
                ]),
              },
            ],
            [
              'Test3',
              {
                type: 'object',
                names: ['foo', 'bar'],
                mappings: new Map([
                  ['foo', { isPublic: true, type: AstBuilder.IdType('E') }],
                  ['bar', { isPublic: false, type: int }],
                ]),
              },
            ],
            [
              'Test4',
              {
                type: 'variant',
                names: ['Foo', 'Bar'],
                mappings: new Map([
                  ['Foo', { isPublic: true, type: AstBuilder.IdType('E') }],
                  ['Bar', { isPublic: true, type: int }],
                ]),
              },
            ],
            [
              'A',
              {
                type: 'object',
                names: ['a', 'b'],
                mappings: new Map([
                  ['a', { isPublic: true, type: int }],
                  ['b', { isPublic: false, type: bool }],
                ]),
              },
            ],
            [
              'B',
              {
                type: 'object',
                names: ['a', 'b'],
                mappings: new Map([
                  ['a', { isPublic: true, type: int }],
                  ['b', { isPublic: false, type: bool }],
                ]),
              },
            ],
            [
              'C',
              {
                type: 'variant',
                names: ['a', 'b'],
                mappings: new Map([
                  ['a', { isPublic: true, type: int }],
                  ['b', { isPublic: true, type: bool }],
                ]),
              },
            ],
          ]),
          interfaces: new Map<string, InterfaceTypingContext>([
            [
              'Test',
              {
                isConcrete: true,
                typeParameters: [],
                superTypes: [],
                functions: new Map([
                  [
                    'init',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([bool, int], AstBuilder.IdType('Test')),
                    },
                  ],
                  [
                    'helloWorld',
                    {
                      isPublic: false,
                      typeParameters: [],
                      type: AstBuilder.FunType([string], unit),
                    },
                  ],
                  [
                    'helloWorldWithTypeParameters',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'A', bound: null }],
                      type: AstBuilder.FunType([AstBuilder.IdType('A')], unit),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'baz',
                    {
                      isPublic: false,
                      typeParameters: [],
                      type: AstBuilder.FunType([int], bool),
                    },
                  ],
                  [
                    'bazWithTypeParam',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'A', bound: null }],
                      type: AstBuilder.FunType([int], bool),
                    },
                  ],
                  [
                    'bazWithUsefulTypeParam',
                    {
                      isPublic: false,
                      typeParameters: [{ name: 'A', bound: null }],
                      type: AstBuilder.FunType([AstBuilder.IdType('A')], bool),
                    },
                  ],
                ]),
              },
            ],
            [
              'Test2',
              {
                isConcrete: true,
                typeParameters: [],
                superTypes: [],
                functions: new Map([
                  [
                    'Foo',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([bool], AstBuilder.IdType('Test2')),
                    },
                  ],
                  [
                    'Bar',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([int], AstBuilder.IdType('Test2')),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
            [
              'Test3',
              {
                isConcrete: true,
                typeParameters: [{ name: 'E', bound: null }],
                superTypes: [],
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'Test4',
              {
                isConcrete: true,
                typeParameters: [{ name: 'E', bound: null }],
                superTypes: [],
                functions: new Map([
                  [
                    'Foo',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'E', bound: null }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('E')],
                        AstBuilder.IdType('Test4', [AstBuilder.IdType('E')]),
                      ),
                    },
                  ],
                  [
                    'Bar',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'E', bound: null }],
                      type: AstBuilder.FunType(
                        [int],
                        AstBuilder.IdType('Test4', [AstBuilder.IdType('E')]),
                      ),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
            [
              'A',
              {
                isConcrete: true,
                typeParameters: [],
                superTypes: [],
                functions: new Map([
                  [
                    'init',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IdType('A')),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
            [
              'B',
              {
                isConcrete: true,
                typeParameters: [],
                superTypes: [],
                functions: new Map([
                  [
                    'init',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IdType('B')),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
            [
              'C',
              {
                isConcrete: true,
                typeParameters: [],
                superTypes: [],
                functions: new Map([
                  [
                    'init',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IdType('C')),
                    },
                  ],
                ]),
                methods: new Map(),
              },
            ],
          ]),
        },
      ],
    ),
    localTypingContext,
    errorReporter,
    ModuleReference.DUMMY,
    currentClass ?? 'Test',
    /* availableTypeParameters */ [],
  );

  // Type Check
  const checkedExpression = typeCheckExpression(parsedExpression, context, expectedType);
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
  expectedType: SamlangType,
  expectedExpression?: SamlangExpression,
  currentClass?: string,
): void {
  const [actualExpression, errors] = typeCheckInSandbox(source, expectedType, currentClass);
  if (expectedExpression) {
    const standardize = (json: unknown): unknown =>
      JSON.parse(
        JSON.stringify(
          json,
          (_, value) => {
            if (value instanceof Location) return '';
            if (value instanceof ModuleReference) {
              return value.toString();
            }
            return value;
          },
          4,
        ),
      );
    expect(standardize(actualExpression)).toStrictEqual(standardize(expectedExpression));
  }
  expect(errors).toEqual([]);
}

function assertTypeErrors(
  source: string,
  expectedType: SamlangType,
  expectedErrors: readonly string[],
  currentClass?: string,
): void {
  expect(typeCheckInSandbox(source, expectedType, currentClass)[1]).toEqual(expectedErrors);
}

describe('main-type-checker', () => {
  it('Literal', () => {
    assertTypeChecks('true', bool);
    assertTypeChecks('false', bool);
    assertTypeChecks('42', int);
    assertTypeChecks('"a"', string);

    assertTypeErrors('true', unit, [
      '__DUMMY__.sam:1:1-1:5: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('false', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('42', unit, [
      '__DUMMY__.sam:1:1-1:3: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('"a"', unit, [
      '__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `unit`, actual: `string`.',
    ]);
  });

  it('This', () => {
    // Should already errored during SSA analysis
    assertTypeChecks('this', int);
  });

  it('Variable', () => {
    assertTypeChecks('{ val foo = 3; foo }', int);

    assertTypeErrors('{ val foo = true; foo }', int, [
      '__DUMMY__.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
  });

  it('ClassMember', () => {
    assertTypeChecks('Test.helloWorldWithTypeParameters<int>', AstBuilder.FunType([int], unit));
    assertTypeChecks('Test.helloWorld', AstBuilder.FunType([string], unit));

    assertTypeErrors('Test.helloWorld<A>', AstBuilder.FunType([string], unit), [
      '__DUMMY__.sam:1:1-1:19: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.',
    ]);
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters',
      AstBuilder.FunType([string, string], unit),
      [
        '__DUMMY__.sam:1:1-1:34: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.',
        '__DUMMY__.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
        '__DUMMY__.sam:1:1-1:34: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(unknown) -> unit`.',
      ],
    );
    assertTypeErrors('Test.helloWorldWithTypeParameters', string, [
      '__DUMMY__.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:1-1:34: [UnexpectedTypeKind]: Expected kind: `string`, actual: `function`.',
      '__DUMMY__.sam:1:1-1:34: [UnexpectedType]: Expected: `string`, actual: `(unknown) -> unit`.',
    ]);
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters<int, string>',
      AstBuilder.FunType([int], unit),
      [
        '__DUMMY__.sam:1:1-1:47: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.',
      ],
    );
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters<string>',
      AstBuilder.FunType([string, string], unit),
      [
        '__DUMMY__.sam:1:1-1:42: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.',
        '__DUMMY__.sam:1:1-1:42: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.',
      ],
    );
    assertTypeErrors('Test.helloWorld2', AstBuilder.FunType([string], unit), [
      '__DUMMY__.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved.',
    ]);
  });

  it('ObjectConstructor', () => {
    assertTypeChecks('Test.init(true, 3)', AstBuilder.IdType('Test'));
    assertTypeChecks('{ val foo=true; Test.init(foo, 3) }', AstBuilder.IdType('Test'));
  });

  it('VariantConstructor', () => {
    assertTypeChecks('Test2.Foo(true)', AstBuilder.IdType('Test2'), undefined, 'Test2');
    assertTypeChecks('Test2.Bar(42)', AstBuilder.IdType('Test2'), undefined, 'Test2');
    assertTypeChecks('Test4.Foo(true)}', AstBuilder.IdType('Test4', [bool]), undefined, 'Test4');
    assertTypeChecks(
      'Test4.Foo<bool>(true)}',
      AstBuilder.IdType('Test4', [bool]),
      undefined,
      'Test4',
    );

    assertTypeErrors('Test.Foo(true)', AstBuilder.IdType('Test2'), [
      '__DUMMY__.sam:1:1-1:9: [UnresolvedName]: Name `Test.Foo` is not resolved.',
    ]);
    assertTypeErrors('Test.Bar(42)', AstBuilder.IdType('Test2'), [
      '__DUMMY__.sam:1:1-1:9: [UnresolvedName]: Name `Test.Bar` is not resolved.',
    ]);
    assertTypeErrors(
      'Test4.Foo<int, bool>(true)}',
      AstBuilder.IdType('Test4', [bool]),
      [
        '__DUMMY__.sam:1:1-1:21: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.',
      ],
      undefined,
    );
    assertTypeErrors(
      'Test4.Foo<int>(true)}',
      AstBuilder.IdType('Test4', [int]),
      ['__DUMMY__.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.'],
      undefined,
    );
    assertTypeErrors(
      'Test4.Foo<int>(true)}',
      AstBuilder.IdType('Test4', [bool]),
      [
        '__DUMMY__.sam:1:1-1:21: [UnexpectedType]: Expected: `Test4<bool>`, actual: `Test4<int>`.',
        '__DUMMY__.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      ],
      undefined,
    );
    assertTypeErrors('Test44.Bar(42)', AstBuilder.IdType('Test2'), [
      '__DUMMY__.sam:1:1-1:11: [UnresolvedName]: Name `Test44.Bar` is not resolved.',
    ]);
    assertTypeErrors(
      'Test2.Tars(42)',
      AstBuilder.IdType('Test2'),
      ['__DUMMY__.sam:1:1-1:11: [UnresolvedName]: Name `Test2.Tars` is not resolved.'],
      'Test2',
    );
  });

  it('FieldAccess && MethodAccess', () => {
    assertTypeChecks('Test.init(true, 3).foo', bool);
    assertTypeChecks('Test.init(true, 3).bar', int);
    assertTypeChecks('Test.init(true, 3).baz', AstBuilder.FunType([int], bool));
    assertTypeChecks('Test.init(true, 3).bazWithTypeParam', AstBuilder.FunType([int], bool));
    assertTypeChecks('Test.init(true, 3).bazWithTypeParam<int>', AstBuilder.FunType([int], bool));
    assertTypeChecks(
      'Test.init(true, 3).bazWithUsefulTypeParam<int>',
      AstBuilder.FunType([int], bool),
    );

    assertTypeErrors('3.foo', int, [
      '__DUMMY__.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bazz', int, [
      '__DUMMY__.sam:1:20-1:24: [UnresolvedName]: Name `bazz` is not resolved.',
    ]);
    assertTypeErrors('{ val _ = (t3: Test3<bool>) -> t3.bar }', unit, [
      '__DUMMY__.sam:1:35-1:38: [UnresolvedName]: Name `bar` is not resolved.',
    ]);
    assertTypeErrors(
      'Test2.Foo(true).foo',
      int,
      ['__DUMMY__.sam:1:17-1:20: [UnresolvedName]: Name `foo` is not resolved.'],
      'Test2',
    );

    assertTypeErrors('Test.init(true, 3).foo<int>', bool, [
      '__DUMMY__.sam:1:1-1:28: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.',
    ]);
    assertTypeErrors('Test.init(true, 3).foo', int, [
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bar', bool, [
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('Test.init(true, 3).baz', int, [
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors('Test.init(true, 3).baz<int>', AstBuilder.FunType([int], bool), [
      '__DUMMY__.sam:1:1-1:28: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.',
    ]);
    assertTypeErrors('Test.init(true, 3).bazWithTypeParam', int, [
      '__DUMMY__.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:1-1:36: [UnexpectedTypeKind]: Expected kind: `int`, actual: `function`.',
      '__DUMMY__.sam:1:1-1:36: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bazWithTypeParam', AstBuilder.FunType([int, int], bool), [
      '__DUMMY__.sam:1:1-1:36: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.',
      '__DUMMY__.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:1-1:36: [UnexpectedType]: Expected: `(int, int) -> bool`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors(
      'Test.init(true, 3).bazWithTypeParam<int, int>',
      AstBuilder.FunType([int], bool),
      [
        '__DUMMY__.sam:1:1-1:46: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.',
      ],
    );
    assertTypeErrors(
      'Test.init(true, 3).bazWithUsefulTypeParam<bool>',
      AstBuilder.FunType([int], bool),
      [
        '__DUMMY__.sam:1:1-1:48: [UnexpectedType]: Expected: `(int) -> bool`, actual: `(bool) -> bool`.',
        '__DUMMY__.sam:1:1-1:48: [UnexpectedType]: Expected: `(int) -> bool`, actual: `(bool) -> bool`.',
      ],
    );
    assertTypeErrors('Test.init(true, 3).baz', AstBuilder.FunType([bool], int), [
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.',
      '__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.',
    ]);

    assertTypeErrors('{ val _ = (t) -> t.foo; }', unit, [
      '__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.bar; }', unit, [
      '__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.baz; }', unit, [
      '__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
    ]);
  });

  it('Unary', () => {
    assertTypeChecks('-(1)', int);
    assertTypeChecks('!true', bool);
    assertTypeChecks('!false', bool);

    assertTypeErrors('-(false)', int, [
      '__DUMMY__.sam:1:3-1:8: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('!1', bool, [
      '__DUMMY__.sam:1:2-1:3: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('-(1+1)', bool, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('!true', int, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('!false', int, [
      '__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
  });

  it('Panic', () => {
    assertTypeChecks('Builtins.panic("")', unit);
    assertTypeChecks('Builtins.panic("")', bool);
    assertTypeChecks('Builtins.panic("")', int);
    assertTypeChecks('Builtins.panic("")', string);
    assertTypeChecks('Builtins.panic("")', AstBuilder.FunType([int, bool], string));

    assertTypeErrors('Builtins.panic(3)', unit, [
      '__DUMMY__.sam:1:16-1:17: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
  });

  it('FunctionCall', () => {
    assertTypeChecks('Test.helloWorld("")', unit);
    assertTypeChecks('((i: int) -> true)(3)', bool);

    assertTypeErrors('3(3)', unit, [
      '__DUMMY__.sam:1:1-1:5: [UnexpectedTypeKind]: Expected kind: `function`, actual: `int`.',
    ]);

    assertTypeErrors('Test.helloWorld(3)', unit, [
      '__DUMMY__.sam:1:17-1:18: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('((i: int) -> true)({})', bool, [
      '__DUMMY__.sam:1:20-1:22: [UnexpectedType]: Expected: `int`, actual: `unit`.',
    ]);

    assertTypeErrors('Test.helloWorld("")', bool, [
      '__DUMMY__.sam:1:1-1:20: [UnexpectedType]: Expected: `bool`, actual: `unit`.',
    ]);
    assertTypeErrors('Test.init(true, 3).baz(3)', int, [
      '__DUMMY__.sam:1:1-1:26: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('((i: int) -> true)(3)', int, [
      '__DUMMY__.sam:1:1-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.',
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
    assertTypeChecks('{ val _ = (t: string, f: string) -> t == f; }', unit);

    assertTypeErrors('"1" * "1"', int, [
      '__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.',
      '__DUMMY__.sam:1:7-1:10: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('"1" - 1', int, [
      '__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('1 % "1"', int, [
      '__DUMMY__.sam:1:5-1:8: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('1 + false', int, [
      '__DUMMY__.sam:1:5-1:10: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('false - 1', int, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('"" < false', bool, [
      '__DUMMY__.sam:1:1-1:3: [UnexpectedType]: Expected: `int`, actual: `string`.',
      '__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('1 <= false', bool, [
      '__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('1 > ""', bool, [
      '__DUMMY__.sam:1:5-1:7: [UnexpectedType]: Expected: `int`, actual: `string`.',
    ]);
    assertTypeErrors('true >= 1', bool, [
      '__DUMMY__.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('false || 4', bool, [
      '__DUMMY__.sam:1:10-1:11: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('2 && 3', bool, [
      '__DUMMY__.sam:1:1-1:2: [UnexpectedType]: Expected: `bool`, actual: `int`.',
      '__DUMMY__.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('1 == false', bool, [
      '__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('true == 3', bool, [
      '__DUMMY__.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('true != 3', bool, [
      '__DUMMY__.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('"" != 3', bool, [
      '__DUMMY__.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('{ val _ = (t: int, f: bool) -> t == f; }', unit, [
      '__DUMMY__.sam:1:37-1:38: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);

    assertTypeErrors('1 * 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 - 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 % 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 + 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 - 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.',
    ]);
    assertTypeErrors('1 < 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 <= 1', unit, [
      '__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 > 1', unit, [
      '__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 >= 1', unit, [
      '__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true || false', unit, [
      '__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('false && true', unit, [
      '__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('1 == 1', unit, [
      '__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true == false', unit, [
      '__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('true != true', unit, [
      '__DUMMY__.sam:1:1-1:13: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
    assertTypeErrors('"" != "3"', unit, [
      '__DUMMY__.sam:1:1-1:10: [UnexpectedType]: Expected: `unit`, actual: `bool`.',
    ]);
  });

  it('IfElse', () => {
    assertTypeChecks('if true then false else true', bool);
    assertTypeChecks('if false then 1 else 0', int);
    assertTypeChecks('if false then "" else ""', string);
    assertTypeChecks('{ val _ = (b: bool, t: int, f: int) -> if b then t else f }', unit);

    assertTypeErrors('if true then false else 1', bool, [
      '__DUMMY__.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('if false then 1 else false', int, [
      '__DUMMY__.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('if false then "" else 3', string, [
      '__DUMMY__.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors(
      `{
  val _ = (b: bool, t: bool, f: int) -> (
    if b then t else f
  )
}`,
      unit,
      ['__DUMMY__.sam:3:22-3:23: [UnexpectedType]: Expected: `bool`, actual: `int`.'],
    );
  });

  it('Match', () => {
    assertTypeChecks(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }',
      unit,
      undefined,
      'Test2',
    );

    assertTypeChecks('{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }', unit);
    assertTypeErrors('match (3) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      '__DUMMY__.sam:1:8-1:9: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('match (Test.init(true, 3)) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      '__DUMMY__.sam:1:32-1:35: [UnresolvedName]: Name `Foo` is not resolved.',
      '__DUMMY__.sam:1:45-1:48: [UnresolvedName]: Name `Bar` is not resolved.',
    ]);
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Baz s -> 2 }; }',
      unit,
      [
        '__DUMMY__.sam:1:25-1:64: [NonExhausiveMatch]: The following tags are not considered in the match: [Bar].',
        '__DUMMY__.sam:1:52-1:55: [UnresolvedName]: Name `Baz` is not resolved.',
      ],
      'Test2',
    );
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar d -> 2 }; }',
      unit,
      [],
      'Test2',
    );
  });

  it('Lambda', () => {
    assertTypeChecks(
      '{val _ = (a: (int) -> bool, b: int, c: int) -> if a(b + 1) then b else c;}',
      unit,
    );
    assertTypeChecks('(a) -> a', AstBuilder.FunType([int], int));

    assertTypeErrors('(a) -> a', AstBuilder.FunType([], int), [
      '__DUMMY__.sam:1:1-1:9: [ArityMismatchError]: Incorrect function arguments size. Expected: 0, actual: 1.',
      '__DUMMY__.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
    assertTypeErrors('(a) -> a', int, [
      '__DUMMY__.sam:1:1-1:9: [UnexpectedTypeKind]: Expected kind: `int`, actual: `(unknown) -> unknown`.',
      '__DUMMY__.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
  });

  describe('StatementBlocks', () => {
    it('Object destructuring 1', () =>
      assertTypeChecks('{val {a, b as c} = A.init();}', unit, undefined, 'A'));
    it('Object destructuring 2', () =>
      assertTypeErrors('{val {a, b as c} = A.init();}', unit, [
        '__DUMMY__.sam:1:10-1:11: [UnresolvedName]: Name `b` is not resolved.',
      ]));
    it('Object destructuring 3', () =>
      assertTypeErrors('{val {a, b as c} = C.init();}', unit, [
        '__DUMMY__.sam:1:7-1:8: [UnresolvedName]: Name `a` is not resolved.',
      ]));
    it('Object destructuring 4', () =>
      assertTypeErrors('{val {a, b as c} = 1;}', unit, [
        '__DUMMY__.sam:1:20-1:21: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
      ]));
    it('Object destructuring 5', () =>
      assertTypeErrors('{val {a, d as c} = A.init();}', unit, [
        '__DUMMY__.sam:1:10-1:11: [UnresolvedName]: Name `d` is not resolved.',
      ]));

    it('Variable pattern 1', () => assertTypeChecks('{val a = 1;}', unit));
    it('Variable pattern 2', () => assertTypeChecks('{val a = 1; val b = true;}', unit));
    it('Variable pattern 3', () => assertTypeChecks('{val a = 1; a}', int));

    it('Wildcard pattern', () => assertTypeChecks('{1}', int));
    it('De-facto unit literal', () => assertTypeChecks('{}', unit));
    it('Nested de-facto unit literal', () => assertTypeChecks('{{{{}}}}', unit));
  });

  it('IfElse integration test', () => {
    assertTypeChecks('{ val _ = (b: bool, t: int, f: int) -> if b then t else f }', unit);
  });

  it('Lambda integration test', () => {
    const source = `{
    val f = (a: int, b: int, c: int) -> {
        val f = (d: int, e: int) -> a + b + c + d + e;
        f(1, 2)
    };
    f(3, 4, 5)
}
`;
    assertTypeChecks(source, int);
  });
});
