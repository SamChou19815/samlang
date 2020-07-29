import { isTheSameType } from '../../ast/common/types';
import PanicException from '../panic-exception';

it('Throws Panic Exception', () => {
  try {
    throw new PanicException('panic!');
  } catch (e) {
    expect(e.message).toBe('panic!');
  }
});
