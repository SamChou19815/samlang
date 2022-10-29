import { ModuleReference } from "../ast/common-nodes";
import { typeCheckSourceHandles } from "../checker";
import { samlangProgramCheckerTestSources } from "../test-programs";

const expectedErrors: readonly string[] = [
  "access-private-member.sam:12:13-12:16: [UnresolvedName]: Name `A.b` is not resolved.",
  "add-panic-to-class.sam:7:50-7:60: [UnexpectedType]: Expected: `int`, actual: `A`.",
  "add-panic-to-class.sam:8:27-8:37: [UnexpectedType]: Expected: `int`, actual: `A`.",
  "add-with-class.sam:7:30-7:40: [UnexpectedType]: Expected: `int`, actual: `A`.",
  "bounded-generics.sam:15:52-15:55: [UnexpectedSubType]: Expected: subtype of `Comparable<int>`, actual: `int`.",
  "bounded-generics.sam:15:57-15:64: [UnexpectedType]: Expected: `int`, actual: `T`.",
  "bounded-generics.sam:15:66-15:73: [UnexpectedType]: Expected: `int`, actual: `T`.",
  "bounded-generics.sam:18:20-18:40: [UnexpectedTypeKind]: Expected kind: `non-abstract type`, actual: `Comparable<BoxedInt>`.",
  "bounded-generics.sam:19:53-19:69: [UnexpectedType]: Expected: `Comparable<BoxedInt>`, actual: `BoxedInt`.",
  "bounded-generics.sam:25:15-25:23: [UnexpectedType]: Expected: `() -> int`, actual: `() -> bool`.",
  "bounded-generics.sam:28:20-28:30: [UnexpectedTypeKind]: Expected kind: `interface type`, actual: `class type`.",
  "bounded-generics.sam:29:21-29:22: [UnresolvedName]: Name `T` is not resolved.",
  "complete-trash.sam:1:1-1:5: [SyntaxError]: Unexpected token among the classes and interfaces: This",
  "complete-trash.sam:1:11-1:14: [SyntaxError]: Unexpected token among the classes and interfaces: bad",
  "complete-trash.sam:1:15-1:21: [SyntaxError]: Unexpected token among the classes and interfaces: source",
  "complete-trash.sam:1:21-1:22: [SyntaxError]: Unexpected token among the classes and interfaces: .",
  "complete-trash.sam:1:6-1:8: [SyntaxError]: Unexpected token among the classes and interfaces: is",
  "complete-trash.sam:1:9-1:10: [SyntaxError]: Unexpected token among the classes and interfaces: a",
  "illegal-binary-operations.sam:12:33-12:49: [UnexpectedType]: Expected: `int`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:13:28-13:44: [UnexpectedType]: Expected: `int`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:14:35-14:51: [UnexpectedType]: Expected: `int`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:15:49-15:51: [UnexpectedType]: Expected: `Box<int>`, actual: `int`.",
  "illegal-binary-operations.sam:16:29-16:45: [UnexpectedType]: Expected: `bool`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:17:38-17:54: [UnexpectedType]: Expected: `bool`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:18:33-18:38: [UnexpectedType]: Expected: `int`, actual: `bool`.",
  "illegal-binary-operations.sam:19:28-19:33: [UnexpectedType]: Expected: `int`, actual: `bool`.",
  "illegal-binary-operations.sam:19:36-19:41: [UnexpectedType]: Expected: `int`, actual: `bool`.",
  "illegal-binary-operations.sam:21:45-21:55: [UnexpectedType]: Expected: `Box<bool>`, actual: `Box<int>`.",
  "illegal-binary-operations.sam:24:49-24:72: [UnexpectedType]: Expected: `Box<int>`, actual: `AnotherBox<int>`.",
  "illegal-binary-operations.sam:27:35-27:64: [UnexpectedType]: Expected: `Box<Box<Box<int>>>`, actual: `Box<Box<Box<bool>>>`.",
  "illegal-private-field-access.sam:15:13-15:14: [UnresolvedName]: Name `b` is not resolved.",
  "illegal-private-field-access.sam:17:15-17:16: [UnresolvedName]: Name `b` is not resolved.",
  "illegal-shadow.sam:12:12-12:16: [Collision]: Name `test` collides with a previously defined name.",
  "illegal-shadow.sam:16:28-16:32: [Collision]: Name `test` collides with a previously defined name.",
  "illegal-shadow.sam:22:9-22:10: [Collision]: Name `a` collides with a previously defined name.",
  "illegal-shadow.sam:3:7-3:8: [Collision]: Name `A` collides with a previously defined name.",
  "illegal-shadow.sam:7:12-7:16: [Collision]: Name `test` collides with a previously defined name.",
  "illegal-this.sam:5:13-5:17: [UnresolvedName]: Name `this` is not resolved.",
  "insufficient-type-info-none.sam:8:13-8:26: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
  "insufficient-type-info.sam:5:13-5:47: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
  "invalid-property-declaration-syntax.sam:2:12-2:13: [SyntaxError]: Expected: val, actual: a.",
  "multiple-type-errors.sam:3:35-3:40: [UnexpectedType]: Expected: `int`, actual: `string`.",
  "multiple-type-errors.sam:3:43-3:48: [UnexpectedType]: Expected: `int`, actual: `string`.",
  "overflow-int.sam:3:26-3:56: [SyntaxError]: Not a 32-bit integer.",
  "simple-mismatch.sam:4:26-4:30: [UnexpectedType]: Expected: `int`, actual: `bool`.",
  "undefined-type.sam:3:20-3:30: [UnresolvedName]: Name `HelloWorld` is not resolved.",
  "undefined-type.sam:3:33-3:34: [UnexpectedType]: Expected: `HelloWorld`, actual: `int`.",
  "undefined-variable.sam:3:29-3:39: [UnresolvedName]: Name `helloWorld` is not resolved.",
];

describe("checker-integration-test", () => {
  it("samlang type checker integration test", () => {
    const { compileTimeErrors } = typeCheckSourceHandles(
      samlangProgramCheckerTestSources.map((it) => [ModuleReference([it.testName]), it.sourceCode]),
    );

    const actualErrors = compileTimeErrors
      .map((it) => it.toString())
      .sort((a, b) => a.localeCompare(b));

    expect(actualErrors).toEqual(expectedErrors);
  });
});
