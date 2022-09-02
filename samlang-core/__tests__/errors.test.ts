import { Location } from '../ast/common-nodes';
import { AstBuilder } from '../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../errors';

describe('samlang-core/errors', () => {
  it('error toString() test', () => {
    const collector = createGlobalErrorCollector();

    const reporter = collector.getErrorReporter();
    reporter.reportSyntaxError(Location.DUMMY, 'bad code');
    reporter.reportUnexpectedTypeError(Location.DUMMY, AstBuilder.IntType, AstBuilder.BoolType);
    reporter.reportUnexpectedSubtypeError(Location.DUMMY, AstBuilder.IntType, AstBuilder.BoolType);
    reporter.reportUnresolvedNameError(Location.DUMMY, 'global');
    reporter.reportTypeParameterNameMismatchError(Location.DUMMY, 'foo', 'bar');
    reporter.reportUnexpectedTypeKindError(Location.DUMMY, 'array', 'object');
    reporter.reportUnexpectedTypeKindError(Location.DUMMY, 'array', AstBuilder.IntType);
    reporter.reportArityMismatchError(Location.DUMMY, 'pair', 1, 2);
    reporter.reportInsufficientTypeInferenceContextError(Location.DUMMY);
    reporter.reportCollisionError(Location.DUMMY, 'a');
    reporter.reportNonExhausiveMatchError(Location.DUMMY, ['A', 'B']);
    reporter.reportMissingDefinitionsError(Location.DUMMY, ['foo', 'bar']);
    reporter.reportCyclicTypeDefinitionError(AstBuilder.IntType);

    const errors = collector
      .getErrors()
      .map((it) => it.toString().substring('__DUMMY__.sam:0:0-0:0: '.length));
    expect(errors).toEqual([
      '[SyntaxError]: bad code',
      '[UnexpectedType]: Expected: `int`, actual: `bool`.',
      '[UnexpectedSubType]: Expected: subtype of `int`, actual: `bool`.',
      '[UnresolvedName]: Name `global` is not resolved.',
      '[TypeParameterNameMismatch]: Type parameter name mismatch. Expected `foo`, actual: bar.',
      '[UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.',
      '[UnexpectedTypeKind]: Expected kind: `array`, actual: `int`.',
      '[ArityMismatchError]: Incorrect pair size. Expected: 1, actual: 2.',
      '[InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.',
      '[Collision]: Name `a` collides with a previously defined name.',
      '[NonExhausiveMatch]: The following tags are not considered in the match: [A, B].',
      '[MissingDefinitions]: Missing definitions for [foo, bar].',
      '[CyclicTypeDefinition]: Type `int` has a cyclic definition.',
    ]);
  });
});
