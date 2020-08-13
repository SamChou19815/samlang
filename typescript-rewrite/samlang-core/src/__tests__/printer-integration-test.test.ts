import ModuleReference from '../ast/common/module-reference';
import { prettyPrintSamlangModule, SamlangModule } from '../ast/lang/samlang-toplevel';
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
    const prettyCode1 = prettyPrintSamlangModule(getTypeCheckedModule(code));
    const prettyCode2 = prettyPrintSamlangModule(getTypeCheckedModule(prettyCode1));
    expect(prettyCode1).toBe(prettyCode2);
  });
});
