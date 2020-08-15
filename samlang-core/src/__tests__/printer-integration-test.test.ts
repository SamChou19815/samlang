import ModuleReference from '../ast/common/module-reference';
import type { SamlangModule } from '../ast/lang/samlang-toplevel';
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

runnableSamlangProgramTestCases.forEach(({ testCaseName: id, sourceCode: code }) => {
  it(`samlang source level pretty printer is self-consistent for ${id}`, () => {
    const prettyCode = prettyPrintSamlangModule(100, getTypeCheckedModule(code));
    getTypeCheckedModule(prettyCode);
  });
});
