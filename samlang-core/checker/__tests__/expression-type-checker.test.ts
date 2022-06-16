import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import {
  SamlangExpression,
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { parseSamlangExpressionFromText } from '../../parser';
import { checkNotNull } from '../../utils';
import typeCheckExpression from '../expression-type-checker';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from '../global-typing-context-builder';
import { performSSAAnalysisOnSamlangExpression } from '../ssa-analysis';
import {
  AccessibleGlobalTypingContext,
  LocationBasedLocalTypingContext,
  ModuleTypingContext,
} from '../typing-context';

const dummyModuleReference: ModuleReference = ModuleReference(['Test']);

const int = SourceIntType(DummySourceReason);
const string = SourceStringType(DummySourceReason);
const unit = SourceUnitType(DummySourceReason);
const bool = SourceBoolType(DummySourceReason);

function typeCheckInSandbox(
  source: string,
  expectedType: SamlangType,
  currentClass?: string
): readonly [SamlangExpression, readonly string[]] {
  const globalErrorCollector = createGlobalErrorCollector();
  const errorReporter = globalErrorCollector.getErrorReporter();
  const accessibleGlobalTypingContext: AccessibleGlobalTypingContext =
    new AccessibleGlobalTypingContext(
      dummyModuleReference,
      ModuleReferenceCollections.hashMapOf<ModuleTypingContext>(
        [ModuleReference.ROOT, DEFAULT_BUILTIN_TYPING_CONTEXT],
        [
          dummyModuleReference,
          {
            interfaces: {},
            classes: {
              Test: {
                typeParameters: [],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [SourceId('foo'), SourceId('bar')],
                  mappings: {
                    foo: { isPublic: true, type: bool },
                    bar: { isPublic: false, type: int },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  init: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [bool, int],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test')
                    ),
                  },
                  helloWorld: {
                    isPublic: false,
                    typeParameters: [],
                    type: SourceFunctionType(DummySourceReason, [string], unit),
                  },
                  helloWorldWithTypeParameters: {
                    isPublic: false,
                    typeParameters: ['A'],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [SourceIdentifierType(DummySourceReason, dummyModuleReference, 'A')],
                      unit
                    ),
                  },
                },
                methods: {
                  baz: {
                    isPublic: false,
                    typeParameters: [],
                    type: SourceFunctionType(DummySourceReason, [int], bool),
                  },
                  bazWithTypeParam: {
                    isPublic: false,
                    typeParameters: ['A'],
                    type: SourceFunctionType(DummySourceReason, [int], bool),
                  },
                },
              },
              Test2: {
                typeParameters: [],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'variant',
                  names: [SourceId('Foo'), SourceId('Bar')],
                  mappings: {
                    Foo: { isPublic: true, type: bool },
                    Bar: { isPublic: true, type: int },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  Foo: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [bool],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2')
                    ),
                  },
                  Bar: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [int],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2')
                    ),
                  },
                },
                methods: {},
              },
              Test3: {
                typeParameters: ['E'],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [SourceId('foo'), SourceId('bar')],
                  mappings: {
                    foo: {
                      isPublic: true,
                      type: SourceIdentifierType(DummySourceReason, dummyModuleReference, 'E'),
                    },
                    bar: { isPublic: false, type: int },
                  },
                },
                extendsOrImplements: null,
                functions: {},
                methods: {},
              },
              Test4: {
                typeParameters: ['E'],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'variant',
                  names: [SourceId('Foo'), SourceId('Bar')],
                  mappings: {
                    Foo: {
                      isPublic: true,
                      type: SourceIdentifierType(DummySourceReason, dummyModuleReference, 'E'),
                    },
                    Bar: { isPublic: true, type: int },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  Foo: {
                    isPublic: true,
                    typeParameters: ['E'],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [SourceIdentifierType(DummySourceReason, dummyModuleReference, 'E')],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [
                        SourceIdentifierType(DummySourceReason, dummyModuleReference, 'E'),
                      ])
                    ),
                  },
                  Bar: {
                    isPublic: true,
                    typeParameters: ['E'],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [int],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [
                        SourceIdentifierType(DummySourceReason, dummyModuleReference, 'E'),
                      ])
                    ),
                  },
                },
                methods: {},
              },
              A: {
                typeParameters: [],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [SourceId('a'), SourceId('b')],
                  mappings: {
                    a: { isPublic: true, type: int },
                    b: { isPublic: false, type: bool },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  init: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'A', [])
                    ),
                  },
                },
                methods: {},
              },
              B: {
                typeParameters: [],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'object',
                  names: [SourceId('a'), SourceId('b')],
                  mappings: {
                    a: { isPublic: true, type: int },
                    b: { isPublic: false, type: bool },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  init: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'B', [])
                    ),
                  },
                },
                methods: {},
              },
              C: {
                typeParameters: [],
                typeDefinition: {
                  location: Location.DUMMY,
                  type: 'variant',
                  names: [SourceId('a'), SourceId('b')],
                  mappings: {
                    a: { isPublic: true, type: int },
                    b: { isPublic: true, type: bool },
                  },
                },
                extendsOrImplements: null,
                functions: {
                  init: {
                    isPublic: true,
                    typeParameters: [],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [],
                      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'C', [])
                    ),
                  },
                },
                methods: {},
              },
            },
          },
        ]
      ),
      new Set(),
      currentClass ?? 'Test'
    );

  // Parse
  const parsedExpression = checkNotNull(
    parseSamlangExpressionFromText(source, dummyModuleReference, errorReporter)
  );
  expect(globalErrorCollector.getErrors().map((it) => it.toString())).toEqual([]);

  // Type Check
  const ssaAnalysisResult = performSSAAnalysisOnSamlangExpression(parsedExpression);
  const localTypingContext = new LocationBasedLocalTypingContext(ssaAnalysisResult, null);
  const checkedExpression = typeCheckExpression(
    parsedExpression,
    errorReporter,
    accessibleGlobalTypingContext,
    localTypingContext,
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
  expectedType: SamlangType,
  expectedExpression?: SamlangExpression,
  currentClass?: string
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
          4
        )
      );
    expect(standardize(actualExpression)).toStrictEqual(standardize(expectedExpression));
  }
  expect(errors).toEqual([]);
}

function assertTypeErrors(
  source: string,
  expectedType: SamlangType,
  expectedErrors: readonly string[],
  currentClass?: string
): void {
  expect(typeCheckInSandbox(source, expectedType, currentClass)[1]).toEqual(expectedErrors);
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
    assertTypeErrors('this', int, [
      'Test.sam:1:1-1:5: [IllegalThis]: Keyword `this` cannot be used in this context.',
    ]);
  });

  it('Variable', () => {
    assertTypeChecks('{ val foo = 3; foo }', int);

    assertTypeErrors('{ val foo = true; foo }', int, [
      'Test.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
  });

  it('ClassMember', () => {
    assertTypeChecks(
      'Test.helloWorldWithTypeParameters<int>',
      SourceFunctionType(DummySourceReason, [int], unit)
    );
    assertTypeChecks('Test.helloWorld', SourceFunctionType(DummySourceReason, [string], unit));

    assertTypeErrors('Test.helloWorld<A>', SourceFunctionType(DummySourceReason, [string], unit), [
      'Test.sam:1:1-1:19: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.',
    ]);
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters',
      SourceFunctionType(DummySourceReason, [string, string], unit),
      [
        'Test.sam:1:1-1:34: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.',
        'Test.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
        'Test.sam:1:1-1:34: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(unknown) -> unit`.',
      ]
    );
    assertTypeErrors('Test.helloWorldWithTypeParameters', string, [
      'Test.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      'Test.sam:1:1-1:34: [UnexpectedTypeKind]: Expected kind: `string`, actual: `function`.',
      'Test.sam:1:1-1:34: [UnexpectedType]: Expected: `string`, actual: `(unknown) -> unit`.',
    ]);
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters<int, string>',
      SourceFunctionType(DummySourceReason, [int], unit),
      [
        'Test.sam:1:1-1:47: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.',
      ]
    );
    assertTypeErrors(
      'Test.helloWorldWithTypeParameters<string>',
      SourceFunctionType(DummySourceReason, [string, string], unit),
      [
        'Test.sam:1:1-1:42: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.',
        'Test.sam:1:1-1:42: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.',
      ]
    );
    assertTypeErrors('Test.helloWorld2', SourceFunctionType(DummySourceReason, [string], unit), [
      'Test.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved.',
    ]);
  });

  it('ObjectConstructor', () => {
    assertTypeChecks(
      'Test.init(true, 3)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test')
    );
    assertTypeChecks(
      '{ val foo=true; Test.init(foo, 3) }',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test')
    );
  });

  it('VariantConstructor', () => {
    assertTypeChecks(
      'Test2.Foo(true)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      undefined,
      'Test2'
    );
    assertTypeChecks(
      'Test2.Bar(42)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      undefined,
      'Test2'
    );
    assertTypeChecks(
      'Test4.Foo(true)}',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [bool]),
      undefined,
      'Test4'
    );
    assertTypeChecks(
      'Test4.Foo<bool>(true)}',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [bool]),
      undefined,
      'Test4'
    );

    assertTypeErrors(
      'Test.Foo(true)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      ['Test.sam:1:1-1:9: [UnresolvedName]: Name `Test.Foo` is not resolved.']
    );
    assertTypeErrors(
      'Test.Bar(42)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      ['Test.sam:1:1-1:9: [UnresolvedName]: Name `Test.Bar` is not resolved.']
    );
    assertTypeErrors(
      'Test4.Foo<int, bool>(true)}',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [bool]),
      [
        'Test.sam:1:1-1:21: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.',
      ],
      undefined
    );
    assertTypeErrors(
      'Test4.Foo<int>(true)}',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [int]),
      ['Test.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.'],
      undefined
    );
    assertTypeErrors(
      'Test4.Foo<int>(true)}',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test4', [bool]),
      [
        'Test.sam:1:1-1:21: [UnexpectedType]: Expected: `Test4<bool>`, actual: `Test4<int>`.',
        'Test.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.',
      ],
      undefined
    );
    assertTypeErrors(
      'Test44.Bar(42)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      ['Test.sam:1:1-1:11: [UnresolvedName]: Name `Test44.Bar` is not resolved.']
    );
    assertTypeErrors(
      'Test2.Tars(42)',
      SourceIdentifierType(DummySourceReason, dummyModuleReference, 'Test2'),
      ['Test.sam:1:1-1:11: [UnresolvedName]: Name `Test2.Tars` is not resolved.'],
      'Test2'
    );
  });

  it('FieldAccess && MethodAccess', () => {
    assertTypeChecks('Test.init(true, 3).foo', bool);
    assertTypeChecks('Test.init(true, 3).bar', int);
    assertTypeChecks('Test.init(true, 3).baz', SourceFunctionType(DummySourceReason, [int], bool));
    assertTypeChecks(
      'Test.init(true, 3).bazWithTypeParam',
      SourceFunctionType(DummySourceReason, [int], bool)
    );

    assertTypeErrors('3.foo', int, [
      'Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bazz', int, [
      'Test.sam:1:20-1:24: [UnresolvedName]: Name `bazz` is not resolved.',
    ]);
    assertTypeErrors('{ val _ = (t3: Test3<bool>) -> t3.bar }', unit, [
      'Test.sam:1:35-1:38: [UnresolvedName]: Name `bar` is not resolved.',
    ]);
    assertTypeErrors(
      'Test2.Foo(true).foo',
      int,
      [
        "Test.sam:1:1-1:16: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      ],
      'Test2'
    );

    assertTypeErrors('Test.init(true, 3).foo', int, [
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bar', bool, [
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('Test.init(true, 3).baz', int, [
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors('Test.init(true, 3).bazWithTypeParam', int, [
      'Test.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      'Test.sam:1:1-1:36: [UnexpectedTypeKind]: Expected kind: `int`, actual: `function`.',
      'Test.sam:1:1-1:36: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.',
    ]);
    assertTypeErrors(
      'Test.init(true, 3).bazWithTypeParam',
      SourceFunctionType(DummySourceReason, [int, int], bool),
      [
        'Test.sam:1:1-1:36: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.',
        'Test.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
        'Test.sam:1:1-1:36: [UnexpectedType]: Expected: `(int, int) -> bool`, actual: `(int) -> bool`.',
      ]
    );
    assertTypeErrors('Test.init(true, 3).baz', SourceFunctionType(DummySourceReason, [bool], int), [
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.',
      'Test.sam:1:1-1:23: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.',
    ]);

    assertTypeErrors('{ val _ = (t) -> t.foo; }', unit, [
      'Test.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      'Test.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.bar; }', unit, [
      'Test.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      'Test.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
    ]);
    assertTypeErrors('{ val _ = (t) -> t.baz; }', unit, [
      'Test.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      'Test.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.',
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
    assertTypeChecks(
      'Builtins.panic("")',
      SourceFunctionType(DummySourceReason, [int, bool], string)
    );

    assertTypeErrors('Builtins.panic(3)', unit, [
      'Test.sam:1:16-1:17: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
  });

  it('FunctionCall', () => {
    assertTypeChecks('Test.helloWorld("")', unit);
    assertTypeChecks('((i: int) -> true)(3)', bool);

    assertTypeErrors('3(3)', unit, [
      'Test.sam:1:1-1:5: [UnexpectedTypeKind]: Expected kind: `function`, actual: `int`.',
    ]);

    assertTypeErrors('Test.helloWorld(3)', unit, [
      'Test.sam:1:17-1:18: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors('((i: int) -> true)({})', bool, [
      'Test.sam:1:20-1:22: [UnexpectedType]: Expected: `int`, actual: `unit`.',
    ]);

    assertTypeErrors('Test.helloWorld("")', bool, [
      'Test.sam:1:1-1:20: [UnexpectedType]: Expected: `bool`, actual: `unit`.',
    ]);
    assertTypeErrors('Test.init(true, 3).baz(3)', int, [
      'Test.sam:1:1-1:26: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('((i: int) -> true)(3)', int, [
      'Test.sam:1:1-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.',
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
    assertTypeChecks('{ val _ = (b: bool, t: int, f: int) -> if b then t else f }', unit);

    assertTypeErrors('if true then false else 1', bool, [
      'Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    ]);
    assertTypeErrors('if false then 1 else false', int, [
      'Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    ]);
    assertTypeErrors('if false then "" else 3', string, [
      'Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.',
    ]);
    assertTypeErrors(
      `{
  val _ = (b: bool, t: bool, f: int) -> (
    if b then t else f
  )
}`,
      unit,
      ['Test.sam:3:22-3:23: [UnexpectedType]: Expected: `bool`, actual: `int`.']
    );
  });

  it('Match', () => {
    assertTypeChecks(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }',
      unit,
      undefined,
      'Test2'
    );

    assertTypeErrors('{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }', unit, [
      "Test.sam:1:32-1:33: [IllegalOtherClassMatch]: It is illegal to match on a value of other class's type.",
    ]);
    assertTypeErrors('match (3) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      'Test.sam:1:8-1:9: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
    ]);
    assertTypeErrors('match (Test.init(true, 3)) { | Foo _ -> 1 | Bar s -> 2 }', unit, [
      "Test.sam:1:8-1:26: [UnsupportedClassTypeDefinition]: Expect the current class to have `variant` type definition, but it doesn't.",
    ]);
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Baz s -> 2 }; }',
      unit,
      [
        'Test.sam:1:25-1:64: [NonExhausiveMatch]: The following tags are not considered in the match: [Bar].',
        'Test.sam:1:52-1:55: [UnresolvedName]: Name `Baz` is not resolved.',
      ],
      'Test2'
    );
    assertTypeErrors(
      '{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar d -> 2 }; }',
      unit,
      [],
      'Test2'
    );
  });

  it('Lambda', () => {
    assertTypeChecks(
      '{val _ = (a: (int) -> bool, b: int, c: int) -> if a(b + 1) then b else c;}',
      unit
    );
    assertTypeChecks('(a) -> a', SourceFunctionType(DummySourceReason, [int], int));

    assertTypeErrors('(a) -> a', SourceFunctionType(DummySourceReason, [], int), [
      'Test.sam:1:1-1:9: [ArityMismatchError]: Incorrect function arguments size. Expected: 0, actual: 1.',
      'Test.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
    assertTypeErrors('(a) -> a', int, [
      'Test.sam:1:1-1:9: [UnexpectedTypeKind]: Expected kind: `int`, actual: `(unknown) -> unknown`.',
      'Test.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
    ]);
  });

  describe('StatementBlocks', () => {
    it('Object destructuring 1', () =>
      assertTypeChecks('{val {a, b as c} = A.init();}', unit, undefined, 'A'));
    it('Object destructuring 2', () =>
      assertTypeErrors('{val {a, b as c} = A.init();}', unit, [
        'Test.sam:1:10-1:11: [UnresolvedName]: Name `b` is not resolved.',
      ]));
    it('Object destructuring 3', () =>
      assertTypeErrors('{val {a, b as c} = C.init();}', unit, [
        "Test.sam:1:20-1:28: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      ]));
    it('Object destructuring 4', () =>
      assertTypeErrors('{val {a, b as c} = 1;}', unit, [
        'Test.sam:1:20-1:21: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.',
      ]));
    it('Object destructuring 5', () =>
      assertTypeErrors('{val {a, d as c} = A.init();}', unit, [
        'Test.sam:1:10-1:11: [UnresolvedName]: Name `d` is not resolved.',
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
