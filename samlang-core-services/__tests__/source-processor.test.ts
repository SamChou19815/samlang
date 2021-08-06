import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';

import { parseSources, checkSources } from '../source-processor';

describe('source-processor', () => {
  it('parseSources test', () => {
    expect(
      parseSources(
        [
          [new ModuleReference(['Test1']), 'class Main { function main(): unit = {} }'],
          // with syntax error
          [new ModuleReference(['Test2']), 'class Main { function main(): unt = {} }'],
        ],
        new Set()
      ).length
    ).toBe(1);
  });

  it('hello world processor test', () => {
    const moduleReference = new ModuleReference(['Test']);
    const sourceCode = `
  class Main {
    function main(): unit = Builtins.println("Hello "::"World!")
  }
  `;

    const { compileTimeErrors } = checkSources(
      [[moduleReference, sourceCode]],
      DEFAULT_BUILTIN_TYPING_CONTEXT
    );
    expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);
  });
});
