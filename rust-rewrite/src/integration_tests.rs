#[cfg(test)]
mod tests {
  use crate::{
    ast::ModuleReference,
    checker::{
      type_check_single_module_source, type_check_source_handles, TypeCheckSourceHandlesResult,
    },
    common::rcs,
    compiler,
    errors::ErrorSet,
    interpreter,
    parser::parse_source_module_from_text,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  struct CheckerTestSource<'a> {
    test_name: &'a str,
    source_code: &'a str,
  }

  struct CompilerTestCase<'a> {
    name: &'a str,
    expected_std: &'a str,
    source_code: &'a str,
  }

  #[test]
  fn type_checker_integration_tests() {
    let sources = vec![
      CheckerTestSource {
        test_name: "access-builtin",
        source_code: r#"
class Main {
  function main(): unit = {
    val a: int = Builtins.stringToInt("3");
    val b: string = Builtins.intToString(3);
    val c: unit = Builtins.println("3");
    val d: Main = Builtins.panic("3");
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "access-private-member",
        source_code: r#"
class A {
  private function b(): int = 3
}

class C(val v: bool) {
  function create(): C = C.init(true)
}

class Main {
  function main(): unit = {
    val _ = A.b();
    val _ = C.create();
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "add-panic-to-class",
        source_code: r#"
class A(val a: int) {
  function create(): A = A.init(42)
}

class Main {
  function main1(): int = Builtins.panic("Ah") + A.create()
  function main2(): int = A.create() + Builtins.panic("Ah")
  private function main(): int = Main.main1() + Main.main2()
}
"#,
      },
      CheckerTestSource {
        test_name: "add-with-class",
        source_code: r#"
class A(val a: int) {
  function create(): A = A.init(42)
}

class Main {
  function main(): int = 3 + A.create()
}
"#,
      },
      CheckerTestSource {
        test_name: "allowed-cyclic-classes",
        source_code: r#"
class A {
  function a(): int = B.b()
}

class B {
  function b(): int = A.a()
}

class Main {
  function main(): unit = {}
}
"#,
      },
      CheckerTestSource {
        test_name: "bounded-generics",
        source_code: r#"
interface Comparable<T> {
  method compare(other: T): int
}
class BoxedInt(val i: int): Comparable<BoxedInt> {
  method compare(other: BoxedInt): int = this.i - other.i
}
class TwoItemCompare {
  function <C: Comparable<C>> compare(v1: C, v2: C): int =
    v1.compare(v2)
}
class Pair<T: Comparable<T>>(val v1: T, val v2: T) {
  method relation1(): int = TwoItemCompare.compare(this.v1, this.v2)
  method relation2(): int = TwoItemCompare.compare<T>(this.v1, this.v2)
  method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
}
class TestLimitedSubtyping {
  function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
  function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
}
interface Conflicting1 {
  function foo(): int
}
interface Conflicting2 {
  function foo(): bool
}
interface ExtendingConfliting : Conflicting1, Conflicting2
class ImplItself : ImplItself {} // error: expect interface type
class ImplTArg<T> : T {} // error: T not resolved
"#,
      },
      CheckerTestSource { test_name: "complete-trash", source_code: "This is a bad source." },
      CheckerTestSource {
        test_name: "forty-two",
        source_code: r#"
class Main {
  function main(): int = 42
}
"#,
      },
      CheckerTestSource {
        test_name: "hello-world",
        source_code: r#"
class Main {
  function main(): string = "Hello World!"
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-binary-operations",
        source_code: r#"
class Box<T>(val value: T) {
  function <T> empty(): Box<T> = Box.init(Builtins.panic<T>("PANIC"))
  function <T> of(value: T): Box<T> = Box.init(value)
}

class AnotherBox<T>(val value: T) {
  function <T> empty(): AnotherBox<T> = AnotherBox.init(Builtins.panic<T>("PANIC"))
}

class Main {
  function test01(): int = 42 + Box.empty<int>() // error
  function test02(): int = Box.empty<int>() + 42 // error
  function test03(): bool = 42 == Box.empty<int>() // error
  function test04(): bool = Box.empty<int>() == 42 // error
  function test05(): bool = Box.empty<int>() || false // error
  function test06(): bool = false || Box.empty<int>() // error
  function test07(): int = 42 * false // error
  function test08(): int = false + false // error
  function test09(): bool = Box.of(true) == Box.of(false) // ok
  function test10(): bool = Box.of(true) == Box.of(42) // error
  function test11(): bool = Box.of(true) == Box.empty() // ok
  function test12(): bool = Box.empty<int>() == Box.of(42) // ok
  function test13(): bool = Box.empty<int>() == AnotherBox.empty<int>() // error
  function test14(): bool =
    // Deeply nested type inconsistencies
    Box.of(Box.of(Box.of(42))) == Box.of(Box.of(Box.of(false)))
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-private-field-access",
        source_code: r#"
class Fields(val a: int, private val b: bool) {
  function get(): Fields = {
    val f = Fields.init(3, true);
    val {a, b} = f;
    val _ = f.a;
    val _ = f.b;
    f
  }
}

class Main {
  function main(): unit = {
    val f = Fields.get();
    val {a, b} = f;
    val _ = f.a;
    val _ = f.b;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-shadow",
        source_code: r#"
class A {}
class A {}

class ConflictingFunctions {
  function test(): unit = ConflictingFunctions.test()
  function test(): unit = ConflictingFunctions.test()
}

class ConflictingMethodsAndFunctions(val a: int) {
  method test(): int = 42
  function test(): unit = ConflictingMethodsAndFunctions.test()
}

class FunctionParametersConflict {
  function test(test: int, test: int): unit = {}
}

class Main {
  function main(): unit = {
    val a = 42;
    val a = 42;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-this",
        source_code: r#"

class Main {
  function main(): unit = {
    val _ = this;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "insufficient-type-info",
        source_code: r#"
class NotEnoughTypeInfo {
  function <T> randomFunction(): T = Builtins.panic("I can be any type!")
  function main(): unit = {
    val _ = NotEnoughTypeInfo.randomFunction();
  }
}
class Main {
  function main(): unit = NotEnoughTypeInfo.main()
}
"#,
      },
      CheckerTestSource {
        test_name: "insufficient-type-info-none",
        source_code: r#"
class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = Option.None(true)
  method toSome(t: T): Option<T> = Option.Some(t)
}
class Main {
  function main(): unit = {
    val a = Option.none();
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "invalid-property-declaration-syntax",
        source_code: r#"
class Main(a: int, val b: int) {
  function main(): int = 42
}
    "#,
      },
      CheckerTestSource {
        test_name: "lots-of-fields-and-methods",
        source_code: r#"
class SamObject<T>(val sam: T, val good: bool, val linesOfCode: int) {
  function <T> create(sam: T): SamObject<T> = SamObject.init(sam, true, 100000)
  method getSam(): T = this.sam
  method isGood(): bool = true
  method getLinesOfCode(): int = 0 + this.linesOfCode
  method withDifferentLOC(linesOfCode: int): SamObject<T> =
    SamObject.init(this.sam, this.good, linesOfCode)
}

class Main {
  function main(): unit = {
    val sam = SamObject.create("sam zhou").withDifferentLOC(100001);
    val s = sam.getSam();
    val linesOfCode = if (sam.isGood()) then sam.getLinesOfCode() else 0;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "min-int",
        source_code: r#"
class Main {
  function main(): int = -2147483648
}
"#,
      },
      CheckerTestSource {
        test_name: "multiple-type-errors",
        source_code: r#"
class Main {
  function main(): int = 233333 + "foo" + "bar" + 42
}
    "#,
      },
      CheckerTestSource {
        test_name: "overengineered-helloworld",
        source_code: r#"
class HelloWorld(val message: string) {
  private method getMessage(): string = {
    val { message } = this;
    message
  }

  function getGlobalMessage(): string = {
    val hw = HelloWorld.init("Hello World!");
    hw.getMessage()
  }
}

class Main {
  function main(): string = HelloWorld.getGlobalMessage()
}
"#,
      },
      CheckerTestSource {
        test_name: "overengineered-helloworld-2",
        source_code: r#"
class NewYear2019<T>(val message: T) {
  function create(): NewYear2019<string> = NewYear2019.init("Hello World!")
  method getMessage(): T = {
    val { message as msg } = this; msg
  }
}

class Main {
  function main(): string = NewYear2019.create().getMessage()
}
"#,
      },
      CheckerTestSource {
        test_name: "overflow-int",
        source_code: r#"
class Main {
  function main(): int = 999999999999999999999999999999
}
    "#,
      },
      CheckerTestSource {
        test_name: "pipe",
        source_code: r#"
class Main {
  function <A, B, C> pipe(a: A, f1: (A)->B, f2: (B)->C): C = f2(f1(a))

  function main(): unit = {
    val _ = Main.pipe(1, (n) -> Builtins.intToString(n), (s) -> Builtins.stringToInt(s));
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "polymorphic-option",
        source_code: r#"
class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = Option.None(true)
  method toSome(t: T): Option<T> = Option.Some(t)
}

class Main {
  function main(): Option<string> = Option.none<string>().toSome("hi")
  function main2(): Option<string> = {
    val a = Option.none<string>();
    a.toSome("hi")
  }

  function main3(): Option<string> = {
    val a: Option<string> = Option.none();
    a.toSome("hi")
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "sam-in-samlang-list",
        source_code: r#"
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    List.Cons(Pair.init(t, List.Nil<T>({})))
  method cons(t: T): List<T> =
    List.Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...");
    val github = "SamChou19815";
    Developer.init("Sam Zhou", github, l)
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
"#,
      },
      CheckerTestSource {
        test_name: "simple-mismatch",
        source_code: r#"
    class Main {
      // should be type bool!
      function main(): int = true
    }
    "#,
      },
      CheckerTestSource {
        test_name: "simple-type-inference-annotated",
        source_code: r#"
/**
 * From Cornell CS4110's Type Checking Lecture.
 * This version is fully annotated.
 */
class Main {
  function main(): unit = {
    val _: ((int) -> bool, int, int) -> int = (a, b, c) -> if a(b + 1) then b else c;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "undefined-type",
        source_code: r#"
class Main {
  function main(): HelloWorld = 1
}
"#,
      },
      CheckerTestSource {
        test_name: "undefined-variable",
        source_code: r#"
class Main {
  function main(): string = helloWorld
}
"#,
      },
    ];

    let expected_errors = vec![
      "access-private-member.sam:12:13-12:16: [UnresolvedName]: Name `A.b` is not resolved.",
      "add-panic-to-class.sam:7:50-7:60: [UnexpectedType]: Expected: `int`, actual: `A`.",
      "add-panic-to-class.sam:8:27-8:37: [UnexpectedType]: Expected: `int`, actual: `A`.",
      "add-with-class.sam:7:30-7:40: [UnexpectedType]: Expected: `int`, actual: `A`.",
      "bounded-generics.sam:15:52-15:55: [UnexpectedSubtype]: Expected: subtype of `Comparable<int>`, actual: `int`.",
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
      "simple-mismatch.sam:4:30-4:34: [UnexpectedType]: Expected: `int`, actual: `bool`.",
      "undefined-type.sam:3:20-3:30: [UnresolvedName]: Name `HelloWorld` is not resolved.",
      "undefined-type.sam:3:33-3:34: [UnexpectedType]: Expected: `HelloWorld`, actual: `int`.",
      "undefined-variable.sam:3:29-3:39: [UnresolvedName]: Name `helloWorld` is not resolved.",
    ];

    let result = type_check_source_handles(
      sources
        .iter()
        .map(|it| (ModuleReference::ordinary(vec![rcs(it.test_name)]), it.source_code))
        .collect_vec(),
    );

    let actual_errors = result.compile_time_errors.iter().map(|it| it.to_string()).collect_vec();
    assert_eq!(expected_errors, actual_errors);
  }

  fn compiler_integration_tests() -> Vec<CompilerTestCase<'static>> {
    vec![
      CompilerTestCase {
        name: "AndOrInsideIf",
        expected_std: "one\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val i = 1;
    val j = 2;
    if (i < j && i > 0 && j > 0) then {
      val a = 3;
      val b = 4;
      if (a > b || a + b > 0 && true) then Builtins.println("one") else Builtins.println("two")
    } else {
      val a = 3;
      val b = 4;
      if (a == 2 || b == 4) then {
        Builtins.println("three")
      } else {
        Builtins.println("four")
      }
    }
  }
}
"#,
      },
      CompilerTestCase {
        name: "BlockInIfElse",
        expected_std: "",
        source_code: r#"
class Main {
  function main(): unit =
    if (true) then {
      val _ = Main.main2();
      val _ = Main.main3();
      val _ = 3;
      {}
    } else {
      {}
    }

  function main2(): int =
    if (true) then {
      val _ = 3;
      3
    } else {
      2
    }

  function main3(): unit =
    if (true) then {
      val _ = 3;
    } else {
      // Do nothing...
    }
}
"#,
      },
      CompilerTestCase {
        name: "Builtins",
        expected_std: "42!\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val value = Builtins.intToString(Builtins.stringToInt("42"))::"!";
    val _ = Builtins.println(value);
  }
}
"#,
      },
      CompilerTestCase {
        name: "CFTest1",
        expected_std: "1205\n",
        source_code: r#"
class Main {
  function main(): unit = Builtins.println(Builtins.intToString(
    1 + 34 * 34 + 4 + 1 + 1231 / 28 + 100/100 - 2000*2000/(10*10*10*4000)
  ))
}
"#,
      },
      CompilerTestCase {
        name: "CFTest2",
        expected_std: "37\n",
        source_code: r#"
class Main {
  function main(): unit = {
    // 35
    val increase = (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                   (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                   (1+2*3-4/5%10000000/12334);
    Builtins.println(Builtins.intToString(2 + increase))
  }
}
"#,
      },
      CompilerTestCase {
        name: "CFTest3",
        expected_std: "7\n",
        source_code: r#"
class Main {
  function main(): unit = Builtins.println(Builtins.intToString(1 + 2 * 3 - 4 / 5 % 10000000 / 1234))
}
"#,
      },
      CompilerTestCase {
        name: "ConcatString",
        expected_std: "Hello World!\n",
        source_code: r#"
class Main {
  function main(): unit = Builtins.println("Hello "::"World!")
}
"#,
      },
      CompilerTestCase {
        name: "CorrectOp",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function crash(a: string, b: string): unit = {
    val _ = Builtins.println("different:");
    val _ = Builtins.println("a:");
    val _ = Builtins.println(a);
    val _ = Builtins.println("b:");
    val _ = Builtins.println(b);
    val _ = Builtins.panic<unit>("crash!");
  }

  function checkInt(a: int, b: int): unit =
    if (a == b) then {} else Main.crash(Builtins.intToString(a), Builtins.intToString(b))

  function boolToString(b: bool): string =
    if (b) then "true" else "false"

  function checkBool(a: bool, b: bool): unit =
    if (a == b) then {} else Main.crash(Main.boolToString(a), Main.boolToString(b))

  function checkAll(): unit = {
    val _ = Main.checkInt(42, 21 * 2);
    val _ = Main.checkInt(42, 84 / 2);
    val _ = Main.checkInt(42, 91 % 49);
    val _ = Main.checkInt(42, 20 + 22);
    val _ = Main.checkInt(42, 50 - 8);

    val _ = Main.checkBool(false, false);
    val _ = Main.checkBool(true, true);

    val _ = Main.checkBool(false, false && false);
    val _ = Main.checkBool(false, true && false);
    val _ = Main.checkBool(false, false && true);
    val _ = Main.checkBool(true, true && true);
    val _ = Main.checkBool(false, false || false);
    val _ = Main.checkBool(true, true || false);
    val _ = Main.checkBool(true, false || true);
    val _ = Main.checkBool(true, true || true);

    val _ = Main.checkBool(true, 42 < 50);
    val _ = Main.checkBool(false, 42 > 42);
    val _ = Main.checkBool(false, 42 > 50);
    val _ = Main.checkBool(true, 42 <= 42);
    val _ = Main.checkBool(true, 42 <= 43);
    val _ = Main.checkBool(false, 42 <= 41);
    val _ = Main.checkBool(true, 50 > 42);
    val _ = Main.checkBool(false, 42 < 42);
    val _ = Main.checkBool(false, 50 < 42);
    val _ = Main.checkBool(true, 42 >= 42);
    val _ = Main.checkBool(true, 43 >= 42);
    val _ = Main.checkBool(false, 41 >= 42);

    val _ = Main.checkBool(true, 1 == 1);
    val _ = Main.checkBool(false, 1 == 2);
    val _ = Main.checkBool(false, 1 != 1);
    val _ = Main.checkBool(true, 1 != 2);
    val _ = Main.checkBool(true, true == true);
    val _ = Main.checkBool(false, true == false);
    val _ = Main.checkBool(false, true != true);
    val _ = Main.checkBool(true, true != false);

    val c = 21;
    val _ = Main.checkInt(-42, -(c * 2)); // prevent constant folding!
    val _ = Main.checkBool(true, !false);
    val _ = Main.checkBool(false, !true);
  }

  function main(): unit = {
    val _ = Main.checkAll();
    Builtins.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "CreateVariants",
        expected_std: "hello\n",
        source_code: r#"
class Pair<A, B>(val a: A, val b: B) {}

class List(Nil(unit), Cons(Pair<int, List>)) { function of(i: int): List = List.Cons(Pair.init(i, List.Nil({  })))  }

class Main { function main(): unit = { val _: List = List.of(1); Builtins.println("hello") }  }
"#,
      },
      CompilerTestCase {
        name: "CSETest1",
        expected_std: "30\n12\n15\n",
        source_code: r#"
class Main {
  function printInt(i: int): unit = Builtins.println(Builtins.intToString(i))

  function test(a: int, b: int): unit = {
    val _ = Main.printInt((a * b + a) + (a * b + a));
    val _ = Main.printInt(a * b);
    val _ = Main.printInt(a * b + a);
  }

  function main(): unit = Main.test(3, 4)
}
"#,
      },
      CompilerTestCase {
        name: "CSETest2",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function printInt(i: int): unit = Builtins.println(Builtins.intToString(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      Builtins.panic("actual: "::Builtins.intToString(actual)::", expected "::Builtins.intToString(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    val t = if (first) then a * b else a * b;
    val _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    val _ = Main.test(true, 3, 4, 12);
    val _ = Main.test(false, 3, 4, 12);
    Builtins.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "CSETest3",
        expected_std: "2181\n",
        source_code: r#"
class Main {
  function log(x: int, b: int): int =
    if (x <= 0) then 0
    else if (x <= b) then 1
    else if (x <= b * b) then 2
    else if (x <= b * b * b) then 3
    else if (x <= b * b * b * b) then 4
    else if (x <= b * b * b * b * b) then 5
    else if (x <= b * b * b * b * b * b) then 6
    else if (x <= b * b * b * b * b * b * b) then 7
    else if (x <= b * b * b * b * b * b * b * b) then 8
    else if (x <= b * b * b * b * b * b * b * b * b) then 9
    else if (x <= b * b * b * b * b * b * b * b * b * b) then 10
    else 10 + Main.log(x / (b * b * b * b * b * b * b * b * b * b), b)

  function plusLog2(acc: int, i: int): int = acc + Main.log(i, 2)

  function test(acc: int, i: int): int =
    if (i >= 300) then
      acc
    else
      Main.test(acc + Main.log(i, 2), i + 1)

  function main(): unit = Builtins.println(Builtins.intToString(Main.test(0, 0)))
}
"#,
      },
      CompilerTestCase {
        name: "CSETest4",
        expected_std: "141\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val megagrams: int = 141332443;
    val kilograms: int = megagrams / 1000;
    val grams: int = (megagrams / 1000) / 1000;
    Builtins.println(Builtins.intToString(grams))
  }
}
"#,
      },
      CompilerTestCase {
        name: "CSETest5",
        expected_std: "2\n",
        source_code: r#"
class Main {
  function test(totalOddNumbers: int, i: int): int = {
    if (i >= 4) then
      totalOddNumbers
    else {
      val iMod64 = i % 64;
      val iMod32 = (i % 64) % 32;
      val iMod16 = ((i % 64) % 32) % 16;
      val iMod8 = (((i % 64) % 32) % 16) % 8;
      val iMod4 = ((((i % 64) % 32) % 16) % 8) % 4;
      val iMod2 = (((((i % 64) % 32) % 16) % 8) % 4) % 2;
      Main.test(totalOddNumbers + iMod2, i + 1)
    }
  }

  function main(): unit = Builtins.println(Builtins.intToString(Main.test(0, 0)))
}
"#,
      },
      CompilerTestCase {
        name: "CSETest6",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function printInt(i: int): unit = Builtins.println(Builtins.intToString(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      Builtins.panic("actual: "::Builtins.intToString(actual)::", expected "::Builtins.intToString(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    val _ = if (first) then {
      val _ = a * b;
    } else {};
    val _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    val _ = Main.test(true, 3, 4, 12);
    val _ = Main.test(false, 3, 4, 12);
    Builtins.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "DifferentClassesDemo",
        expected_std: "OK\n",
        source_code: r#"
class Math {
  function plus(a: int, b: int): int = a + b
  function cosine(angleInDegree: int): int = Builtins.panic("Not supported!")
}

class Student(val name: string, val age: int) {
  method getName(): string = this.name
  method getAge(): int = this.age
  function dummyStudent(): Student = Student.init("RANDOM_BABY", 0)
}

class PrimitiveType(
  U(bool),
  I(int),
  S(string),
  B(bool)
) {
  // some random functions
  function getUnit(): PrimitiveType = PrimitiveType.U(false)
  function getInteger(): PrimitiveType = PrimitiveType.I(42)
  function getString(): PrimitiveType = PrimitiveType.S("Answer to life, universe, and everything.")
  function getBool(): PrimitiveType = PrimitiveType.B(false)

  // pattern matching!
  method isTruthy(): bool =
    match (this) {
      | U _ -> false
      | I i -> i != 0
      | S s -> s != ""
      | B b -> b
    }
}

class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x) -> x
}

class Box<T>(val content: T) {
  function <T> create(content: T): Box<T> = Box.init(content)
  method getContent(): T = {
    val { content } = this; content
  }
}

class Option<T>(None(unit), Some(T)) {
  function <T> getNone(): Option<T> = Option.None({})
  function <T> getSome(d: T): Option<T> = Option.Some(d)
  method forceValue(): T =
    match (this) {
      | None _ -> Builtins.panic("Ah")
      | Some v -> v
    }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      | None _ -> Option.None({})
      | Some d -> Option.Some(f(d))
    }
}

class Main {

  private function assertTrue(condition: bool, message: string): unit =
    if (condition) then {} else Builtins.panic(message)

  private function assertFalse(condition: bool, message: string): unit =
    if (!condition) then {} else Builtins.panic(message)

  private function assertEquals(e1: int, e2: int, message: string): unit =
    if (e1 == e2) then {} else Builtins.panic(Builtins.intToString(e1)::" "::Builtins.intToString(e2)::" "::message)

  private function consistencyTest(): unit = {
    val _ = Main.assertEquals(Option.getSome(3).map((i) -> i + 1).forceValue(), 4, "Ah1");
    val _ = Main.assertEquals(Box.create(42).getContent(), 42, "Ah2");
    val _ = Main.assertEquals(FunctionExample.getIdentityFunction<int>()(42), 42, "Ah3");
    val _ = Main.assertEquals(Student.dummyStudent().getAge(), 0, "Ah4");
    val _ = Main.assertEquals(Math.plus(2, 2), 4, "Ah5");
    val _ = Main.assertFalse(PrimitiveType.getUnit().isTruthy(), "Ah6");
    val _ = Main.assertTrue(PrimitiveType.getInteger().isTruthy(), "Ah7");
    val _ = Main.assertTrue(PrimitiveType.getString().isTruthy(), "Ah8");
    val _ = Main.assertFalse(PrimitiveType.getBool().isTruthy(), "Ah9");
  }

  function main(): unit = {
    val _ = Main.consistencyTest();
    Builtins.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "DifferentExpressionsDemo",
        expected_std: "42\n",
        source_code: r#"
class Foo(val a: int) {
  function bar(): int = 3
}

class Option<T>(None(unit), Some(T)) {
  function matchExample(opt: Option<int>): int =
    match (opt) {
      | None _ -> 42
      | Some a -> a
    }
}

class Obj(private val d: int, val e: int) {
  function valExample(): int = {
    val a: int = 1;
    val b = 2;
    val c = 3;
    val { e as d } = Obj.init(5, 4); // d = 4
    val _ = 42;
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
}
"#,
      },
      CompilerTestCase {
        name: "Empty",
        expected_std: "",
        source_code: r#"
class Main {
  function main(): unit = {}
}
"#,
      },
      CompilerTestCase {
        name: "EvaluationOrder",
        expected_std: r#"0
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
"#,
        source_code: r#"
// This program uses function calls that contain printing statement to detect evaluation order.

class Main {
  // return a random number, print order
  function intIdentity(order: int): int = {
    val _ = Builtins.println(Builtins.intToString(order));
    2
  }

  // return a random bool, print order
  function boolIdentity(item: bool, order: int): bool = {
    val _ = Builtins.println(Builtins.intToString(order));
    item
  }

  // return the string back, print str
  function stringIdentity(str: string): string = {
    val _ = Builtins.println("surprise!");
    str
  }

  function binaryExpressionTest(): unit = {
    val _ = Main.intIdentity(0) + Main.intIdentity(1);
    val _ = Main.intIdentity(2) - Main.intIdentity(3);
    val _ = Main.intIdentity(4) * Main.intIdentity(5);
    val _ = Main.intIdentity(6) / Main.intIdentity(7);
    val _ = Main.intIdentity(8) % Main.intIdentity(9);
    val _ = Main.intIdentity(10) < Main.intIdentity(11);
    val _ = Main.intIdentity(12) <= Main.intIdentity(13);
    val _ = Main.intIdentity(14) > Main.intIdentity(15);
    val _ = Main.intIdentity(16) >= Main.intIdentity(17);
    val _ = Main.intIdentity(18) == Main.intIdentity(19);
    val _ = Main.intIdentity(20) != Main.intIdentity(21);
    val _ = Main.boolIdentity(false, 22) || Main.boolIdentity(false, 23);
    val _ = Main.boolIdentity(true, 24) && Main.boolIdentity(true, 25);
  }

  function main(): unit = Main.binaryExpressionTest()
}
"#,
      },
      CompilerTestCase {
        name: "FunctionCallNeverIgnored",
        expected_std: "hi\n",
        source_code: r#"
class Main {
  function hi(): int = {
    val _ = Builtins.println("hi");
    5
  }

  function main(): unit = {
    val _ = Main.hi();
  }
}
"#,
      },
      CompilerTestCase {
        name: "GenericObjectTest",
        expected_std: "2\n42\n",
        source_code: r#"
class GenericObject<T1, T2>(val v1: T1, val v2: T2) {
  function main(): unit = {
    val f = (v2: int) -> (
      if (v2 + 1 == 3) then
        GenericObject.init(3, v2)
      else
        GenericObject.init(3, 42)
    );
    val _ = Builtins.println(Builtins.intToString(f(2).v2)); // print 2
    val _ = Builtins.println(Builtins.intToString(f(3).v2)); // print 42
  }
}

class Main {
  function main(): unit = GenericObject.main()
}
"#,
      },
      CompilerTestCase {
        name: "IfElseConsistency",
        expected_std: "3\n3\nOK\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val a = if (true) then
      (if (false) then 10000 else 3)
    else
      4
    ;
    val b = if (false) then 4 else if (true) then 3 else 20000;
    val _ = Builtins.println(Builtins.intToString(a));
    val _ = Builtins.println(Builtins.intToString(b));
    if (a != b) then Builtins.panic("Not OK") else Builtins.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "IfElseUnreachable1",
        expected_std: "success\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val i = 2;
    val j = 3;
    if (i > j) then
      Builtins.println("shouldn't reach here")
    else if (j < i) then
      Builtins.println("shouldn't reach here")
    else if (i < 0) then
      Builtins.println("shouldn't reach here")
    else
      Builtins.println("success")
  }
}
"#,
      },
      CompilerTestCase {
        name: "IfElseUnreachable2",
        expected_std: "success\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val i = 3;
    val j = 2;
    if (i > j) then
      Builtins.println("success")
    else if (j < i) then
      Builtins.println("shouldn't reach here")
    else if (i < 0) then
      Builtins.println("shouldn't reach here")
    else
      Builtins.println("shouldn't reach here")
  }
}
"#,
      },
      CompilerTestCase {
        name: "LoopOptimization",
        expected_std: "100\n106\n112\n118\n124\n",
        source_code: r#"
class Main {
  function printInt(n: int): unit = Builtins.println(Builtins.intToString(n))

  function loopy(i: int): int =
    if (i >= 10) then 0 else {
      val j: int = i * 3 + 100;
      val _: unit = Main.printInt(j);
      Main.loopy(i + 2)
    }

  function main(): unit = {
    val _: int = Main.loopy(0);
  }

}
"#,
      },
      CompilerTestCase {
        name: "MapButIgnore",
        expected_std: "",
        source_code: r#"
class Option<T>(None(unit), Some(T)) {
  method <R> mapButIgnore(f: (T) -> R): unit = {
    val _ = match (this) {
      | None _ -> Option.None<R>({})
      | Some d -> Option.Some(f(d))
    };
  }

  function main(): unit = {
    val none = Option.None<int>({});
    val noneMapped = none.mapButIgnore((it) -> it);
    val _ = Option.Some(noneMapped).mapButIgnore((it) -> it);
  }
}

class Main {
  function main(): unit = Option.main()
}
"#,
      },
      CompilerTestCase {
        name: "MathFunctions",
        expected_std: "24\n55\n",
        source_code: r#"
class Main {
  function factorial(n: int): int =
    if (n == 0) then 1 else Main.factorial(n - 1) * n

  function fib(n: int): int =
    if (n == 0) then 0 else if (n == 1) then 1 else Main.fib(n - 2) + Main.fib(n - 1)

  function uselessRecursion(n: int): unit = if (n == 0) then {} else Main.uselessRecursion(n - 1)

  function main(): unit = {
    val _ = Builtins.println(Builtins.intToString(Main.factorial(4)));
    val _ = Builtins.println(Builtins.intToString(Main.fib(10)));
    val _ = Main.uselessRecursion(3);
  }
}
"#,
      },
      CompilerTestCase {
        name: "MutuallyRecursive",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function isEven(n: int): bool = if n == 0 then true else Main.isOdd(n-1)
  function isOdd(n: int): bool = if n == 0 then false else Main.isEven(n-1)

  function main(): unit =
    if (!(Main.isEven(3)) && Main.isOdd(3)) then Builtins.println("OK") else Builtins.println("BAD")
}
"#,
      },
      CompilerTestCase {
        name: "OptionalSemicolon",
        expected_std: "-7\n",
        source_code: r#"
class Main(val a: int, val b: bool) {
  function main(): unit = {
    val _ = 3;
    val a = 2;
    val c = a - 3;
    val d = c * 7;
    val b = true;
    val e = c;
    val _ = Main.init(e, b);
    val finalValue = a + c + d + (if (b) then 0 else Builtins.panic("")) + e; // 2 + (-1) + (-7) + (-1) = -7;
    Builtins.println(Builtins.intToString(finalValue))
  }
}
"#,
      },
      CompilerTestCase {
        name: "ShortCircuitAndOr",
        expected_std: r#"0
1
false
0
1
true
0
false
0
false
0
true
0
true
0
1
false
0
1
true
0
1
0
1
0
0
0
0
0
1
0
1
"#,
        source_code: r#"
class Main {
  function printAndReturn(b: bool, i: int): bool = {
    val _ = Builtins.println(Builtins.intToString(i));
    b
  }

  function printlnBool(b: bool): unit = if (b) then Builtins.println("true") else Builtins.println("false")

  function testAndShortCircuitInExpression(): unit = {
    val b1 = Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1); // [0] [1]
    val _ = Main.printlnBool(b1); // false
    val b2 = Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1); // [0] [1]
    val _ = Main.printlnBool(b2); // true
    val b3 = Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1); // [0]
    val _ = Main.printlnBool(b3); // false
    val b4 = Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1); // [0]
    val _ = Main.printlnBool(b4); // false
  }

  function testOrShortCircuitInExpression(): unit = {
    val b1 = Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1); // [0]
    val _ = Main.printlnBool(b1); // true
    val b2 = Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1); // [0]
    val _ = Main.printlnBool(b2); // true
    val b3 = Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1); // [0] [1]
    val _ = Main.printlnBool(b3); // false
    val b4 = Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1); // [0] [1]
    val _ = Main.printlnBool(b4); // true
  }

  function testAndShortCircuitInIf(): unit = {
    // [0] [1]
    val _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1)) then Builtins.panic<unit>("Ah") else {};
    // [0] [1]
    val _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1)) then {} else Builtins.panic("Ah");
    // [0]
    val _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1)) then Builtins.panic<unit>("Ah") else {};
    // [0]
    val _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1)) then Builtins.panic<unit>("Ah") else {};
  }

  function testOrShortCircuitInIf(): unit = {
    // [0]
    val _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1)) then {} else Builtins.panic("Ah");
    // [0]
    val _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1)) then {} else Builtins.panic("Ah");
    // [0] [1]
    val _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1)) then Builtins.panic<unit>("Ah") else {};
    // [0] [1]
    val _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1)) then {} else Builtins.panic("Ah");
  }

  function main(): unit = {
    val _ = Main.testAndShortCircuitInExpression();
    val _ = Main.testOrShortCircuitInExpression();
    val _ = Main.testAndShortCircuitInIf();
    val _ = Main.testOrShortCircuitInIf();
  }
}
"#,
      },
      CompilerTestCase {
        name: "SortableList",
        expected_std: "1\n2\n3\n4\n",
        source_code: r#"
class Pair<A, B>(val a: A, val b: B)

interface Comparable<T> {
  method compare(other: T): int
}

class BoxedInt(val i: int): Comparable<BoxedInt> {
  method compare(other: BoxedInt): int = this.i - other.i
}

class List<T: Comparable<T>>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T: Comparable<T>> nil(): List<T> = List.Nil<T>({  })

  function <T: Comparable<T>> of(t: T): List<T> = List.Cons(Pair.init(t, List.Nil<T>({  })))

  method cons(t: T): List<T> = List.Cons(Pair.init(t, this))

  method iter(f: (T) -> unit): unit =
    match (this) {
      | Nil _ -> {  }
      | Cons pair -> {
        val { a as v, b as rest } = pair;
        val _ = f(v);
        rest.iter(f)
      }
    }

  method sort(): List<T> =
    match (this) {
      | Nil _ -> this
      | Cons pair -> match (pair.b) {
        | Nil _ -> this
        | Cons _ -> {
          val { a as l1, b as l2 } = this.split(List.nil<T>(), List.nil<T>());
          l1.sort().merge(l2.sort())
        }
      }
    }

  private method merge(other: List<T>): List<T> =
    match (this) {
      | Nil _ -> other
      | Cons pair1 -> match (other) {
        | Nil _ -> this
        | Cons pair2 -> {
          val { a as h1, b as t1 } = pair1;
          val { a as h2, b as t2 } = pair2;
          if (h1.compare(h2) < 0) then t1.merge(other).cons(h1) else t2.merge(this).cons(h2)
        }
      }
    }

  private method split(y: List<T>, z: List<T>): Pair<List<T>, List<T>> =
    match (this) {
      | Nil _ -> Pair.init(y, z)
      | Cons pair -> {
        val { a as x, b as rest } = pair;
        rest.split(z, y.cons(x))
      }
    }
}

class Main {
  function main(): unit = {
    val list = List.of(BoxedInt.init(4)).cons(BoxedInt.init(2)).cons(BoxedInt.init(1)).cons(
      BoxedInt.init(3)
    );
    list.sort().iter((n) -> Builtins.println(Builtins.intToString(n.i)))
  }
}
"#,
      },
      CompilerTestCase {
        name: "StringGlobalConstant",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function main(): unit = {
    val a1 = "a";
    val a2 = "a";
    if a1 == a2 then
      Builtins.println("OK")
    else {
      Builtins.println("BAD")
    }
  }
}
"#,
      },
      CompilerTestCase {
        name: "TooMuchInterference",
        expected_std: "0\n",
        source_code: r#"
class Main {
  function main(): unit = {
    // without constant propagation, this program will spill a lot!
    val v0 = 0;
    val v1 = 0;
    val v2 = 0;
    val v3 = 0;
    val v4 = 0;
    val v5 = 0;
    val v6 = 0;
    val v7 = 0;
    val v8 = 0;
    val v9 = 0;
    val v10 = 0;
    val v11 = 0;
    val v12 = 0;
    val v13 = 0;
    val v14 = 0;
    val v15 = 0;
    val v16 = 0;
    val v17 = 0;
    val v18 = 0;
    val v19 = 0;
    val v20 = 0;
    val v21 = 0;
    val v22 = 0;
    val v23 = 0;
    val v24 = 0;
    val v25 = 0;
    val v26 = 0;
    val v27 = 0;
    val v28 = 0;
    val v29 = 0;
    val v30 = 0;
    val v31 = 0;
    val v32 = 0;
    val v33 = 0;
    val v34 = 0;
    val v35 = 0;
    val v36 = 0;
    val v37 = 0;
    val v38 = 0;
    val v39 = 0;
    val v40 = 0;
    val v41 = 0;
    val v42 = 0;
    val v43 = 0;
    val v44 = 0;
    val v45 = 0;
    val v46 = 0;
    val v47 = 0;
    val v48 = 0;
    val v49 = 0;
    val result =
    v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 +
    v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 + v19 +
    v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 +
    v30 + v31 + v32 + v33 + v34 + v35 + v36 + v37 + v38 + v39 +
    v40 + v41 + v42 + v43 + v44 + v45 + v46 + v47 + v48 + v49
    ;
    Builtins.println(Builtins.intToString(result))
  }
}
"#,
      },
      CompilerTestCase {
        name: "VariousSyntaxForms",
        expected_std: "84\n",
        source_code: r#"
class Clazz(val t: int) {
    function of(): Clazz = Clazz.init(42)

    method thisTest(): int = {
      val i: int = this.t;
      val { t as j } = this;
      i + j
    }
}

class Option<T>(Some(T), None(bool)) {
  function <T> none(): Option<T> = Option.None(true)
  method toSome(t: T): Option<T> = Option.Some(t)
  method isNone(): bool = match (this) {
    | None _ -> true
    | Some _ -> false
  }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      | None _ -> Option.None(true)
      | Some t -> Option.Some(f(t))
    }
  function test(): unit = {
    val _ = match (Option.None<(string) -> int>(false)) {
      | None _ -> ""
      | Some f -> Builtins.intToString(f(""))
    };
  }
}

class Pair<A, B>(val a: A, val b: B) {}

class List<T>(Nil(bool), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    List.Cons(Pair.init(t, List.Nil<T>(true)))
  method cons(t: T): List<T> =
    List.Cons(Pair.init(t, this))
}

class Main {
  function literalsAndSimpleExpressions(): unit = {
    val _ = 42;
    val _ = -65536;
    val _ = true;
    val _ = false;
    val _ = !true;
    val _ = !false;
    val _ = "aaa";
    val _ = {};
  }

  function variables(a: int, b: string): unit = {
    val c = 3 + a;
    val d = b == b;
    val e = c % c;
  }

  function methodAndFunctionReference(): int =
    Clazz.of().thisTest()

  function panicTest(reason: string): Clazz = Builtins.panic(reason)

  function functionsTest(): unit = {
    val _ = Main.literalsAndSimpleExpressions();
    val _ = Main.variables(3, "hi");
    val _ = Main.methodAndFunctionReference();
    val _ = Main.panicTest("Ah!").thisTest();
    val _ = Main.binaryExpressions();
    val _ = Main.lambdaTest(3);
    Main.functionsTest()
  }

  function binaryExpressions(): unit = {
    val a: int = 1 * 2 + 3 / 4 % 5 - 6;
    val b: bool = a < a && 1 > 3 || 2 <= 4 && 5 >= 6;
    val c: bool = a == 2;
    val d: bool = Main.panicTest("ha") != Clazz.of();
    val e: bool = List.of(3) == List.of(a * 3);
  }

  function lambdaTest(a: int): string = {
    val b = Option.none<int>().toSome(3).map(Main.lambdaTest);
    val c = Option.none<int>().toSome(3).map((x) -> "empty");
    "hello world"
  }

  function main(): unit = {
    val _ = Main.literalsAndSimpleExpressions();
    val _ = Main.variables(3, "sss");
    val v = Main.methodAndFunctionReference(); // 42 + 42 == 84
    Builtins.println(Builtins.intToString(v))
  }
}
"#,
      },
    ]
  }

  #[test]
  fn source_interpreter_tests() {
    for CompilerTestCase { name, expected_std, source_code } in compiler_integration_tests() {
      if name == "SortableList" {
        continue;
      }
      if name == "StringGlobalConstant" {
        continue;
      }
      let mut error_set = ErrorSet::new();
      let parsed_module = parse_source_module_from_text(
        source_code,
        &ModuleReference::ordinary(vec![rcs("Test")]),
        &mut error_set,
      );
      let checked_module = type_check_single_module_source(parsed_module, &mut error_set);
      let actual_std = interpreter::run(&checked_module);
      assert_eq!(expected_std, actual_std);
    }
  }

  #[test]
  fn compiler_tests() {
    let TypeCheckSourceHandlesResult { checked_sources, compile_time_errors, .. } =
      type_check_source_handles(
        compiler_integration_tests()
          .iter()
          .map(|case| (ModuleReference::ordinary(vec![rcs(case.name)]), case.source_code))
          .collect(),
      );
    assert!(compile_time_errors.is_empty());
    let _wasm_module = compiler::compile_mir_to_wasm(&compiler::compile_hir_to_mir(
      compiler::compile_sources_to_hir(&checked_sources),
    ));
  }
}
