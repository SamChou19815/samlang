import PanicException from '../panic-exception';

describe('panic-exception', () => {
  it('Throws Panic Exception', () => {
    try {
      throw new PanicException('panic!');
    } catch (e) {
      expect(e.message).toBe('panic!');
    }
  });
});
