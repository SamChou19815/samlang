import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { SyntaxError } from '../error-definitions';

it('error toString() test', () => {
  expect(
    new SyntaxError(new ModuleReference(['Foo', 'Bar']), Range.DUMMY, 'bad code').toString()
  ).toBe('Foo/Bar.sam:0:0-0:0: [SyntaxError]: bad code');
});
