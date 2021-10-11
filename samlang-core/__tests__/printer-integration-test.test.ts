import { ModuleReference } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-nodes';
import { typeCheckSourceHandles } from '../checker';
import prettyPrintSamlangModule from '../printer';
import { runnableSamlangProgramTestCases } from '../test-programs';

function getTypeCheckedModule(code: string): SamlangModule {
  const moduleReference = new ModuleReference(['test']);
  const { checkedSources, compileTimeErrors } = typeCheckSourceHandles([[moduleReference, code]]);
  const errors = compileTimeErrors.map((it) => it.toString());
  if (errors.length > 0) throw new Error(`Source: ${code}. Errors:\n${errors.join('\n')}`);
  return checkedSources.forceGet(moduleReference);
}

describe('printer-integration-test', () => {
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
});
