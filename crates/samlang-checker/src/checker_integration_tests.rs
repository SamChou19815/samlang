#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_errors::ErrorSet;
  use samlang_heap::Heap;
  use samlang_parser::parse_source_module_from_text;
  use std::collections::HashMap;

  #[test]
  fn type_checker_integration_tests() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mut string_sources = HashMap::new();
    let mut parsed_sources = HashMap::new();
    for t in SOURCES.iter() {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![t.test_name.to_string()]);
      string_sources.insert(mod_ref, t.source_code.to_string());
      parsed_sources.insert(
        mod_ref,
        parse_source_module_from_text(t.source_code, mod_ref, heap, &mut error_set),
      );
    }
    for (mod_ref, parsed) in samlang_parser::builtin_parsed_std_sources_for_tests(heap) {
      parsed_sources.insert(mod_ref, parsed);
    }
    super::super::type_check_sources(&parsed_sources, &mut error_set);
    assert_eq!(
      EXPECTED_ERRORS.trim(),
      error_set.pretty_print_error_messages(heap, &string_sources).trim()
    );
  }

  struct CheckerTestSource<'a> {
    test_name: &'a str,
    source_code: &'a str,
  }

  static SOURCES: [CheckerTestSource; 31] = [
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

  const EXPECTED_ERRORS: &str = r#"
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
}
