import { MIR_INT_TYPE, MIR_FUNCTION_TYPE, MIR_ZERO } from 'samlang-core-ast/mir-nodes';
import type { MidIRSources } from 'samlang-core-ast/mir-nodes';

import { optimizeMidIRSourcesAccordingToConfiguration } from '..';

describe('samlang-core-optimization', () => {
  it('optimizeMidIRSourcesAccordingToConfiguration coverage tests', () => {
    const sources: MidIRSources = {
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'main',
          parameters: [],
          type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
          body: [],
          returnValue: MIR_ZERO,
        },
      ],
      mainFunctionNames: ['main'],
    };

    expect(optimizeMidIRSourcesAccordingToConfiguration(sources)).toEqual(sources);
    expect(optimizeMidIRSourcesAccordingToConfiguration(sources, {})).toEqual(sources);
  });
});
