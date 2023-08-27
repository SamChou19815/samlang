use crate::{
  ast::source,
  common::{well_known_pstrs, Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use std::collections::HashSet;

mod lexer;
mod lexer_test;
mod source_parser;

fn builtin_classes() -> HashSet<PStr> {
  HashSet::from([well_known_pstrs::PROCESS_TYPE, well_known_pstrs::STR_TYPE])
}

pub(crate) fn parse_source_module_from_text(
  text: &str,
  module_reference: ModuleReference,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
) -> source::Module<()> {
  let builtins = builtin_classes();
  let parser = source_parser::SourceParser::new(
    lexer::lex_source_program(text, module_reference, heap, error_set),
    heap,
    error_set,
    module_reference,
    builtins,
  );
  parser.parse_module()
}

pub(crate) fn parse_source_expression_from_text(
  text: &str,
  module_reference: ModuleReference,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
) -> (source::CommentStore, source::expr::E<()>) {
  let builtins = builtin_classes();
  let parser = source_parser::SourceParser::new(
    lexer::lex_source_program(text, module_reference, heap, error_set),
    heap,
    error_set,
    module_reference,
    builtins,
  );
  parser.parse_expression_with_comment_store()
}

#[cfg(test)]
mod tests {
  use super::*;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn expect_good_expr(text: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    parse_source_expression_from_text(text, ModuleReference::dummy(), &mut heap, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame(&heap));
  }

  #[test]
  fn test_can_parse_good_expression() {
    expect_good_expr("true /* nothing here */");
    expect_good_expr("true");
    expect_good_expr("(true)");
    expect_good_expr("false");
    expect_good_expr("42");
    expect_good_expr("-2147483648");
    expect_good_expr("2147483647");
    expect_good_expr("\"Hello World!\"");
    expect_good_expr("this");
    expect_good_expr("abc");
    expect_good_expr("Builtins.foo");
    expect_good_expr("SomeClass.foo");
    expect_good_expr("SomeClass.foo<A,B>");
    expect_good_expr("SomeClass.foo<A>");
    expect_good_expr("V.Variant({})");
    expect_good_expr("V.Variant(3)");
    expect_good_expr("V.Variant<T>(3)");
    expect_good_expr("foo.bar");
    expect_good_expr("foo.bar<int, bool>");
    expect_good_expr("foo.bar<() -> int, bool>");
    expect_good_expr("!false");
    expect_good_expr("-42");
    expect_good_expr("haha(3, 4, false, \"oh no\")");
    expect_good_expr("haha()");
    expect_good_expr("3 * 4");
    expect_good_expr("3 / 4");
    expect_good_expr("3 % 4");
    expect_good_expr("3 + 4");
    expect_good_expr("3 - 4");
    expect_good_expr("3 < 4");
    expect_good_expr("/* hi */ 3 < 4");
    expect_good_expr("3 /* hi */ < 4");
    expect_good_expr("(i /* */ < j && i > 0)");
    expect_good_expr("3 <= 4");
    expect_good_expr("3 > 4");
    expect_good_expr("3 >= 4");
    expect_good_expr("3 == 4");
    expect_good_expr("3 != 4");
    expect_good_expr("true && false");
    expect_good_expr("false || true");
    expect_good_expr("\"hello\"::\"world\"");
    expect_good_expr("if (true) then 3 else bar");
    expect_good_expr("match (this) { None(_) -> 0, Some(d) -> d }");
    expect_good_expr("match (this) { None(_) -> match this { None(_) -> 1 } Some(d) -> d }");
    expect_good_expr("match (this) { None(_) -> {}, Some(d) -> d }");
    expect_good_expr("match (this) { None(_) -> 0, Some(d) -> d, }");
    expect_good_expr("(a, b: int, c: Type) -> 3");
    expect_good_expr("(a, b: () -> int, c: Type) -> 3");
    expect_good_expr("() -> 3");
    expect_good_expr("(foo) -> 3");
    expect_good_expr("(foo: bool) -> 3");
    expect_good_expr("{ val a = 3; }");
    expect_good_expr("{ val a: () -> int = () -> 3; }");
    expect_good_expr("{ val a = 3; val b = 3; }");
    expect_good_expr("{ val a = 3; a }");
    expect_good_expr("{ val a: int = 3; }");
    expect_good_expr("{ val a: unit = {}; }");
    expect_good_expr("{ val [foo, _]: Type = 3; }");
    expect_good_expr("{ val {foo, bar as baz}: Type = 3; }");
    expect_good_expr("{ val _: Int<bool> = 3; }");
    expect_good_expr("{ val _: HAHAHA = 3; }");
    expect_good_expr("{ val _: (int, bool) -> Str = 3; }");
    expect_good_expr("{ }");
  }

  fn expect_bad_expr(text: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    parse_source_expression_from_text(text, ModuleReference::dummy(), &mut heap, &mut error_set);
    assert_ne!("", error_set.pretty_print_error_messages_no_frame(&heap));
  }

  #[test]
  fn test_can_report_bad_expression() {
    expect_bad_expr("/* nothing here */ ");
    expect_bad_expr("/* empty */ }");
    expect_bad_expr(" // haha");
    expect_bad_expr("_sdfsdfdsf");
    expect_bad_expr("9223372036854775808");
    expect_bad_expr("-9223372036854775889223372036854775808");
    expect_bad_expr("SomeClass.true");
    expect_bad_expr("SomeClass.<>foo");
    expect_bad_expr("SomeClass.<foo");
    expect_bad_expr("SomeClass.");
    expect_bad_expr("ForTests.assertIntEquals(2444a, 1)");
    expect_bad_expr(".");
    expect_bad_expr(",");
    expect_bad_expr("[]");
    expect_bad_expr("{: }");
    expect_bad_expr("{ hello / }");
    expect_bad_expr("{: bar}");
    expect_bad_expr("{foo: }");
    expect_bad_expr("foo.");
    expect_bad_expr("if (true) then 3");
    expect_bad_expr("if (true) else 4");
    expect_bad_expr("if (true)");
    expect_bad_expr("match (this) { | None _  }");
    expect_bad_expr("match (this) { |  _ -> }");
    expect_bad_expr("match (this) { |  -> }");
    expect_bad_expr("(: int) -> 3");
    expect_bad_expr("(:) -> 3");
    expect_bad_expr("(a:) -> 3");
    expect_bad_expr("{ val a = /* empty */");
    expect_bad_expr("{ val a = /* empty */ }");
    expect_bad_expr("{ val  = 3 }");
    expect_bad_expr("{ val a = int }");
    expect_bad_expr("{ val a:  = 3; a }");
    expect_bad_expr("{ val a: <int> = 3; a }");
    expect_bad_expr("{ val {foo, as baz}: Type = 3; }");
    expect_bad_expr("{ val {foo, bar as }: Type = 3; }");
    expect_bad_expr("{ val a: () ->  = 3; a }");
  }

  #[test]
  fn test_can_parse_good_programs() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let text = r#"
    // Adapted from website
    import { Foo, Bar } from Path.To

    interface Foo {}

    interface Bar<T> {}

    interface Baz : Bar<int> {
      function foo(): () -> Str
      method bar(baz: bool): int
    }

    class Main : Baz {
      function main(): (int) -> Str = "Hello World"
    }

    class Main {
      function main(): int = 2 * 21
    }

    class Util {}

    class Util

    class Util<T>

    class A(val a: () -> int) : Baz
    class A(val a: (Str) -> int) : Baz

    class TParamFixParserTest {
      function <T: Foo<T>, R: Bar<(A) -> int>> f(): unit = {}
    }

    /**
     * docs
     */
    class Option<T>(None, Some(T)) {
      function <T> getNone(): Option<T> = Option.None({})
      function <T> getSome(d: T): Option<T> = Option.Some(d)
      method <R> map(f: (T) -> R): Option<R> =
        match (this) {
          None -> Option.None({}),
          Some(d) -> Option.Some(f(d)),
        }
    }

    class TypeInference {
      private function <T: Int> notAnnotated(): unit = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
      // Read the docs to see how we do the type inference.
      function annotated(): unit = {
        val _: ((int) -> bool, int, int) -> int =
          (a: (int) -> bool, b: int, c: int) -> (
            if a(b + 1) then b else c
          );
      }
    }

    class Developer(
      val name: Str, val github: Str,
      private val projects: List<Str>
    ) {
      function sam(): Developer = {
        val l = List.of("SAMLANG").cons("...");
        val github = "SamChou19815";
        Developer.init("Sam Zhou", github, l)
      }
    }
"#;
    let parsed =
      &parse_source_module_from_text(text, ModuleReference::dummy(), &mut heap, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame(&heap));
    assert_eq!(1, parsed.imports.len());
    assert_eq!(
      vec![
        "Main",
        "Main",
        "Util",
        "Util",
        "Util",
        "A",
        "A",
        "TParamFixParserTest",
        "Option",
        "TypeInference",
        "Developer"
      ],
      parsed
        .toplevels
        .iter()
        .filter_map(|it| {
          match it {
            source::Toplevel::Class(c) => Some(c.name.name.as_str(&heap).to_string()),
            source::Toplevel::Interface(_) => None,
          }
        })
        .collect_vec()
    );
  }

  #[test]
  fn test_can_handle_bad_programs() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let text = r#"
    // Adapted from website
    import { Foo, Bar } from path.To;

    interface A {
      private function main: Str =
    }

    class Main(Boo(), ()) {
      function main(): Str = (id) 3
    }

    class {
      function main(): int =
    }

    interface {
      function main: Str =
    }

    class TypeInference(val : Str, val foo: ) {
      function notAnnotated(bad: ):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }
"#;
    let module =
      parse_source_module_from_text(text, ModuleReference::dummy(), &mut heap, &mut error_set);

    assert_eq!(1, module.imports.len());
    assert!(error_set.has_errors())
  }

  #[test]
  fn test_can_handle_really_bad_programs() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let text = r#"
    import {Foo} from 3.2
    import {Bar} from +.3

    class {
      function main(): int =
    }

    interface {}

    interface Ahhh {
      method notAnnotated(bad: , : int):
    }

    class TypeInference(vafl : Str, val foo: ) {
      function notAnnotated(bad: , : int):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }

    class StructTooLarge(
      val a00: int,
      val a01: int,
      val a02: int,
      val a03: int,
      val a04: int,
      val a05: int,
      val a06: int,
      val a07: int,
      val a08: int,
      val a09: int,
      val a10: int,
      val a11: int,
      val a12: int,
      val a13: int,
      val a14: int,
      val a15: int,
      val a16: int,
      val a17: int,
      val a18: int,
      val a19: int,
      val a20: int,
      val a21: int,
      val a22: int,
      val a23: int,
      val a24: int,
      val a25: int,
      val a26: int,
      val a27: int,
      val a28: int,
      val a29: int,
      val a30: int,
      val a31: int,
      val a32: int,
      val a33: int,
      val a34: int,
      val a35: int,
      val a36: int,
      val a37: int,
      val a38: int,
      val a39: int
    ) {}

    class VariantTooLarge(
      None,
      Some(int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int,
        int,int,int,int,int)
    ) {}
"#;
    parse_source_module_from_text(text, ModuleReference::dummy(), &mut heap, &mut error_set);
    assert!(error_set.has_errors())
  }

  #[test]
  fn test_can_handle_complete_trash() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    parse_source_module_from_text(
      "This is not a program.",
      ModuleReference::dummy(),
      &mut heap,
      &mut error_set,
    );
    let expected_errors = r#"
Error ------------------------------------ DUMMY.sam:1:1-1:5

Unexpected token among the classes and interfaces: This


Error ------------------------------------ DUMMY.sam:1:6-1:8

Unexpected token among the classes and interfaces: is


Error ----------------------------------- DUMMY.sam:1:9-1:12

Unexpected token among the classes and interfaces: not


Error ---------------------------------- DUMMY.sam:1:13-1:14

Unexpected token among the classes and interfaces: a


Error ---------------------------------- DUMMY.sam:1:15-1:22

Unexpected token among the classes and interfaces: program


Error ---------------------------------- DUMMY.sam:1:22-1:23

Unexpected token among the classes and interfaces: .


Found 6 errors.
"#;
    assert_eq!(
      expected_errors.trim(),
      error_set.pretty_print_error_messages_no_frame(&heap).trim()
    );
  }
}
