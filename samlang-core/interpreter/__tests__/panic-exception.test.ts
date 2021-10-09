import PanicException from '../panic-exception';

describe('panic-exception', () => {
  it('Throws Panic Exception', () => {
    try {
      throw new PanicException('panic!');
    } catch (e: unknown) {
      expect((e as { message: string }).message).toBe('panic!');
    }
  });
});
