import { HIR_INT_TYPE, HIR_FUNCTION_TYPE, HIR_ZERO } from 'samlang-core-ast/hir-nodes';
import type { HighIRSources } from 'samlang-core-ast/hir-nodes';

import { optimizeHighIRSourcesAccordingToConfiguration } from '..';

describe('samlang-core-optimization', () => {
  it('optimizeHighIRSourcesAccordingToConfiguration coverage tests', () => {
    const sources: HighIRSources = {
      globalVariables: [],
      typeDefinitions: [],
      closureTypes: [],
      functions: [
        {
          name: 'main',
          parameters: [],
          typeParameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [],
          returnValue: HIR_ZERO,
        },
      ],
      mainFunctionNames: ['main'],
    };

    expect(optimizeHighIRSourcesAccordingToConfiguration(sources)).toEqual(sources);
    expect(optimizeHighIRSourcesAccordingToConfiguration(sources, {})).toEqual(sources);
  });
});
