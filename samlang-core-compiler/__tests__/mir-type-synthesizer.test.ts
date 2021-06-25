import {
  MIR_ANY_TYPE,
  MIR_BOOL_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_INT_TYPE,
} from 'samlang-core-ast/mir-nodes';

import MidIRTypeSynthesizer from '../mir-type-synthesizer';

describe('mir-type-synthesizer', () => {
  const synthesizer = new MidIRTypeSynthesizer();
  it('MidIRTypeSynthesizer works', () => {
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
});
