import { Location } from '../ast/common-nodes';
import { AstBuilder } from '../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../errors';

describe('samlang-core/errors', () => {
  it('error toString() test', () => {
    const collector = createGlobalErrorCollector();

    const reporter = collector.getErrorReporter();
    reporter.reportSyntaxError(Location.DUMMY, 'bad code');
    reporter.reportUnexpectedTypeError(Location.DUMMY, AstBuilder.IntType, AstBuilder.BoolType);
    reporter.reportUnresolvedNameError(Location.DUMMY, 'global');
    reporter.reportUnsupportedClassTypeDefinitionError(Location.DUMMY, 'object');
    reporter.reportUnexpectedTypeKindError(Location.DUMMY, 'array', 'object');
    reporter.reportUnexpectedTypeKindError(Location.DUMMY, 'array', AstBuilder.IntType);
    reporter.reportArityMismatchError(Location.DUMMY, 'pair', 1, 2);
    reporter.reportInsufficientTypeInferenceContextError(Location.DUMMY);
    reporter.reportCollisionError(Location.DUMMY, 'a');
    reporter.reportIllegalOtherClassMatch(Location.DUMMY);
    reporter.reportIllegalThisError(Location.DUMMY);
    reporter.reportNonExhausiveMatchError(Location.DUMMY, ['A', 'B']);
    reporter.reportMissingDefinitionsError(Location.DUMMY, ['foo', 'bar']);
    reporter.reportCyclicTypeDefinitionError(AstBuilder.IntType);

    const errors = collector
      .getErrors()
      .map((it) => it.toString().substring('__DUMMY__.sam:0:0-0:0: '.length));
    expect(errors).toEqual([
      '[SyntaxError]: bad code',
      '[UnexpectedType]: Expected: `int`, actual: `bool`.',
      '[UnresolvedName]: Name `global` is not resolved.',
      "[UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
      '[UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.',
      '[UnexpectedTypeKind]: Expected kind: `array`, actual: `int`.',
      '[ArityMismatchError]: Incorrect pair size. Expected: 1, actual: 2.',
      '[InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '[Collision]: Name `a` collides with a previously defined name.',
      "[IllegalOtherClassMatch]: It is illegal to match on a value of other class's type.",
      '[IllegalThis]: Keyword `this` cannot be used in this context.',
      '[NonExhausiveMatch]: The following tags are not considered in the match: [A, B].',
      '[MissingDefinitions]: Missing definitions for [foo, bar].',
      '[CyclicTypeDefinition]: Type `int` has a cyclic definition.',
    ]);
  });
});
