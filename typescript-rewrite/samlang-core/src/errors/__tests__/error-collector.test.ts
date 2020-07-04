import ModuleReference from '../../ast/common/module-reference';
import Range from '../../ast/common/range';
import { intType, boolType } from '../../ast/common/types';
import { ModuleErrorCollector, createGlobalErrorCollector } from '../error-collector';

const assertCanAddErrors = (adder: (collector: ModuleErrorCollector) => void): void => {
  const globalCollector = createGlobalErrorCollector();
  adder(globalCollector.getModuleErrorCollector(ModuleReference.ROOT));
  expect(globalCollector.getErrors().length).toBe(1);
};

it('can add errors', () => {
  assertCanAddErrors((collector) => collector.reportSyntaxError(Range.DUMMY, ''));
  assertCanAddErrors((collector) =>
    collector.reportUnexpectedTypeError(Range.DUMMY, intType, boolType)
  );
  assertCanAddErrors((collector) => collector.reportNotWellDefinedIdentifierError(Range.DUMMY, ''));
  assertCanAddErrors((collector) => collector.reportUnresolvedNameError(Range.DUMMY, ''));
  assertCanAddErrors((collector) =>
    collector.reportUnsupportedClassTypeDefinitionError(Range.DUMMY, 'object')
  );
});
