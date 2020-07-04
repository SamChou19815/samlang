import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { intType, boolType } from '../../ast/common/types';
import {
  CompileTimeError,
  SyntaxError,
  UnexpectedTypeError,
  NotWellDefinedIdentifierError,
  UnresolvedNameError,
  UnsupportedClassTypeDefinitionError,
  UnexpectedTypeKindError,
  TypeParameterSizeMismatchError,
  TupleSizeMismatchError,
  InsufficientTypeInferenceContextError,
  CollisionError,
  IllegalOtherClassMatch,
} from '../error-definitions';

const testCases: readonly (readonly [CompileTimeError, string])[] = [
  [
    new SyntaxError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'bad code'),
    'Foo/Bar.sam:0:0-0:0: [SyntaxError]: bad code',
  ],
  [
    new UnexpectedTypeError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, intType, boolType),
    'Foo/Bar.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.',
  ],
  [
    new NotWellDefinedIdentifierError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'BadType'),
    'Foo/Bar.sam:0:0-0:0: [NotWellDefinedIdentifier]: `BadType` is not well defined.',
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
    new UnexpectedTypeKindError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'array', intType),
    'Foo/Bar.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `array`, actual: `int`.',
  ],
  [
    new TypeParameterSizeMismatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 1, 2),
    'Foo/Bar.sam:0:0-0:0: [TypeParameterSizeMismatch]: Incorrect number of type arguments. Expected: 1, actual: 2.',
  ],
  [
    new TupleSizeMismatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 1, 2),
    'Foo/Bar.sam:0:0-0:0: [TupleSizeMismatch]: Incorrect tuple size. Expected: 1, actual: 2.',
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
];

testCases.forEach(([error, expectedErrorString], index) =>
  it(`error toString() test ${index + 1}`, () => expect(error.toString()).toBe(expectedErrorString))
);
