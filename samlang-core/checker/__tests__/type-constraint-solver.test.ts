import { DummySourceReason, ModuleReference } from '../../ast/common-nodes';
import {
  prettyPrintType,
  SamlangType,
  SourceBoolType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
  SourceStringType,
  SourceUnitType,
  SourceUnknownType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { solveTypeConstraints } from '../type-constraints-solver';

function solve(concrete: SamlangType, generic: SamlangType, typeParameters: readonly string[]) {
  const globalCollector = createGlobalErrorCollector();
  const errorReporter = globalCollector.getErrorReporter();
  const { solvedSubstitution } = solveTypeConstraints(
    concrete,
    generic,
    typeParameters,
    errorReporter,
  );
  const result = Object.fromEntries(
    Array.from(solvedSubstitution).map(([k, t]) => [k, prettyPrintType(t)]),
  );
  if (globalCollector.hasErrors) result.hasError = 'true';
  return result;
}

const IdType = (id: string) =>
  SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, id, []);

describe('type-constraint-solver', () => {
  it('primitive types', () => {
    expect(solve(SourceIntType(DummySourceReason), SourceUnitType(DummySourceReason), [])).toEqual({
      hasError: 'true',
    });

    expect(
      solve(SourceIntType(DummySourceReason), SourceUnitType(DummySourceReason), ['T']),
    ).toEqual({ T: 'unknown', hasError: 'true' });
  });

  it('identifier type', () => {
    expect(solve(SourceIntType(DummySourceReason), IdType('T'), ['T'])).toEqual({ T: 'int' });

    expect(
      solve(
        SourceIntType(DummySourceReason),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Bar', [
          SourceIntType(DummySourceReason),
        ]),
        ['Foo'],
      ),
    ).toEqual({ Foo: 'unknown', hasError: 'true' });

    expect(
      solve(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Bar', [IdType('Baz')]),
        ]),
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Foo', [
          SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'Bar', [IdType('T')]),
        ]),
        ['T'],
      ),
    ).toEqual({ T: 'Baz' });
  });

  it('function type', () => {
    expect(
      solve(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceIntType(DummySourceReason),
            SourceBoolType(DummySourceReason),
            SourceStringType(DummySourceReason),
          ],
          SourceUnitType(DummySourceReason),
        ),
        SourceFunctionType(DummySourceReason, [IdType('A'), IdType('B'), IdType('A')], IdType('C')),
        ['A', 'B', 'C'],
      ),
    ).toEqual({ A: 'int', B: 'bool', C: 'unit', hasError: 'true' });

    expect(
      solve(
        SourceIntType(DummySourceReason),
        SourceFunctionType(DummySourceReason, [IdType('A'), IdType('B'), IdType('A')], IdType('C')),
        ['A', 'B', 'C'],
      ),
    ).toEqual({ A: 'unknown', B: 'unknown', C: 'unknown', hasError: 'true' });
  });

  it('integration test 1', () => {
    const errorCollector = createGlobalErrorCollector();
    const { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType } =
      solveTypeConstraints(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceFunctionType(
              DummySourceReason,
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            SourceIntType(DummySourceReason),
          ],
          SourceUnitType(DummySourceReason),
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceFunctionType(DummySourceReason, [IdType('A')], IdType('A')), IdType('B')],
          SourceUnitType(DummySourceReason),
        ),
        ['A', 'B'],
        errorCollector.getErrorReporter(),
      );

    expect(
      Object.fromEntries(Array.from(solvedSubstitution).map(([k, t]) => [k, prettyPrintType(t)])),
    ).toEqual({ A: 'unknown', B: 'int' });
    expect(prettyPrintType(solvedGenericType)).toBe('((unknown) -> unknown, int) -> unit');
    expect(prettyPrintType(solvedContextuallyTypedConcreteType)).toBe(
      '((unknown) -> unknown, int) -> unit',
    );
    expect(
      errorCollector
        .getErrors()
        .map((it) => it.toString())
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([]);
  });

  it('integration test 2', () => {
    const errorCollector = createGlobalErrorCollector();
    const { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType } =
      solveTypeConstraints(
        SourceFunctionType(
          DummySourceReason,
          [
            SourceFunctionType(
              DummySourceReason,
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            SourceIntType(DummySourceReason),
          ],
          SourceUnitType(DummySourceReason),
        ),
        SourceFunctionType(
          DummySourceReason,
          [SourceFunctionType(DummySourceReason, [IdType('A')], IdType('A')), IdType('B')],
          SourceUnitType(DummySourceReason),
        ),
        ['B'],
        errorCollector.getErrorReporter(),
      );

    expect(
      Object.fromEntries(Array.from(solvedSubstitution).map(([k, t]) => [k, prettyPrintType(t)])),
    ).toEqual({ B: 'int' });
    expect(prettyPrintType(solvedGenericType)).toBe('((A) -> A, int) -> unit');
    expect(prettyPrintType(solvedContextuallyTypedConcreteType)).toBe('((A) -> A, int) -> unit');
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  });
});
