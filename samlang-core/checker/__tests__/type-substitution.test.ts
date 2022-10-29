import { AstBuilder, prettyPrintType } from "../../ast/samlang-nodes";
import performTypeSubstitution from "../type-substitution";

describe("type-substitution", () => {
  it("can replace deeply nested identifiers", () => {
    expect(
      prettyPrintType(
        performTypeSubstitution(
          AstBuilder.FunType(
            [
              AstBuilder.IdType("A", [
                AstBuilder.IdType("B"),
                AstBuilder.IdType("C", [AstBuilder.IntType]),
              ]),
              AstBuilder.IdType("D"),
              AstBuilder.IdType("E", [AstBuilder.IdType("F")]),
              AstBuilder.IntType,
            ],
            AstBuilder.IntType,
          ),
          new Map([
            ["A", AstBuilder.IntType],
            ["B", AstBuilder.IntType],
            ["C", AstBuilder.IntType],
            ["D", AstBuilder.IntType],
            ["E", AstBuilder.IntType],
          ]),
        ),
      ),
    ).toBe("(A<int, C<int>>, int, E<F>, int) -> int");
  });
});
