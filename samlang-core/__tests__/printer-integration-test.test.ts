import { ModuleReference } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-toplevel';
import { prettyPrintSamlangModule } from '../printer';
import { checkSources } from '../services/source-processor';
import { runnableSamlangProgramTestCases } from '../test-programs';
import { assertNotNull } from '../util/type-assertions';

const getTypeCheckedModule = (code: string): SamlangModule => {
  const moduleReference = new ModuleReference(['test']);
  const { checkedSources, compileTimeErrors } = checkSources([[moduleReference, code]]);
  const errors = compileTimeErrors.map((it) => it.toString());
  if (errors.length > 0) {
    fail(`Source: ${code}. Errors:\n${errors.join('\n')}`);
  }
  const checkedModule = checkedSources.get(moduleReference);
  assertNotNull(checkedModule);
  return checkedModule;
};

// @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
if (process.env.CI) {
  runnableSamlangProgramTestCases.forEach(({ testCaseName: id, sourceCode: code }) => {
    it(`samlang source level pretty printer is self-consistent for ${id}`, () => {
      const prettyCode = prettyPrintSamlangModule(100, getTypeCheckedModule(code));
      getTypeCheckedModule(prettyCode);
    });
  });
} else {
  it("dummy printer integration test when we don't run full tests", () => {});
}
