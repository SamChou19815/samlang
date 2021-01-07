import MidIRResourceAllocator from '../mir-resource-allocator';

it('allocate temp test', () => {
  const allocator = new MidIRResourceAllocator();
  expect(allocator.allocateTemp('fun')).toBe('_temp_0_fun');
  expect(allocator.allocateTemp('octocat')).toBe('_temp_1_octocat');
});

it('allocate label test', () => {
  const allocator = new MidIRResourceAllocator();
  expect(allocator.allocateLabel('fooBar')).toBe('LABEL_fooBar_0');
  expect(allocator.allocateLabel('fooBar')).toBe('LABEL_fooBar_1');
  expect(allocator.allocateLabel('fooBar')).toBe('LABEL_fooBar_2');
  expect(allocator.allocateLabelWithAnnotation('fooBar', 'nothing')).toBe(
    'LABEL_fooBar_3_PURPOSE_nothing'
  );
  expect(allocator.allocateLabel('fooBar')).toBe('LABEL_fooBar_4');
  expect(allocator.allocateLabel('fooBar')).toBe('LABEL_fooBar_5');
});
