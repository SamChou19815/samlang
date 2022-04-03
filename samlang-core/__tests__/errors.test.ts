import { DummySourceReason, ModuleReference, Range } from '../ast/common-nodes';
import { SourceBoolType, SourceIntType } from '../ast/samlang-nodes';
import {
  CollisionError,
  CompileTimeError,
  IllegalOtherClassMatch,
  IllegalThisError,
  InsufficientTypeInferenceContextError,
  NonExhausiveMatchError,
  SyntaxError,
  TupleSizeMismatchError,
  TypeArgumentsSizeMismatchError,
  UnexpectedTypeError,
  UnexpectedTypeKindError,
  UnresolvedNameError,
  UnsupportedClassTypeDefinitionError,
} from '../errors';

const testCases: readonly (readonly [CompileTimeError, string])[] = [
  [
    new SyntaxError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'bad code'),
    'Foo/Bar.sam:0:0-0:0: [SyntaxError]: bad code',
  ],
  [
    new UnexpectedTypeError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      SourceIntType(DummySourceReason),
      SourceBoolType(DummySourceReason)
    ),
    'Foo/Bar.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ],
  [
    new UnresolvedNameError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'unresolvedName'),
    'Foo/Bar.sam:0:0-0:0: [UnresolvedName]: Name `unresolvedName` is not resolved.',
  ],
  [
    new UnsupportedClassTypeDefinitionError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'object'
    ),
    "Foo/Bar.sam:0:0-0:0: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
  ],
  [
    new UnexpectedTypeKindError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'array',
      'object'
    ),
    'Foo/Bar.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.',
  ],
  [
    new UnexpectedTypeKindError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'array',
      SourceIntType(DummySourceReason)
    ),
    'Foo/Bar.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `array`, actual: `int`.',
  ],
  [
    new TupleSizeMismatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 1, 2),
    'Foo/Bar.sam:0:0-0:0: [TupleSizeMismatch]: Incorrect tuple size. Expected: 1, actual: 2.',
  ],
  [
    new TypeArgumentsSizeMismatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 1, 2),
    'Foo/Bar.sam:0:0-0:0: [TypeArgumentsSizeMismatch]: Incorrect type arguments size. Expected: 1, actual: 2.',
  ],
  [
    new InsufficientTypeInferenceContextError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY),
    'Foo/Bar.sam:0:0-0:0: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
  ],
  [
    new CollisionError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'a'),
    'Foo/Bar.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.',
  ],
  [
    new IllegalOtherClassMatch(new ModuleReference(['Foo', 'Bar']), Range.DUMMY),
    "Foo/Bar.sam:0:0-0:0: [IllegalOtherClassMatch]: It is illegal to match on a value of other class's type.",
  ],
  [
    new IllegalThisError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY),
    'Foo/Bar.sam:0:0-0:0: [IllegalThis]: Keyword `this` cannot be used in this context.',
  ],
  [
    new NonExhausiveMatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, ['A', 'B']),
    'Foo/Bar.sam:0:0-0:0: [NonExhausiveMatch]: The following tags are not considered in the match: [A, B].',
  ],
];

describe('samlang-core/errors', () => {
  testCases.forEach(([error, expectedErrorString], index) =>
    it(`error toString() test ${index + 1}`, () =>
      expect(error.toString()).toBe(expectedErrorString))
  );
});
