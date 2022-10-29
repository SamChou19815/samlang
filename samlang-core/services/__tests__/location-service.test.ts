import { Location, ModuleReference, Position } from "../../ast/common-nodes";
import type { SamlangExpression } from "../../ast/samlang-nodes";
import { typeCheckSourceHandles } from "../../checker";
import { LocationLookup, SamlangExpressionLocationLookupBuilder } from "../location-service";

describe("location-service", () => {
  it("LocationLookupTest self consistent test", () => {
    const lookup = new LocationLookup<string>();
    const farPosition = Position(100, 100);
    const moduleReference = ModuleReference(["foo"]);
    const location = new Location(moduleReference, Position(1, 1), Position(2, 2));
    lookup.set(location, "exist");
    expect(lookup.getBestLocation(moduleReference, location.start)).toEqual(location);
    expect(lookup.getBestLocation(moduleReference, location.end)).toEqual(location);
    expect(lookup.getBestLocation(moduleReference, farPosition)).toBeNull();
    expect(lookup.getBestLocation(ModuleReference(["oof"]), farPosition)).toBeNull();
    expect(lookup.get(moduleReference, location.start)).toBe("exist");
    expect(lookup.get(moduleReference, location.end)).toBe("exist");
    expect(lookup.get(moduleReference, farPosition)).toBeNull();
  });

  it("LocationLookupTest favors small range test", () => {
    const lookup = new LocationLookup<number>();
    const moduleReference = ModuleReference(["foo"]);
    const smallLocation = new Location(moduleReference, Position(2, 1), Position(3, 2));
    const bigLocation = new Location(moduleReference, Position(1, 1), Position(30, 2));
    lookup.set(smallLocation, 1);
    lookup.set(bigLocation, 2);
    expect(lookup.getBestLocation(moduleReference, Position(3, 1))).toEqual(smallLocation);
    expect(lookup.getBestLocation(moduleReference, Position(10, 2))).toEqual(bigLocation);
    expect(lookup.getBestLocation(moduleReference, Position(100, 100))).toBeNull();
    expect(lookup.get(moduleReference, Position(3, 1))).toBe(1);
    expect(lookup.get(moduleReference, Position(10, 2))).toBe(2);
    expect(lookup.get(moduleReference, Position(100, 100))).toBeNull();
  });

  it("SamlangExpressionLocationLookupBuilder test", () => {
    const moduleReference = ModuleReference(["foo"]);
    const { checkedSources, compileTimeErrors } = typeCheckSourceHandles([
      [
        moduleReference,
        `class Foo(val a: int) {
    function bar(): int = 3
  }

  class Option<T>(None(unit), Some(T)) {
    function none(): Option<int> = Option.None({})
    function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)

    function run(): unit = Option.createSome()(1).matchExample()

    method matchExample(): unit =
      match (this) {
        | None _ -> {}
        | Some a -> {}
      }
  }

  class Obj(val d: int, val e: int) {
    function valExample(): int = {
      val a: int = 1;
      val b = 2;
      val c = 3; // c = 3
      val { e as d } = Obj.init(5, 4); // d = 4
      val f = Obj.init(5, 4); // d = 4
      val g = Obj.init(d, 4); // d = 4
      val _ = f.d;
      // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
      a + b * c / d
    }
  }

  class Main {
    function identity(a: int): int = a

    function random(): int = {
      val a = 42; // very random
      a
    }

    function oof(): int = 14

    function div(a: int, b: int): int =
      if b == 0 then (
        Builtins.panic("Division by zero is illegal!")
      ) else (
        a / b
      )

    function nestedVal(): int = {
      val a = {
        val b = 4;
        val c = {
          val c = b;
          b
        }; // c = 4
        c
      }; // 4
      a + 1 // 5
    }

    function main(): unit = Builtins.println(Builtins.intToString(Main.identity(
      Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
    )))
  }`,
      ],
    ]);
    expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

    const lookup = new LocationLookup<SamlangExpression>();
    const builder = new SamlangExpressionLocationLookupBuilder(lookup);
    const samlangModule = checkedSources.forceGet(moduleReference);
    builder.rebuild(moduleReference, samlangModule);
  });
});
