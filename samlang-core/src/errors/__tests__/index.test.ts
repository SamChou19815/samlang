import {
  CompileTimeError,
  SyntaxError,
  UnexpectedTypeError,
  NotWellDefinedIdentifierError,
  UnresolvedNameError,
  UnsupportedClassTypeDefinitionError,
  UnexpectedTypeKindError,
  TupleSizeMismatchError,
  InsufficientTypeInferenceContextError,
  CollisionError,
  IllegalOtherClassMatch,
  IllegalThisError,
  InconsistentFieldsInObjectError,
  DuplicateFieldDeclarationError,
  NonExhausiveMatchError,
} from '..';
import { intType, boolType } from '../../ast/common-nodes';
import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';

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
  [
    new IllegalThisError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY),
    'Foo/Bar.sam:0:0-0:0: [IllegalThis]: Keyword `this` cannot be used in this context.',
  ],
  [
    new InconsistentFieldsInObjectError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      ['a'],
      ['b']
    ),
    'Foo/Bar.sam:0:0-0:0: [InconsistentFieldsInObject]: Inconsistent fields. Expected: `a`, actual: `b`.',
  ],
  [
    new DuplicateFieldDeclarationError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'a'),
    'Foo/Bar.sam:0:0-0:0: [DuplicateFieldDeclaration]: Field name `a` is declared twice.',
  ],
  [
    new NonExhausiveMatchError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, ['A', 'B']),
    'Foo/Bar.sam:0:0-0:0: [NonExhausiveMatch]: The following tags are not considered in the match: [A, B].',
  ],
];

testCases.forEach(([error, expectedErrorString], index) =>
  it(`error toString() test ${index + 1}`, () => expect(error.toString()).toBe(expectedErrorString))
);
