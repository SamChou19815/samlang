import HighIRTypeSynthesizer from '../hir-type-synthesizer';

import {
  HIR_ANY_TYPE,
  HIR_BOOL_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_INT_TYPE,
} from 'samlang-core-ast/hir-types';

it('HighIRTypeSynthesizer works', () => {
  const synthesizer = new HighIRTypeSynthesizer();

  expect(
    synthesizer.synthesize([HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesize([HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(
    synthesizer.synthesize([HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesize([HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(synthesizer.synthesized).toEqual([
    {
      identifier: '_SYNTHETIC_ID_TYPE_0',
      mappings: [HIR_BOOL_TYPE, HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_ANY_TYPE)],
    },
    {
      identifier: '_SYNTHETIC_ID_TYPE_1',
      mappings: [HIR_INT_TYPE, HIR_FUNCTION_TYPE([HIR_BOOL_TYPE], HIR_ANY_TYPE)],
    },
  ]);
});
