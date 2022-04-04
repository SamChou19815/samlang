import { DummySourceReason, Location } from '../ast/common-nodes';
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
  [new SyntaxError(Location.DUMMY, 'bad code'), '__DUMMY__.sam:0:0-0:0: [SyntaxError]: bad code'],
  [
    new UnexpectedTypeError(
      Location.DUMMY,
      SourceIntType(DummySourceReason),
      SourceBoolType(DummySourceReason)
    ),
    '__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ],
  [
    new UnresolvedNameError(Location.DUMMY, 'unresolvedName'),
    '__DUMMY__.sam:0:0-0:0: [UnresolvedName]: Name `unresolvedName` is not resolved.',
  ],
  [
    new UnsupportedClassTypeDefinitionError(Location.DUMMY, 'object'),
    "__DUMMY__.sam:0:0-0:0: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
  ],
  [
    new UnexpectedTypeKindError(Location.DUMMY, 'array', 'object'),
    '__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.',
  ],
  [
    new UnexpectedTypeKindError(Location.DUMMY, 'array', SourceIntType(DummySourceReason)),
    '__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `array`, actual: `int`.',
  ],
  [
    new TupleSizeMismatchError(Location.DUMMY, 1, 2),
    '__DUMMY__.sam:0:0-0:0: [TupleSizeMismatch]: Incorrect tuple size. Expected: 1, actual: 2.',
  ],
  [
    new TypeArgumentsSizeMismatchError(Location.DUMMY, 1, 2),
    '__DUMMY__.sam:0:0-0:0: [TypeArgumentsSizeMismatch]: Incorrect type arguments size. Expected: 1, actual: 2.',
  ],
  [
    new InsufficientTypeInferenceContextError(Location.DUMMY),
    '__DUMMY__.sam:0:0-0:0: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
  ],
  [
    new CollisionError(Location.DUMMY, 'a'),
    '__DUMMY__.sam:0:0-0:0: [Collision]: Name `a` collides with a previously defined name.',
  ],
  [
    new IllegalOtherClassMatch(Location.DUMMY),
    "__DUMMY__.sam:0:0-0:0: [IllegalOtherClassMatch]: It is illegal to match on a value of other class's type.",
  ],
  [
    new IllegalThisError(Location.DUMMY),
    '__DUMMY__.sam:0:0-0:0: [IllegalThis]: Keyword `this` cannot be used in this context.',
  ],
  [
    new NonExhausiveMatchError(Location.DUMMY, ['A', 'B']),
    '__DUMMY__.sam:0:0-0:0: [NonExhausiveMatch]: The following tags are not considered in the match: [A, B].',
  ],
];

describe('samlang-core/errors', () => {
  testCases.forEach(([error, expectedErrorString], index) =>
    it(`error toString() test ${index + 1}`, () =>
      expect(error.toString()).toBe(expectedErrorString))
  );
});
