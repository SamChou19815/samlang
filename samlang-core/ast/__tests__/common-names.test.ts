import {
  ENCODED_FUNCTION_NAME_THROW,
  encodeGenericFunctionNameGlobally,
  encodeMainFunctionName,
} from "../common-names";
import { ModuleReference } from "../common-nodes";

describe("common-names", () => {
  it("Generic function has correct name", () => {
    expect(encodeGenericFunctionNameGlobally("T", "bar")).toBe("$GENERICS$_T$bar");
  });
  it("Dummy module has correct name", () => {
    expect(encodeMainFunctionName(ModuleReference.DUMMY)).toBe("___DUMMY___Main$main");
  });

  it("Nested module has correct name", () => {
    expect(encodeMainFunctionName(ModuleReference(["Foo", "Bar"]))).toBe("_Foo$Bar_Main$main");
  });

  it("Dashed module has correct name", () => {
    expect(encodeMainFunctionName(ModuleReference(["Foo-Bar-Derp", "Baz"]))).toBe(
      "_Foo_Bar_Derp$Baz_Main$main",
    );
  });

  it("Builtins have correct names", () => {
    expect(ENCODED_FUNCTION_NAME_THROW).toBe("__Builtins$panic");
  });
});
