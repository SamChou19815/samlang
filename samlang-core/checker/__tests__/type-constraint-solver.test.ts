import { DummySourceReason } from "../../ast/common-nodes";
import {
  AstBuilder,
  prettyPrintType,
  SamlangType,
  SourceUnknownType,
  TypeParameterSignature,
} from "../../ast/samlang-nodes";
import { createGlobalErrorCollector } from "../../errors";
import { solveTypeConstraints } from "../type-constraints-solver";

function solve(
  concrete: SamlangType,
  generic: SamlangType,
  typeParameters: readonly TypeParameterSignature[],
) {
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
  if (globalCollector.hasErrors) result.hasError = "true";
  return result;
}

describe("type-constraint-solver", () => {
  it("primitive types", () => {
    expect(solve(AstBuilder.IntType, AstBuilder.UnitType, [])).toEqual({
      hasError: "true",
    });

    expect(solve(AstBuilder.IntType, AstBuilder.UnitType, [{ name: "T", bound: null }])).toEqual({
      T: "unknown",
      hasError: "true",
    });
  });

  it("identifier type", () => {
    expect(solve(AstBuilder.IntType, AstBuilder.IdType("T"), [{ name: "T", bound: null }])).toEqual(
      { T: "int" },
    );

    expect(
      solve(AstBuilder.IntType, AstBuilder.IdType("Bar", [AstBuilder.IntType]), [
        { name: "Foo", bound: null },
      ]),
    ).toEqual({ Foo: "unknown", hasError: "true" });

    expect(
      solve(
        AstBuilder.IdType("Foo", [AstBuilder.IdType("Bar", [AstBuilder.IdType("Baz")])]),
        AstBuilder.IdType("Foo", [AstBuilder.IdType("Bar", [AstBuilder.IdType("T")])]),
        [{ name: "T", bound: null }],
      ),
    ).toEqual({ T: "Baz" });
  });

  it("function type", () => {
    expect(
      solve(
        AstBuilder.FunType(
          [AstBuilder.IntType, AstBuilder.BoolType, AstBuilder.StringType],
          AstBuilder.UnitType,
        ),
        AstBuilder.FunType(
          [AstBuilder.IdType("A"), AstBuilder.IdType("B"), AstBuilder.IdType("A")],
          AstBuilder.IdType("C"),
        ),
        [
          { name: "A", bound: null },
          { name: "B", bound: null },
          { name: "C", bound: null },
        ],
      ),
    ).toEqual({ A: "int", B: "bool", C: "unit", hasError: "true" });

    expect(
      solve(
        AstBuilder.IntType,
        AstBuilder.FunType(
          [AstBuilder.IdType("A"), AstBuilder.IdType("B"), AstBuilder.IdType("A")],
          AstBuilder.IdType("C"),
        ),
        [
          { name: "A", bound: null },
          { name: "B", bound: null },
          { name: "C", bound: null },
        ],
      ),
    ).toEqual({ A: "unknown", B: "unknown", C: "unknown", hasError: "true" });
  });

  it("integration test 1", () => {
    const errorCollector = createGlobalErrorCollector();
    const { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType } =
      solveTypeConstraints(
        AstBuilder.FunType(
          [
            AstBuilder.FunType(
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            AstBuilder.IntType,
          ],
          AstBuilder.UnitType,
        ),
        AstBuilder.FunType(
          [
            AstBuilder.FunType([AstBuilder.IdType("A")], AstBuilder.IdType("A")),
            AstBuilder.IdType("B"),
          ],
          AstBuilder.UnitType,
        ),
        [
          { name: "A", bound: null },
          { name: "B", bound: null },
        ],
        errorCollector.getErrorReporter(),
      );

    expect(
      Object.fromEntries(Array.from(solvedSubstitution, ([k, t]) => [k, prettyPrintType(t)])),
    ).toEqual({ A: "unknown", B: "int" });
    expect(prettyPrintType(solvedGenericType)).toBe("((unknown) -> unknown, int) -> unit");
    expect(prettyPrintType(solvedContextuallyTypedConcreteType)).toBe(
      "((unknown) -> unknown, int) -> unit",
    );
    expect(
      errorCollector
        .getErrors()
        .map((it) => it.toString())
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([]);
  });

  it("integration test 2", () => {
    const errorCollector = createGlobalErrorCollector();
    const { solvedSubstitution, solvedGenericType, solvedContextuallyTypedConcreteType } =
      solveTypeConstraints(
        AstBuilder.FunType(
          [
            AstBuilder.FunType(
              [SourceUnknownType(DummySourceReason)],
              SourceUnknownType(DummySourceReason),
            ),
            AstBuilder.IntType,
          ],
          AstBuilder.UnitType,
        ),
        AstBuilder.FunType(
          [
            AstBuilder.FunType([AstBuilder.IdType("A")], AstBuilder.IdType("A")),
            AstBuilder.IdType("B"),
          ],
          AstBuilder.UnitType,
        ),
        [{ name: "B", bound: null }],
        errorCollector.getErrorReporter(),
      );

    expect(
      Object.fromEntries(Array.from(solvedSubstitution).map(([k, t]) => [k, prettyPrintType(t)])),
    ).toEqual({ B: "int" });
    expect(prettyPrintType(solvedGenericType)).toBe("((A) -> A, int) -> unit");
    expect(prettyPrintType(solvedContextuallyTypedConcreteType)).toBe("((A) -> A, int) -> unit");
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  });
});
