import MidIRTypeSynthesizer from '../mir-type-synthesizer';

import {
  MIR_ANY_TYPE,
  MIR_BOOL_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

it('MidIRTypeSynthesizer works', () => {
  const synthesizer = new MidIRTypeSynthesizer();

  expect(
    synthesizer.synthesize([MIR_BOOL_TYPE, MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesize([MIR_INT_TYPE, MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(
    synthesizer.synthesize([MIR_BOOL_TYPE, MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_0');
  expect(
    synthesizer.synthesize([MIR_INT_TYPE, MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_ANY_TYPE)])
      .identifier
  ).toBe('_SYNTHETIC_ID_TYPE_1');

  expect(synthesizer.synthesized).toEqual([
    {
      identifier: '_SYNTHETIC_ID_TYPE_0',
      mappings: [MIR_BOOL_TYPE, MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_ANY_TYPE)],
    },
    {
      identifier: '_SYNTHETIC_ID_TYPE_1',
      mappings: [MIR_INT_TYPE, MIR_FUNCTION_TYPE([MIR_BOOL_TYPE], MIR_ANY_TYPE)],
    },
  ]);
});
