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
];

testCases.forEach(([error, expectedErrorString], index) =>
  it(`error toString() test ${index + 1}`, () => expect(error.toString()).toBe(expectedErrorString))
);
