import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { intType, boolType } from '../../ast/common/types';
import { SyntaxError, UnexpectedTypeError } from '../error-definitions';

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
});
