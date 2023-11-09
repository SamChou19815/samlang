#[cfg(test)]
mod tests {
  use crate::{
    checker::type_check_sources, compiler, interpreter, optimization,
    parser::parse_source_module_from_text, printer,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, PStr};
  use std::collections::HashMap;
  use wasmi::*;

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
    let a: int = "3".toInt();
    let b: Str = Str.fromInt(3);
    let c: unit = Process.println("3");
    let d: Main = Process.panic("3");
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
    let _ = A.b();
    let _ = C.create();
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
  function main1(): int = Process.panic<int>("Ah") + A.create()
  function main2(): int = A.create() + Process.panic<int>("Ah")
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
  method foo(): int
}
interface Conflicting2 {
  method foo(): bool
}
interface ExtendingConfliting : Conflicting1, Conflicting2
class ImplItself : ImplItself {} // error: expect interface type
class ImplTArg<T> : T {} // error: T not resolved
"#,
      },
      CheckerTestSource {
        test_name: "call-interface-function",
        source_code: r#"
interface Foo { function bar(): int }
class Ouch { function call(foo: Foo): int = Foo.bar() }
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
  function main(): Str = "Hello World!"
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-binary-operations",
        source_code: r#"
class Box<T>(val value: T) {
  function <T> empty(): Box<T> = Box.init(Process.panic<T>("PANIC"))
  function <T> of(value: T): Box<T> = Box.init(value)
}

class AnotherBox<T>(val value: T) {
  function <T> empty(): AnotherBox<T> = AnotherBox.init(Process.panic<T>("PANIC"))
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
    let f = Fields.init(3, true);
    let {a, b} = f;
    let _ = f.a;
    let _ = f.b;
    f
  }
}

class Main {
  function main(): unit = {
    let f = Fields.get();
    let {a, b} = f;
    let _ = f.a;
    let _ = f.b;
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
    let a = 42;
    let a = 42;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "illegal-this",
        source_code: r#"

class Main {
  function main(): unit = {
    let _ = this;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "insufficient-type-info",
        source_code: r#"
class NotEnoughTypeInfo {
  function <T> randomFunction(): T = Process.panic("I can be any type!")
  function main(): unit = {
    let _ = NotEnoughTypeInfo.randomFunction();
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
    let a = Option.none();
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
    let sam = SamObject.create("sam zhou").withDifferentLOC(100001);
    let s = sam.getSam();
    let linesOfCode = if (sam.isGood()) then sam.getLinesOfCode() else 0;
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
class HelloWorld(val message: Str) {
  private method getMessage(): Str = {
    let { message } = this;
    message
  }

  function getGlobalMessage(): Str = {
    let hw = HelloWorld.init("Hello World!");
    hw.getMessage()
  }
}

class Main {
  function main(): Str = HelloWorld.getGlobalMessage()
}
"#,
      },
      CheckerTestSource {
        test_name: "overengineered-helloworld-2",
        source_code: r#"
class NewYear2019<T>(val message: T) {
  function create(): NewYear2019<Str> = NewYear2019.init("Hello World!")
  method getMessage(): T = {
    let { message as msg } = this; msg
  }
}

class Main {
  function main(): Str = NewYear2019.create().getMessage()
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
    let _ = Main.pipe(1, (n) -> Str.fromInt(n), (s) -> s.toInt());
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "polymorphic-option",
        source_code: r#"
class Option<T>(Some(T), None) {
  function <T> none(): Option<T> = Option.None()
  method toSome(t: T): Option<T> = Option.Some(t)
}

class Main {
  function main(): Option<Str> = Option.none<Str>().toSome("hi")
  function main2(): Option<Str> = {
    let a = Option.none<Str>();
    a.toSome("hi")
  }

  function main3(): Option<Str> = {
    let a: Option<Str> = Option.none();
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
    List.Cons(Pair.init(t, this,))
}
class Developer(
  val name: Str, val github: Str,
  val projects: List<Str>,
) {
  function sam(): Developer = {
    let l = List.of("SAMLANG").cons("...");
    let github = "SamChou19815";
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
    let _: ((int) -> bool, int, int) -> int = (a, b, c) -> if a(b + 1) then b else c;
  }
}
"#,
      },
      CheckerTestSource {
        test_name: "synthesis-mode",
        source_code: r#"
class Main {
  function <Acc> reduce(f: (Acc, int) -> Acc, init: Acc): Acc = Process.panic("")
  function getInt(): int = 10

  function <T> id(v: T): T = v

  function main(): unit = {
    let _ = Main.reduce((acc, n) -> acc + n, Main.getInt());
    let _: (int) -> int = Main.id((x) -> x);
    let _: (int) -> int = Main.id(Main.id((x) -> x));
    let _: (int) -> int = Main.id(Main.id(Main.id((x) -> x)));
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
  function main(): Str = helloWorld
}
"#,
      },
    ];

    let expected_errors = r#"
Error ---------------- access-private-member.sam:12:15-12:16

Cannot resolve member `b` on `A`.

  12|     let _ = A.b();
                    ^


Error --------------------- add-panic-to-class.sam:7:54-7:64

`A` [1] is incompatible with `int` [2].

  7|   function main1(): int = Process.panic<int>("Ah") + A.create()
                                                          ^^^^^^^^^^

  [1] add-panic-to-class.sam:7:54-7:64
  ------------------------------------
  7|   function main1(): int = Process.panic<int>("Ah") + A.create()
                                                          ^^^^^^^^^^

  [2] add-panic-to-class.sam:7:27-7:64
  ------------------------------------
  7|   function main1(): int = Process.panic<int>("Ah") + A.create()
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error --------------------- add-panic-to-class.sam:8:27-8:37

`A` [1] is incompatible with `int` [2].

  8|   function main2(): int = A.create() + Process.panic<int>("Ah")
                               ^^^^^^^^^^

  [1] add-panic-to-class.sam:8:27-8:37
  ------------------------------------
  8|   function main2(): int = A.create() + Process.panic<int>("Ah")
                               ^^^^^^^^^^

  [2] add-panic-to-class.sam:8:27-8:64
  ------------------------------------
  8|   function main2(): int = A.create() + Process.panic<int>("Ah")
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------------------- add-with-class.sam:7:30-7:40

`A` [1] is incompatible with `int` [2].

  7|   function main(): int = 3 + A.create()
                                  ^^^^^^^^^^

  [1] add-with-class.sam:7:30-7:40
  --------------------------------
  7|   function main(): int = 3 + A.create()
                                  ^^^^^^^^^^

  [2] add-with-class.sam:7:26-7:40
  --------------------------------
  7|   function main(): int = 3 + A.create()
                              ^^^^^^^^^^^^^^


Error --------------------- bounded-generics.sam:15:52-15:55

`int` is not a subtype of `Comparable<int>`.

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:15:57-15:64

`T` [1] is incompatible with `int` [2].

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                              ^^^^^^^

  [1] bounded-generics.sam:15:57-15:64
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                              ^^^^^^^

  [2] bounded-generics.sam:15:52-15:55
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:15:66-15:73

`T` [1] is incompatible with `int` [2].

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                                       ^^^^^^^

  [1] bounded-generics.sam:15:66-15:73
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                                       ^^^^^^^

  [2] bounded-generics.sam:15:52-15:55
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:18:20-18:40

`Comparable<BoxedInt>` is incompatible with `non-abstract type`.

  18|   function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
                         ^^^^^^^^^^^^^^^^^^^^


Error --------------------- bounded-generics.sam:19:53-19:69

`BoxedInt` [1] is incompatible with `Comparable<BoxedInt>` [2].

  19|   function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
                                                          ^^^^^^^^^^^^^^^^

  [1] bounded-generics.sam:19:53-19:69
  ------------------------------------
  19|   function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
                                                          ^^^^^^^^^^^^^^^^

  [2] bounded-generics.sam:18:20-18:40
  ------------------------------------
  18|   function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
                         ^^^^^^^^^^^^^^^^^^^^


Error ---------------------- bounded-generics.sam:28:7-28:17

Type `ImplItself` has a cyclic definition.

  28| class ImplItself : ImplItself {} // error: expect interface type
            ^^^^^^^^^^


Error --------------------- bounded-generics.sam:28:20-28:30

`class type` is incompatible with `interface type`.

  28| class ImplItself : ImplItself {} // error: expect interface type
                         ^^^^^^^^^^


Error --------------------- bounded-generics.sam:29:21-29:22

Cannot resolve name `T`.

  29| class ImplTArg<T> : T {} // error: T not resolved
                          ^


Error ---------------- call-interface-function.sam:2:17-2:36

Function declarations are not allowed in interfaces.

  2| interface Foo { function bar(): int }
                     ^^^^^^^^^^^^^^^^^^^


Error ---------------- call-interface-function.sam:3:33-3:36

`Foo` is incompatible with `non-abstract type`.

  3| class Ouch { function call(foo: Foo): int = Foo.bar() }
                                     ^^^


Error ---------------- call-interface-function.sam:3:45-3:48

Cannot resolve class `Foo`.

  3| class Ouch { function call(foo: Foo): int = Foo.bar() }
                                                 ^^^


Error --------------------------- complete-trash.sam:1:1-1:5

Unexpected token among the classes and interfaces: This

  1| This is a bad source.
     ^^^^


Error --------------------------- complete-trash.sam:1:6-1:8

Unexpected token among the classes and interfaces: is

  1| This is a bad source.
          ^^


Error -------------------------- complete-trash.sam:1:9-1:10

Unexpected token among the classes and interfaces: a

  1| This is a bad source.
             ^


Error ------------------------- complete-trash.sam:1:11-1:14

Unexpected token among the classes and interfaces: bad

  1| This is a bad source.
               ^^^


Error ------------------------- complete-trash.sam:1:15-1:21

Unexpected token among the classes and interfaces: source

  1| This is a bad source.
                   ^^^^^^


Error ------------------------- complete-trash.sam:1:21-1:22

Unexpected token among the classes and interfaces: .

  1| This is a bad source.
                         ^


Error ------------ illegal-binary-operations.sam:12:33-12:49

`Box<int>` [1] is incompatible with `int` [2].

  12|   function test01(): int = 42 + Box.empty<int>() // error
                                      ^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:12:33-12:49
  ---------------------------------------------
  12|   function test01(): int = 42 + Box.empty<int>() // error
                                      ^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:12:28-12:49
  ---------------------------------------------
  12|   function test01(): int = 42 + Box.empty<int>() // error
                                 ^^^^^^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:13:28-13:44

`Box<int>` [1] is incompatible with `int` [2].

  13|   function test02(): int = Box.empty<int>() + 42 // error
                                 ^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:13:28-13:44
  ---------------------------------------------
  13|   function test02(): int = Box.empty<int>() + 42 // error
                                 ^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:13:28-13:49
  ---------------------------------------------
  13|   function test02(): int = Box.empty<int>() + 42 // error
                                 ^^^^^^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:14:35-14:51

`Box<int>` [1] is incompatible with `int` [2].

  14|   function test03(): bool = 42 == Box.empty<int>() // error
                                        ^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:14:35-14:51
  ---------------------------------------------
  14|   function test03(): bool = 42 == Box.empty<int>() // error
                                        ^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:14:29-14:31
  ---------------------------------------------
  14|   function test03(): bool = 42 == Box.empty<int>() // error
                                  ^^


Error ------------ illegal-binary-operations.sam:15:49-15:51

`int` [1] is incompatible with `Box<int>` [2].

  15|   function test04(): bool = Box.empty<int>() == 42 // error
                                                      ^^

  [1] illegal-binary-operations.sam:15:49-15:51
  ---------------------------------------------
  15|   function test04(): bool = Box.empty<int>() == 42 // error
                                                      ^^

  [2] illegal-binary-operations.sam:15:29-15:45
  ---------------------------------------------
  15|   function test04(): bool = Box.empty<int>() == 42 // error
                                  ^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:16:29-16:45

`Box<int>` [1] is incompatible with `bool` [2].

  16|   function test05(): bool = Box.empty<int>() || false // error
                                  ^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:16:29-16:45
  ---------------------------------------------
  16|   function test05(): bool = Box.empty<int>() || false // error
                                  ^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:16:29-16:54
  ---------------------------------------------
  16|   function test05(): bool = Box.empty<int>() || false // error
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:17:38-17:54

`Box<int>` [1] is incompatible with `bool` [2].

  17|   function test06(): bool = false || Box.empty<int>() // error
                                           ^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:17:38-17:54
  ---------------------------------------------
  17|   function test06(): bool = false || Box.empty<int>() // error
                                           ^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:17:29-17:54
  ---------------------------------------------
  17|   function test06(): bool = false || Box.empty<int>() // error
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:18:33-18:38

`bool` [1] is incompatible with `int` [2].

  18|   function test07(): int = 42 * false // error
                                      ^^^^^

  [1] illegal-binary-operations.sam:18:33-18:38
  ---------------------------------------------
  18|   function test07(): int = 42 * false // error
                                      ^^^^^

  [2] illegal-binary-operations.sam:18:28-18:38
  ---------------------------------------------
  18|   function test07(): int = 42 * false // error
                                 ^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:19:28-19:33

`bool` [1] is incompatible with `int` [2].

  19|   function test08(): int = false + false // error
                                 ^^^^^

  [1] illegal-binary-operations.sam:19:28-19:33
  ---------------------------------------------
  19|   function test08(): int = false + false // error
                                 ^^^^^

  [2] illegal-binary-operations.sam:19:28-19:41
  ---------------------------------------------
  19|   function test08(): int = false + false // error
                                 ^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:19:36-19:41

`bool` [1] is incompatible with `int` [2].

  19|   function test08(): int = false + false // error
                                         ^^^^^

  [1] illegal-binary-operations.sam:19:36-19:41
  ---------------------------------------------
  19|   function test08(): int = false + false // error
                                         ^^^^^

  [2] illegal-binary-operations.sam:19:28-19:41
  ---------------------------------------------
  19|   function test08(): int = false + false // error
                                 ^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:21:45-21:55

`Box<int>` is incompatible with `Box<bool>`.
- `int` [1] is incompatible with `bool` [2].

  21|   function test10(): bool = Box.of(true) == Box.of(42) // error
                                                  ^^^^^^^^^^

  [1] illegal-binary-operations.sam:21:52-21:54
  ---------------------------------------------
  21|   function test10(): bool = Box.of(true) == Box.of(42) // error
                                                         ^^

  [2] illegal-binary-operations.sam:21:36-21:40
  ---------------------------------------------
  21|   function test10(): bool = Box.of(true) == Box.of(42) // error
                                         ^^^^


Error ------------ illegal-binary-operations.sam:24:49-24:72

`AnotherBox<int>` [1] is incompatible with `Box<int>` [2].

  24|   function test13(): bool = Box.empty<int>() == AnotherBox.empty<int>() // error
                                                      ^^^^^^^^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:24:49-24:72
  ---------------------------------------------
  24|   function test13(): bool = Box.empty<int>() == AnotherBox.empty<int>() // error
                                                      ^^^^^^^^^^^^^^^^^^^^^^^

  [2] illegal-binary-operations.sam:24:29-24:45
  ---------------------------------------------
  24|   function test13(): bool = Box.empty<int>() == AnotherBox.empty<int>() // error
                                  ^^^^^^^^^^^^^^^^


Error ------------ illegal-binary-operations.sam:27:35-27:64

`Box<Box<Box<bool>>>` is incompatible with `Box<Box<Box<int>>>`.
- `Box<Box<bool>>` is incompatible with `Box<Box<int>>`.
  - `Box<bool>` is incompatible with `Box<int>`.
    - `bool` [1] is incompatible with `int` [2].

  27|     Box.of(Box.of(Box.of(42))) == Box.of(Box.of(Box.of(false)))
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] illegal-binary-operations.sam:27:56-27:61
  ---------------------------------------------
  27|     Box.of(Box.of(Box.of(42))) == Box.of(Box.of(Box.of(false)))
                                                             ^^^^^

  [2] illegal-binary-operations.sam:27:26-27:28
  ---------------------------------------------
  27|     Box.of(Box.of(Box.of(42))) == Box.of(Box.of(Box.of(false)))
                               ^^


Error --------- illegal-private-field-access.sam:15:13-15:14

Cannot resolve member `b` on `Fields`.

  15|     let {a, b} = f;
                  ^


Error --------- illegal-private-field-access.sam:17:15-17:16

Cannot resolve member `b` on `Fields`.

  17|     let _ = f.b;
                    ^


Error --------------------------- illegal-shadow.sam:3:7-3:8

Name `A` collides with a previously defined name at [1].

  3| class A {}
           ^

  [1] illegal-shadow.sam:2:7-2:8
  ------------------------------
  2| class A {}
           ^


Error ------------------------- illegal-shadow.sam:7:12-7:16

Name `test` collides with a previously defined name at [1].

  7|   function test(): unit = ConflictingFunctions.test()
                ^^^^

  [1] illegal-shadow.sam:6:12-6:16
  --------------------------------
  6|   function test(): unit = ConflictingFunctions.test()
                ^^^^


Error ----------------------- illegal-shadow.sam:12:12-12:16

Name `test` collides with a previously defined name at [1].

  12|   function test(): unit = ConflictingMethodsAndFunctions.test()
                 ^^^^

  [1] illegal-shadow.sam:11:10-11:14
  ----------------------------------
  11|   method test(): int = 42
               ^^^^


Error ----------------------- illegal-shadow.sam:16:28-16:32

Name `test` collides with a previously defined name at [1].

  16|   function test(test: int, test: int): unit = {}
                                 ^^^^

  [1] illegal-shadow.sam:16:17-16:21
  ----------------------------------
  16|   function test(test: int, test: int): unit = {}
                      ^^^^


Error ------------------------ illegal-shadow.sam:22:9-22:10

Name `a` collides with a previously defined name at [1].

  22|     let a = 42;
              ^

  [1] illegal-shadow.sam:21:9-21:10
  ---------------------------------
  21|     let a = 42;
              ^


Error --------------------------- illegal-this.sam:5:13-5:17

Cannot resolve name `this`.

  5|     let _ = this;
                 ^^^^


Error ----------------- insufficient-type-info.sam:5:13-5:47

There is not enough context information to decide the type of this expression.

  5|     let _ = NotEnoughTypeInfo.randomFunction();
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------ insufficient-type-info-none.sam:8:13-8:26

There is not enough context information to decide the type of this expression.

  8|     let a = Option.none();
                 ^^^^^^^^^^^^^


Error ---- invalid-property-declaration-syntax.sam:2:12-2:13

Expected: val, actual: a.

  2| class Main(a: int, val b: int) {
                ^


Error ------------------- multiple-type-errors.sam:3:35-3:40

`Str` [1] is incompatible with `int` [2].

  3|   function main(): int = 233333 + "foo" + "bar" + 42
                                       ^^^^^

  [1] multiple-type-errors.sam:3:35-3:40
  --------------------------------------
  3|   function main(): int = 233333 + "foo" + "bar" + 42
                                       ^^^^^

  [2] multiple-type-errors.sam:3:26-3:40
  --------------------------------------
  3|   function main(): int = 233333 + "foo" + "bar" + 42
                              ^^^^^^^^^^^^^^


Error ------------------- multiple-type-errors.sam:3:43-3:48

`Str` [1] is incompatible with `int` [2].

  3|   function main(): int = 233333 + "foo" + "bar" + 42
                                               ^^^^^

  [1] multiple-type-errors.sam:3:43-3:48
  --------------------------------------
  3|   function main(): int = 233333 + "foo" + "bar" + 42
                                               ^^^^^

  [2] multiple-type-errors.sam:3:26-3:48
  --------------------------------------
  3|   function main(): int = 233333 + "foo" + "bar" + 42
                              ^^^^^^^^^^^^^^^^^^^^^^


Error --------------------------- overflow-int.sam:3:26-3:56

Not a 32-bit integer.

  3|   function main(): int = 999999999999999999999999999999
                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------------------ simple-mismatch.sam:4:30-4:34

`bool` [1] is incompatible with `int` [2].

  4|       function main(): int = true
                                  ^^^^

  [1] simple-mismatch.sam:4:30-4:34
  ---------------------------------
  4|       function main(): int = true
                                  ^^^^

  [2] simple-mismatch.sam:4:24-4:27
  ---------------------------------
  4|       function main(): int = true
                            ^^^


Error ------------------------- undefined-type.sam:3:20-3:30

Cannot resolve name `HelloWorld`.

  3|   function main(): HelloWorld = 1
                        ^^^^^^^^^^


Error ------------------------- undefined-type.sam:3:33-3:34

`int` [1] is incompatible with `HelloWorld` [2].

  3|   function main(): HelloWorld = 1
                                     ^

  [1] undefined-type.sam:3:33-3:34
  --------------------------------
  3|   function main(): HelloWorld = 1
                                     ^

  [2] undefined-type.sam:3:20-3:30
  --------------------------------
  3|   function main(): HelloWorld = 1
                        ^^^^^^^^^^


Error --------------------- undefined-variable.sam:3:26-3:36

Cannot resolve name `helloWorld`.

  3|   function main(): Str = helloWorld
                              ^^^^^^^^^^


Found 51 errors.
"#;

    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mut string_sources = HashMap::new();
    let mut parsed_sources = HashMap::new();
    for t in sources {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![t.test_name.to_string()]);
      string_sources.insert(mod_ref, t.source_code.to_string());
      parsed_sources.insert(
        mod_ref,
        parse_source_module_from_text(t.source_code, mod_ref, heap, &mut error_set),
      );
    }
    for (mod_ref, parsed) in crate::builtin_parsed_std_sources(heap) {
      parsed_sources.insert(mod_ref, parsed);
    }
    type_check_sources(&parsed_sources, &mut error_set);
    assert_eq!(
      expected_errors.trim(),
      error_set.pretty_print_error_messages(heap, &string_sources).trim()
    );
  }

  fn compiler_integration_tests() -> Vec<CompilerTestCase<'static>> {
    vec![
      CompilerTestCase {
        name: "AndOrInsideIf",
        expected_std: "one\n",
        source_code: r#"
class Main {
  function main(): unit = {
    let i = 1;
    let j = 2;
    if (i < j && i > 0 && j > 0) then {
      let a = 3;
      let b = 4;
      if (a > b || a + b > 0 && true) then Process.println("one") else Process.println("two")
    } else {
      let a = 3;
      let b = 4;
      if (a == 2 || b == 4) then {
        Process.println("three")
      } else {
        Process.println("four")
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
      let _ = Main.main2();
      let _ = Main.main3();
      let _ = 3;
      {}
    } else {
      {}
    }

  function main2(): int =
    if (true) then {
      let _ = 3;
      3
    } else {
      2
    }

  function main3(): unit =
    if (true) then {
      let _ = 3;
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
    let value = Str.fromInt("42".toInt())::"!";
    let _ = Process.println(value);
  }
}
"#,
      },
      CompilerTestCase {
        name: "CFTest1",
        expected_std: "1205\n",
        source_code: r#"
class Main {
  function main(): unit = Process.println(Str.fromInt(
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
    let increase = (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                   (1+2*3-4/5%10000000/12334) + (1+2*3-4/5%10000000/12334) +
                   (1+2*3-4/5%10000000/12334);
    Process.println(Str.fromInt(2 + increase))
  }
}
"#,
      },
      CompilerTestCase {
        name: "CFTest3",
        expected_std: "7\n",
        source_code: r#"
class Main {
  function main(): unit = Process.println(Str.fromInt(1 + 2 * 3 - 4 / 5 % 10000000 / 1234))
}
"#,
      },
      CompilerTestCase {
        name: "ConcatString",
        expected_std: "Hello World!\n",
        source_code: r#"
class Main {
  function main(): unit = Process.println("Hello "::"World!")
}
"#,
      },
      CompilerTestCase {
        name: "CorrectOp",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function crash(a: Str, b: Str): unit = {
    let _ = Process.println("different:");
    let _ = Process.println("a:");
    let _ = Process.println(a);
    let _ = Process.println("b:");
    let _ = Process.println(b);
    let _ = Process.panic<unit>("crash!");
  }

  function checkInt(a: int, b: int): unit =
    if (a == b) then {} else Main.crash(Str.fromInt(a), Str.fromInt(b))

  function boolToString(b: bool): Str =
    if (b) then "true" else "false"

  function checkBool(a: bool, b: bool): unit =
    if (a == b) then {} else Main.crash(Main.boolToString(a), Main.boolToString(b))

  function checkAll(): unit = {
    let _ = Main.checkInt(42, 21 * 2);
    let _ = Main.checkInt(42, 84 / 2);
    let _ = Main.checkInt(42, 91 % 49);
    let _ = Main.checkInt(42, 20 + 22);
    let _ = Main.checkInt(42, 50 - 8);

    let _ = Main.checkBool(false, false);
    let _ = Main.checkBool(true, true);

    let _ = Main.checkBool(false, false && false);
    let _ = Main.checkBool(false, true && false);
    let _ = Main.checkBool(false, false && true);
    let _ = Main.checkBool(true, true && true);
    let _ = Main.checkBool(false, false || false);
    let _ = Main.checkBool(true, true || false);
    let _ = Main.checkBool(true, false || true);
    let _ = Main.checkBool(true, true || true);

    let _ = Main.checkBool(true, 42 < 50);
    let _ = Main.checkBool(false, 42 > 42);
    let _ = Main.checkBool(false, 42 > 50);
    let _ = Main.checkBool(true, 42 <= 42);
    let _ = Main.checkBool(true, 42 <= 43);
    let _ = Main.checkBool(false, 42 <= 41);
    let _ = Main.checkBool(true, 50 > 42);
    let _ = Main.checkBool(false, 42 < 42);
    let _ = Main.checkBool(false, 50 < 42);
    let _ = Main.checkBool(true, 42 >= 42);
    let _ = Main.checkBool(true, 43 >= 42);
    let _ = Main.checkBool(false, 41 >= 42);

    let _ = Main.checkBool(true, 1 == 1);
    let _ = Main.checkBool(false, 1 == 2);
    let _ = Main.checkBool(false, 1 != 1);
    let _ = Main.checkBool(true, 1 != 2);
    let _ = Main.checkBool(true, true == true);
    let _ = Main.checkBool(false, true == false);
    let _ = Main.checkBool(false, true != true);
    let _ = Main.checkBool(true, true != false);

    let c = 21;
    let _ = Main.checkInt(-42, -(c * 2)); // prevent constant folding!
    let _ = Main.checkBool(true, !false);
    let _ = Main.checkBool(false, !true);
  }

  function main(): unit = {
    let _ = Main.checkAll();
    Process.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "CreateVariants",
        expected_std: "hello\n",
        source_code: r#"
import {Pair} from std.tuples;

class List(Nil(unit), Cons(Pair<int, List>)) {
  function of(i: int): List = List.Cons((
    i,
    List.Nil({  })
  ))
}

class Main { function main(): unit = { let _: List = List.of(1); Process.println("hello") }  }
"#,
      },
      CompilerTestCase {
        name: "CSETest1",
        expected_std: "30\n12\n15\n",
        source_code: r#"
class Main {
  function printInt(i: int): unit = Process.println(Str.fromInt(i))

  function test(a: int, b: int): unit = {
    let _ = Main.printInt((a * b + a) + (a * b + a));
    let _ = Main.printInt(a * b);
    let _ = Main.printInt(a * b + a);
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
  function printInt(i: int): unit = Process.println(Str.fromInt(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      Process.panic("actual: "::Str.fromInt(actual)::", expected "::Str.fromInt(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    let t = if (first) then a * b else a * b;
    let _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    let _ = Main.test(true, 3, 4, 12);
    let _ = Main.test(false, 3, 4, 12);
    Process.println("OK")
  }
}
"#,
      },
      CompilerTestCase {
        name: "CSETest3",
        expected_std: "232\n",
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
    if (i >= 50) then
      acc
    else
      Main.test(acc + Main.log(i, 2), i + 1)

  function main(): unit = Process.println(Str.fromInt(Main.test(0, 0)))
}
"#,
      },
      CompilerTestCase {
        name: "CSETest4",
        expected_std: "141\n",
        source_code: r#"
class Main {
  function main(): unit = {
    let megagrams: int = 141332443;
    let kilograms: int = megagrams / 1000;
    let grams: int = (megagrams / 1000) / 1000;
    Process.println(Str.fromInt(grams))
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
      let iMod64 = i % 64;
      let iMod32 = (i % 64) % 32;
      let iMod16 = ((i % 64) % 32) % 16;
      let iMod8 = (((i % 64) % 32) % 16) % 8;
      let iMod4 = ((((i % 64) % 32) % 16) % 8) % 4;
      let iMod2 = (((((i % 64) % 32) % 16) % 8) % 4) % 2;
      Main.test(totalOddNumbers + iMod2, i + 1)
    }
  }

  function main(): unit = Process.println(Str.fromInt(Main.test(0, 0)))
}
"#,
      },
      CompilerTestCase {
        name: "CSETest6",
        expected_std: "OK\n",
        source_code: r#"
class Main {
  function printInt(i: int): unit = Process.println(Str.fromInt(i))

  function check(actual: int, expected: int): unit =
    if (actual != expected) then
      Process.panic("actual: "::Str.fromInt(actual)::", expected "::Str.fromInt(expected))
    else {}

  function test(first: bool, a: int, b: int, aTimesB: int): unit = {
    let _ = if (first) then {
      let _ = a * b;
    } else {};
    let _ = Main.check(a * b, aTimesB);
  }

  function main(): unit = {
    let _ = Main.test(true, 3, 4, 12);
    let _ = Main.test(false, 3, 4, 12);
    Process.println("OK")
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
  function cosine(angleInDegree: int): int = Process.panic("Not supported!")
}

class Student(val name: Str, val age: int) {
  method getName(): Str = this.name
  method getAge(): int = this.age
  function dummyStudent(): Student = Student.init("RANDOM_BABY", 0)
}

class PrimitiveType(
  U(bool),
  I(int),
  S(Str),
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
      U(_) -> false,
      I(i) -> i != 0,
      S(s) -> s != "",
      B(b) -> b,
    }
}

class FunctionExample {
  function <T> getIdentityFunction(): (T) -> T = (x) -> x
}

class Box<T>(val content: T) {
  function <T> create(content: T): Box<T> = Box.init(content)
  method getContent(): T = {
    let { content } = this; content
  }
}

class Option<T>(None, Some(T)) {
  function <T> getNone(): Option<T> = Option.None()
  function <T> getSome(d: T): Option<T> = Option.Some(d)
  method forceValue(): T =
    match (this) {
      None -> Process.panic("Ah"),
      Some(v) -> v,
    }
  function deepForceValue(opt: Option<Option<Option<Box<int>>>>): int =
    if let Some(Some(Some({content}))) = opt then {
      content
    } else {
      Process.panic("cannot force")
    }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      None -> Option.None(),
      Some(d) -> Option.Some(f(d)),
    }
}

class Main {

  private function assertTrue(condition: bool, message: Str): unit =
    if (condition) then {} else Process.panic(message)

  private function assertFalse(condition: bool, message: Str): unit =
    if (!condition) then {} else Process.panic(message)

  private function assertEquals(e1: int, e2: int, message: Str): unit =
    if (e1 == e2) then {} else Process.panic(Str.fromInt(e1)::" "::Str.fromInt(e2)::" "::message)

  private function consistencyTest(): unit = {
    let _ = Main.assertEquals(Option.getSome(3).map((i) -> i + 1).forceValue(), 4, "Ah1");
    let _ = Main.assertEquals(
      Option.deepForceValue(Option.getSome(Option.getSome(Option.getSome(Box.create(42))))),
      42,
      "Ah2",
    );
    let _ = Main.assertEquals(Box.create(42).getContent(), 42, "Ah3");
    let _ = Main.assertEquals(FunctionExample.getIdentityFunction<int>()(42), 42, "Ah4");
    let _ = Main.assertEquals(Student.dummyStudent().getAge(), 0, "Ah5");
    let _ = Main.assertEquals(Math.plus(2, 2), 4, "Ah6");
    let _ = Main.assertFalse(PrimitiveType.getUnit().isTruthy(), "Ah7");
    let _ = Main.assertTrue(PrimitiveType.getInteger().isTruthy(), "Ah8");
    let _ = Main.assertTrue(PrimitiveType.getString().isTruthy(), "Ah9");
    let _ = Main.assertFalse(PrimitiveType.getBool().isTruthy(), "Ah10");
  }

  function main(): unit = {
    let _ = Main.consistencyTest();
    Process.println("OK")
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

class Option<T>(None, Some(T)) {
  function matchExample(opt: Option<int>): int =
    match (opt) {
      None -> 42,
      Some(a) -> a,
    }
}

class FooOrFoo(F1(Foo), F2(Foo)) {
  function f1(): FooOrFoo = FooOrFoo.F1(Foo.init(1))
  function f2(): FooOrFoo = FooOrFoo.F2(Foo.init(2))

  function intValue(): int = FooOrFoo.f1().getInt() + FooOrFoo.f2().getInt()

  method getInt(): int =
    match (this) {
      F1(foo) -> foo.a,
      F2(foo) -> foo.a,
    }
}

class Obj(private val d: int, val e: int) {
  function valExample(): int = {
    let a: int = 1;
    let b = 2;
    let c = 3;
    let { d as _, e as d } = Obj.init(5, 4); // d = 4
    let _ = 42;
    // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
    a + b * c / d
  }
}

class Main {
  function identity(a: int): int = a

  function random(): int = {
    let a = 42; // very random
    a
  }

  function oof(): int = 14

  function div(a: int, b: int): int =
    if b == 0 then (
      Process.panic("Division by zero is illegal!")
    ) else (
      a / b
    )

  function nestedVal(): int = {
    let veryOpt = Option.Some(Option.Some(Option.Some(Foo.init(1))));
    let opt = match veryOpt {
      None -> 0,
      Some(v1) -> match v1 {
        None -> 1,
        Some(v2) -> match v2 {
          None -> 2,
          Some(v3) -> 3, // <- get this
        }
      },
    };
    let _ = Option.Some(FooOrFoo.f1());
    let a = {
      let b = 1 + opt;
      let c = {
        let c = b;
        b
      }; // c = 4
      c
    }; // 4
    a + 1 // 5
  }

  function main(): unit = Process.println(Str.fromInt(Main.identity(
    Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
    + FooOrFoo.intValue() - FooOrFoo.intValue()
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
    let _ = Process.println(Str.fromInt(order));
    2
  }

  // return a random bool, print order
  function boolIdentity(item: bool, order: int): bool = {
    let _ = Process.println(Str.fromInt(order));
    item
  }

  // return the string back, print str
  function stringIdentity(str: Str): Str = {
    let _ = Process.println("surprise!");
    str
  }

  function binaryExpressionTest(): unit = {
    let _ = Main.intIdentity(0) + Main.intIdentity(1);
    let _ = Main.intIdentity(2) - Main.intIdentity(3);
    let _ = Main.intIdentity(4) * Main.intIdentity(5);
    let _ = Main.intIdentity(6) / Main.intIdentity(7);
    let _ = Main.intIdentity(8) % Main.intIdentity(9);
    let _ = Main.intIdentity(10) < Main.intIdentity(11);
    let _ = Main.intIdentity(12) <= Main.intIdentity(13);
    let _ = Main.intIdentity(14) > Main.intIdentity(15);
    let _ = Main.intIdentity(16) >= Main.intIdentity(17);
    let _ = Main.intIdentity(18) == Main.intIdentity(19);
    let _ = Main.intIdentity(20) != Main.intIdentity(21);
    let _ = Main.boolIdentity(false, 22) || Main.boolIdentity(false, 23);
    let _ = Main.boolIdentity(true, 24) && Main.boolIdentity(true, 25);
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
    let _ = Process.println("hi");
    5
  }

  function main(): unit = {
    let _ = Main.hi();
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
    let f = (v2: int) -> (
      if (v2 + 1 == 3) then
        GenericObject.init(3, v2)
      else
        GenericObject.init(3, 42)
    );
    let _ = Process.println(Str.fromInt(f(2).v2)); // print 2
    let _ = Process.println(Str.fromInt(f(3).v2)); // print 42
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
    let a = if (true) then
      (if (false) then 10000 else 3)
    else
      4
    ;
    let b = if (false) then 4 else if (true) then 3 else 20000;
    let _ = Process.println(Str.fromInt(a));
    let _ = Process.println(Str.fromInt(b));
    if (a != b) then Process.panic("Not OK") else Process.println("OK")
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
    let i = 2;
    let j = 3;
    if (i > j) then
      Process.println("shouldn't reach here")
    else if (j < i) then
      Process.println("shouldn't reach here")
    else if (i < 0) then
      Process.println("shouldn't reach here")
    else
      Process.println("success")
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
    let i = 3;
    let j = 2;
    if (i > j) then
      Process.println("success")
    else if (j < i) then
      Process.println("shouldn't reach here")
    else if (i < 0) then
      Process.println("shouldn't reach here")
    else
      Process.println("shouldn't reach here")
  }
}
"#,
      },
      CompilerTestCase {
        name: "LambdaCall",
        expected_std: "",
        source_code: r#"
class Option<T>(Some(T), None(bool)) {
  method <R> map(f: (T) -> R): Option<R> =
    match (this) { None(_) -> Option.None(true), Some(t) -> Option.Some(f(t)) }
}

class Main {
  function main(): unit = {
    let c = Option.Some(3).map((x: int) -> "empty");
  }
}
"#,
      },
      CompilerTestCase {
        name: "LoopOptimization",
        expected_std: "100\n106\n112\n118\n124\n",
        source_code: r#"
class Main {
  function printInt(n: int): unit = Process.println(Str.fromInt(n))

  function loopy(i: int): int =
    if (i >= 10) then 0 else {
      let j: int = i * 3 + 100;
      let _: unit = Main.printInt(j);
      Main.loopy(i + 2)
    }

  function main(): unit = {
    let _: int = Main.loopy(0);
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
    let _ = match (this) {
      None(_) -> Option.None<R>({}),
      Some(d) -> Option.Some(f(d)),
    };
  }

  function main(): unit = {
    let none = Option.None<int>({});
    let noneMapped = none.mapButIgnore((it) -> it);
    let _ = Option.Some(noneMapped).mapButIgnore((it) -> it);
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
    let _ = Process.println(Str.fromInt(Main.factorial(4)));
    let _ = Process.println(Str.fromInt(Main.fib(10)));
    let _ = Main.uselessRecursion(3);
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
    if (!(Main.isEven(3)) && Main.isOdd(3)) then Process.println("OK") else Process.println("BAD")
}
"#,
      },
      CompilerTestCase {
        name: "OptionalSemicolon",
        expected_std: "-7\n",
        source_code: r#"
class Main(val a: int, val b: bool) {
  function main(): unit = {
    let _ = 3;
    let a = 2;
    let c = a - 3;
    let d = c * 7;
    let b = true;
    let e = c;
    let _ = Main.init(e, b);
    let finalValue = a + c + d + (if (b) then 0 else Process.panic("")) + e; // 2 + (-1) + (-7) + (-1) = -7;
    Process.println(Str.fromInt(finalValue))
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
    let _ = Process.println(Str.fromInt(i));
    b
  }

  function printlnBool(b: bool): unit = if (b) then Process.println("true") else Process.println("false")

  function testAndShortCircuitInExpression(): unit = {
    let b1 = Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1); // [0] [1]
    let _ = Main.printlnBool(b1); // false
    let b2 = Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1); // [0] [1]
    let _ = Main.printlnBool(b2); // true
    let b3 = Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1); // [0]
    let _ = Main.printlnBool(b3); // false
    let b4 = Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1); // [0]
    let _ = Main.printlnBool(b4); // false
  }

  function testOrShortCircuitInExpression(): unit = {
    let b1 = Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1); // [0]
    let _ = Main.printlnBool(b1); // true
    let b2 = Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1); // [0]
    let _ = Main.printlnBool(b2); // true
    let b3 = Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1); // [0] [1]
    let _ = Main.printlnBool(b3); // false
    let b4 = Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1); // [0] [1]
    let _ = Main.printlnBool(b4); // true
  }

  function testAndShortCircuitInIf(): unit = {
    // [0] [1]
    let _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(false, 1)) then Process.panic<unit>("Ah") else {};
    // [0] [1]
    let _ = if (Main.printAndReturn(true, 0) && Main.printAndReturn(true, 1)) then {} else Process.panic("Ah");
    // [0]
    let _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(false, 1)) then Process.panic<unit>("Ah") else {};
    // [0]
    let _ = if (Main.printAndReturn(false, 0) && Main.printAndReturn(true, 1)) then Process.panic<unit>("Ah") else {};
  }

  function testOrShortCircuitInIf(): unit = {
    // [0]
    let _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(false, 1)) then {} else Process.panic("Ah");
    // [0]
    let _ = if (Main.printAndReturn(true, 0) || Main.printAndReturn(true, 1)) then {} else Process.panic("Ah");
    // [0] [1]
    let _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(false, 1)) then Process.panic<unit>("Ah") else {};
    // [0] [1]
    let _ = if (Main.printAndReturn(false, 0) || Main.printAndReturn(true, 1)) then {} else Process.panic("Ah");
  }

  function main(): unit = {
    let _ = Main.testAndShortCircuitInExpression();
    let _ = Main.testOrShortCircuitInExpression();
    let _ = Main.testAndShortCircuitInIf();
    let _ = Main.testOrShortCircuitInIf();
  }
}
"#,
      },
      CompilerTestCase {
        name: "SortableList",
        expected_std: "1\n2\n3\n4\n",
        source_code: r#"
import {Pair} from std.tuples;

interface Comparable<T> {
  method compare(other: T): int
}

class BoxedInt(val i: int): Comparable<BoxedInt> {
  method compare(other: BoxedInt): int = this.i - other.i
}

class List<T: Comparable<T>>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T: Comparable<T>> nil(): List<T> = List.Nil<T>({  })

  function <T: Comparable<T>> of(t: T): List<T> = List.Cons((t, List.Nil<T>({  })))

  method cons(t: T): List<T> = List.Cons((t, this))

  method iter(f: (T) -> unit): unit =
    match (this) {
      Nil(_) -> {  }
      Cons(pair) -> {
        let (v, rest) = pair;
        let _ = f(v);
        rest.iter(f)
      }
    }

  method sort(): List<T> =
    match (this) {
      Nil(_) -> this,
      Cons(pair) -> match (pair.e1) {
        Nil(_) -> this,
        Cons(_) -> {
          let (l1, l2) = this.split(List.nil<T>(), List.nil<T>());
          l1.sort().merge(l2.sort())
        }
      }
    }

  private method merge(other: List<T>): List<T> =
    match (this) {
      Nil(_) -> other,
      Cons(pair1) -> match (other) {
        Nil(_) -> this,
        Cons(pair2) -> {
          let (h1, t1) = pair1;
          let (h2, t2) = pair2;
          if (h1.compare(h2) < 0) then t1.merge(other).cons(h1) else t2.merge(this).cons(h2)
        }
      }
    }

  private method split(y: List<T>, z: List<T>): Pair<List<T>, List<T>> =
    match (this) {
      Nil(_) -> Pair.init(y, z),
      Cons(pair) -> {
        let (x, rest) = pair;
        rest.split(z, y.cons(x))
      }
    }
}

class Main {
  function main(): unit = {
    let list = List.of(BoxedInt.init(4)).cons(BoxedInt.init(2)).cons(BoxedInt.init(1)).cons(
      BoxedInt.init(3)
    );
    list.sort().iter((n) -> Process.println(Str.fromInt(n.i)))
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
    let a1 = "a";
    let a2 = "a";
    if a1 == a2 then
      Process.println("OK")
    else {
      Process.println("BAD")
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
    let v0 = 0;
    let v1 = 0;
    let v2 = 0;
    let v3 = 0;
    let v4 = 0;
    let v5 = 0;
    let v6 = 0;
    let v7 = 0;
    let v8 = 0;
    let v9 = 0;
    let v10 = 0;
    let v11 = 0;
    let v12 = 0;
    let v13 = 0;
    let v14 = 0;
    let v15 = 0;
    let v16 = 0;
    let v17 = 0;
    let v18 = 0;
    let v19 = 0;
    let v20 = 0;
    let v21 = 0;
    let v22 = 0;
    let v23 = 0;
    let v24 = 0;
    let v25 = 0;
    let v26 = 0;
    let v27 = 0;
    let v28 = 0;
    let v29 = 0;
    let v30 = 0;
    let v31 = 0;
    let v32 = 0;
    let v33 = 0;
    let v34 = 0;
    let v35 = 0;
    let v36 = 0;
    let v37 = 0;
    let v38 = 0;
    let v39 = 0;
    let v40 = 0;
    let v41 = 0;
    let v42 = 0;
    let v43 = 0;
    let v44 = 0;
    let v45 = 0;
    let v46 = 0;
    let v47 = 0;
    let v48 = 0;
    let v49 = 0;
    let result =
    v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 +
    v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 + v19 +
    v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 +
    v30 + v31 + v32 + v33 + v34 + v35 + v36 + v37 + v38 + v39 +
    v40 + v41 + v42 + v43 + v44 + v45 + v46 + v47 + v48 + v49
    ;
    Process.println(Str.fromInt(result))
  }
}
"#,
      },
      CompilerTestCase {
        name: "VariousSyntaxForms",
        expected_std: "84\n",
        source_code: r#"
import {Pair, Triple} from std.tuples;

class Clazz(val t: Pair<Triple<int, int, bool>, Str>) {
    function of(): Clazz = Clazz.init(((42, 2, false), ""))

    method thisTest(): int = {
      let ((i, _, _), _) = this.t;
      let {t as {e0 as (j, _, _), e1}} = this;
      i + j
    }
}

class Option<T>(Some(T), None) {
  function <T> none(): Option<T> = Option.None()
  method toSome(t: T): Option<T> = Option.Some(t)
  method isNone(): bool = match (this) {
    None -> true,
    Some(_) -> false,
  }
  method <R> map(f: (T) -> R): Option<R> =
    match (this) {
      None -> Option.None(),
      Some(t) -> Option.Some(f(t)),
    }
  function test(): unit = {
    let _ = match (Option.None<(Str) -> int>()) {
      None -> "",
      Some(f) -> Str.fromInt(f("")),
    };
  }
}

class List<T>(Nil, Cons(T, List<T>)) {
  function <T> of(t: T): List<T> =
    List.Cons(t, List.Nil<T>())
  method cons(t: T): List<T> =
    List.Cons(t, this)
}

class Main {
  function literalsAndSimpleExpressions(): unit = {
    let _ = 42;
    let _ = -65536;
    let _ = true;
    let _ = false;
    let _ = !true;
    let _ = !false;
    let _ = "aaa";
    let _ = {};
  }

  function variables(a: int, b: Str): unit = {
    let c = 3 + a;
    let d = b == b;
    let e = c % c;
  }

  function methodAndFunctionReference(): int =
    Clazz.of().thisTest()

  function panicTest(reason: Str): Clazz = Process.panic(reason)

  function functionsTest(): unit = {
    let _ = Main.literalsAndSimpleExpressions();
    let _ = Main.variables(3, "hi");
    let _ = Main.methodAndFunctionReference();
    let _ = Main.panicTest("Ah!").thisTest();
    let _ = Main.binaryExpressions();
    let _ = Main.lambdaTest(3);
    Main.functionsTest()
  }

  function binaryExpressions(): unit = {
    let a: int = 1 * 2 + 3 / 4 % 5 - 6;
    let b: bool = a < a && 1 > 3 || 2 <= 4 && 5 >= 6;
    let c: bool = a == 2;
    let d: bool = Main.panicTest("ha") != Clazz.of();
    let e: bool = List.of(3) == List.of(a * 3);
  }

  function lambdaTest(a: int): Str = {
    let b = Option.none<int>().toSome(3).map(Main.lambdaTest);
    let c = Option.none<int>().toSome(3).map((x) -> "empty");
    "hello world"
  }

  function main(): unit = {
    let _ = Main.literalsAndSimpleExpressions();
    let _ = Main.variables(3, "sss");
    let v = Main.methodAndFunctionReference(); // 42 + 42 == 84
    Process.println(Str.fromInt(v))
  }
}
"#,
      },
    ]
  }

  #[test]
  fn formatter_tests() {
    let heap = &mut Heap::new();
    let handles = compiler_integration_tests()
      .iter()
      .map(|case| {
        (
          heap.alloc_module_reference_from_string_vec(vec![case.name.to_string()]),
          case.source_code.to_string(),
        )
      })
      .collect_vec();
    let mut sources = crate::builtin_parsed_std_sources(heap);
    let expected_sources_size = sources.len() + handles.len();
    for (mod_ref, text) in handles {
      let module = parse_source_module_from_text(&text, mod_ref, heap, &mut ErrorSet::new());
      let raw = printer::pretty_print_source_module(heap, 100, &module);
      let mut error_set = ErrorSet::new();
      sources.insert(mod_ref, parse_source_module_from_text(&raw, mod_ref, heap, &mut error_set));
      assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
    }
    let mut error_set = ErrorSet::new();
    let (checked_sources, _) = type_check_sources(&sources, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
    assert!(checked_sources.len() == expected_sources_size);
  }

  type HostState = Vec<String>;

  #[test]
  fn compiler_tests() {
    let tests = compiler_integration_tests();
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mut sources = tests
      .iter()
      .map(|it| {
        let mod_ref = heap.alloc_module_reference_from_string_vec(vec![it.name.to_string()]);
        (mod_ref, parse_source_module_from_text(it.source_code, mod_ref, heap, &mut error_set))
      })
      .collect::<HashMap<_, _>>();
    for (mod_ref, parsed) in crate::builtin_parsed_std_sources(heap) {
      sources.insert(mod_ref, parsed);
    }
    let (checked_sources, _) = type_check_sources(&sources, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
    let unoptimized_mir_sources = compiler::compile_sources_to_mir(heap, &checked_sources);
    let optimized_mir_sources = optimization::optimize_sources(
      heap,
      unoptimized_mir_sources,
      &optimization::ALL_ENABLED_CONFIGURATION,
    );
    let mut lir_sources = compiler::compile_mir_to_lir(heap, optimized_mir_sources);
    // Uncomment the following line to read the source
    // panic!("{}", lir_sources.pretty_print(heap));
    for test in &tests {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![test.name.to_string()]);
      let main_type_name = lir_sources.symbol_table.create_main_type_name(mod_ref);
      let actual = interpreter::run(
        heap,
        &lir_sources,
        samlang_ast::mir::FunctionName { type_name: main_type_name, fn_name: PStr::MAIN_FN },
      );
      assert_eq!(test.expected_std, actual);
      // Replace with the following line for debugging
      // assert_eq!(test.expected_std, actual, "{}", test.name);
    }

    let (_, wasm_module) = compiler::compile_lir_to_wasm(heap, &lir_sources);
    let engine = Engine::default();
    let module = Module::new(&engine, &mut &wasm_module[..]).unwrap();
    let mut store = Store::new(&engine, vec![]);
    let memory =
      Memory::new(store.as_context_mut(), MemoryType::new(2, Some(65536)).unwrap()).unwrap();
    let mut linker = <Linker<HostState>>::new(&engine);
    let builtin_println = move |mut caller: Caller<'_, HostState>, _: i32, param: i32| -> i32 {
      let string = pointer_to_string(&caller, &memory, param);
      caller.data_mut().push(string);
      0
    };
    let instance = linker
      .define("env", "memory", memory)
      .unwrap()
      .define(
        "builtins",
        &samlang_ast::mir::FunctionName::PROCESS_PRINTLN
          .encoded_for_test(heap, &lir_sources.symbol_table),
        Func::wrap(&mut store, builtin_println),
      )
      .unwrap()
      .define(
        "builtins",
        &samlang_ast::mir::FunctionName::PROCESS_PANIC
          .encoded_for_test(heap, &lir_sources.symbol_table),
        Func::wrap(&mut store, wasm_builtin_panic),
      )
      .unwrap()
      .instantiate(&mut store, &module)
      .unwrap()
      .start(&mut store)
      .unwrap();
    let mut expected_str = String::new();
    for test in &tests {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![test.name.to_string()]);
      let main_function_name = samlang_ast::mir::FunctionName {
        type_name: lir_sources.symbol_table.create_main_type_name(mod_ref),
        fn_name: PStr::MAIN_FN,
      }
      .encoded_for_test(heap, &lir_sources.symbol_table);
      expected_str.push_str(test.name);
      expected_str.push_str(":\n");
      store.data_mut().push(test.name.to_string() + ":");

      let main_function =
        Extern::into_func(instance.get_export(&store, &main_function_name).unwrap())
          .unwrap()
          .typed::<(), i32>(&mut store)
          .unwrap();
      main_function.call(&mut store, ()).unwrap();

      expected_str.push_str(test.expected_std);
      expected_str.push_str("\n\n");
      store.data_mut().push("\n".to_string());
    }
    assert_eq!(expected_str.trim(), store.data().join("\n").trim())
  }

  #[should_panic]
  #[test]
  fn wasm_builtin_panic_test() {
    let engine = Engine::default();
    let mut store = Store::new(&engine, vec![]);
    wasm_builtin_panic(Caller::from(&mut store), 0, 0);
  }

  fn wasm_builtin_panic(_: Caller<'_, HostState>, _: i32, _: i32) -> i32 {
    panic!("Ouch");
  }

  fn pointer_to_string(caller: &Caller<'_, HostState>, mem: &Memory, param: i32) -> String {
    let mut len_bytes = [0; 4];
    let ptr = usize::try_from(param).unwrap();
    mem.read(caller.as_context(), ptr + 4, &mut len_bytes).unwrap();
    let length = usize::try_from(u32::from_le_bytes(len_bytes)).unwrap();
    let mut str_bytes = vec![0; length];
    mem.read(caller.as_context(), ptr + 8, &mut str_bytes).unwrap();
    String::from_utf8(str_bytes).unwrap()
  }
}
