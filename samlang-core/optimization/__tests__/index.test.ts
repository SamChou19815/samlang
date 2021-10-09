import { optimizeHighIRSourcesAccordingToConfiguration } from '..';
import { HIR_INT_TYPE, HIR_FUNCTION_TYPE, HIR_ZERO } from '../../ast/hir-nodes';
import type { HighIRSources } from '../../ast/hir-nodes';

describe('samlang-core/optimization', () => {
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
