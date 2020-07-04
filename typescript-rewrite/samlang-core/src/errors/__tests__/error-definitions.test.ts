import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { intType, boolType } from '../../ast/common/types';
import {
  SyntaxError,
  UnexpectedTypeError,
  NotWellDefinedIdentifierError,
  UnresolvedNameError,
  UnsupportedClassTypeDefinitionError,
} from '../error-definitions';

it('error toString() test', () => {
  expect(
    new SyntaxError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'bad code').toString()
  ).toBe('Foo/Bar.sam:0:0-0:0: [SyntaxError]: bad code');
  expect(
    new UnexpectedTypeError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      intType,
      boolType
    ).toString()
  ).toBe('Foo/Bar.sam:0:0-0:0: [UnexpectedType]: Expected: `int`, actual: `bool`.');
  expect(
    new NotWellDefinedIdentifierError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'BadType'
    ).toString()
  ).toBe('Foo/Bar.sam:0:0-0:0: [NotWellDefinedIdentifier]: `BadType` is not well defined.');
  expect(
    new UnresolvedNameError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'unresolvedName'
    ).toString()
  ).toBe('Foo/Bar.sam:0:0-0:0: [UnresolvedName]: Name `unresolvedName` is not resolved.');
  expect(
    new UnsupportedClassTypeDefinitionError(
      new ModuleReference(['Foo', 'Bar']),
      Range.DUMMY,
      'object'
    ).toString()
  ).toBe(
    "Foo/Bar.sam:0:0-0:0: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't."
  );
});
