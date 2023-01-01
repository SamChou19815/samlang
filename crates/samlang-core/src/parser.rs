use crate::{
  ast::{source, ModuleReference},
  errors::ErrorSet,
};
use std::collections::HashSet;

mod lexer;
mod lexer_test;
mod source_parser;

fn builtin_classes() -> HashSet<String> {
  let mut set = HashSet::new();
  set.insert("Builtins".to_string());
  set
}

pub(crate) fn parse_source_module_from_text(
  text: &str,
  module_reference: &ModuleReference,
  error_set: &mut ErrorSet,
) -> source::Module {
  let mut parser = source_parser::SourceParser::new(
    lexer::lex_source_program(text, module_reference.clone(), error_set),
    error_set,
    module_reference,
    builtin_classes(),
  );
  parser.parse_module()
}

pub(crate) fn parse_source_expression_from_text(
  text: &str,
  module_reference: &ModuleReference,
  error_set: &mut ErrorSet,
) -> source::expr::E {
  let mut parser = source_parser::SourceParser::new(
    lexer::lex_source_program(text, module_reference.clone(), error_set),
    error_set,
    module_reference,
    builtin_classes(),
  );
  parser.parse_expression()
}

pub(crate) fn parse_sources_with_invalid_modules_dropped(
  source_handles: Vec<(ModuleReference, &str)>,
) -> Vec<(ModuleReference, source::Module)> {
  let mut error_set = ErrorSet::new();
  let mut parsed = vec![];
  for (mod_ref, source) in source_handles {
    let module = parse_source_module_from_text(source, &mod_ref, &mut error_set);
    if !error_set.module_has_error(&mod_ref) {
      parsed.push((mod_ref.clone(), module));
    }
  }
  parsed
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::common::rcs;
  use itertools::Itertools;

  fn expect_good_expr(text: &str) {
    let mut error_set = ErrorSet::new();
    parse_source_expression_from_text(text, &ModuleReference::dummy(), &mut error_set);
    assert_eq!("", error_set.error_messages().join("\n"));
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
    expect_good_expr("match (this) { | None _ -> 0 | Some d -> d }");
    expect_good_expr("(a, b: int, c: Type) -> 3");
    expect_good_expr("() -> 3");
    expect_good_expr("(foo) -> 3");
    expect_good_expr("(foo: bool) -> 3");
    expect_good_expr("{ val a = 3; }");
    expect_good_expr("{ val a: () -> int = () -> 3; }");
    expect_good_expr("{ val a = 3; val b = 3; }");
    expect_good_expr("{ val a = 3; a }");
    expect_good_expr("{ val a: int = 3; }");
    expect_good_expr("{ val a: unit = {}; }");
    expect_good_expr("{ val {foo, bar as baz}: Type = 3; }");
    expect_good_expr("{ val _: Int<bool> = 3; }");
    expect_good_expr("{ val _: HAHAHA = 3; }");
    expect_good_expr("{ val _: (int, bool) -> string = 3; }");
    expect_good_expr("{ }");
  }

  fn expect_bad_expr(text: &str) {
    let mut error_set = ErrorSet::new();
    parse_source_expression_from_text(text, &ModuleReference::dummy(), &mut error_set);
    assert_ne!("", error_set.error_messages().join("\n"));
  }

  #[test]
  fn test_can_report_bad_expression() {
    expect_bad_expr("/* nothing here */ ");
    expect_bad_expr("/* empty */ }");
    expect_bad_expr(" // haha");
    expect_bad_expr("_sdfsdfdsf");
    expect_bad_expr("9223372036854775808");
    expect_bad_expr("-9223372036854775889223372036854775808");
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
    expect_bad_expr("Variant");
    expect_bad_expr("foo.Bar");
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
    let mut error_set = ErrorSet::new();
    let text = r#"
    // Adapted from website
    import { Foo, Bar } from Path.To

    interface Foo {}

    interface Bar<T> {}

    interface Baz : Bar<int> {
      function foo(): string
      method bar(baz: bool): int
    }

    class Main : Baz {
      function main(): string = "Hello World"
    }

    class Main {
      function main(): int = 2 * 21
    }

    class Util {}

    class Util

    class Util<T>

    class A(val a: int) : Baz

    /**
     * docs
     */
    class Option<T>(None(unit), Some(T)) {
      function <T> getNone(): Option<T> = Option.None({})
      function <T> getSome(d: T): Option<T> = Option.Some(d)
      method <R> map(f: (T) -> R): Option<R> =
        match (this) {
          | None _ -> Option.None({})
          | Some d -> Option.Some(f(d))
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
      val name: string, val github: string,
      private val projects: List<string>
    ) {
      function sam(): Developer = {
        val l = List.of("SAMLANG").cons("...");
        val github = "SamChou19815";
        Developer.init("Sam Zhou", github, l)
      }
    }
"#;
    let parsed = &parse_source_module_from_text(text, &ModuleReference::dummy(), &mut error_set);
    let errors = error_set.error_messages();
    assert_eq!("", errors.join("\n"));
    assert_eq!(1, parsed.imports.len());
    assert_eq!(
      vec!["Main", "Main", "Util", "Util", "Util", "A", "Option", "TypeInference", "Developer"],
      parsed
        .toplevels
        .iter()
        .filter_map(|it| {
          match it {
            source::Toplevel::Class(c) => Some(c.name.name.to_string()),
            source::Toplevel::Interface(_) => None,
          }
        })
        .collect_vec()
    );
  }

  #[test]
  fn test_can_handle_bad_programs() {
    let mut error_set = ErrorSet::new();
    let text = r#"
    // Adapted from website
    import { Foo, Bar } from path.To;

    interface A {
      private function main: string =
    }

    class Main(Boo(), ()) {
      function main(): string = (id) 3
    }

    class {
      function main(): int =
    }

    interface {
      function main: string =
    }

    class TypeInference(val : string, val foo: ) {
      function notAnnotated(bad: ):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }
"#;
    let module = parse_source_module_from_text(text, &ModuleReference::dummy(), &mut error_set);

    assert_eq!(1, module.imports.len());
    assert!(!error_set.errors().is_empty())
  }

  #[test]
  fn test_can_handle_really_bad_programs() {
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

    class TypeInference(vafl : string, val foo: ) {
      function notAnnotated(bad: , : int):  = {
        val _ = (a, b, c) -> if a(b + 1) then b else c;
      }
    }
"#;
    parse_source_module_from_text(text, &ModuleReference::dummy(), &mut error_set);
    assert!(!error_set.errors().is_empty())
  }

  #[test]
  fn test_can_handle_complete_trash() {
    let mut error_set = ErrorSet::new();
    parse_source_module_from_text(
      "This is not a program.",
      &ModuleReference::dummy(),
      &mut error_set,
    );
    let expected_errors =vec![
      "__DUMMY__.sam:1:1-1:5: [SyntaxError]: Unexpected token among the classes and interfaces: This",
      "__DUMMY__.sam:1:13-1:14: [SyntaxError]: Unexpected token among the classes and interfaces: a",
      "__DUMMY__.sam:1:15-1:22: [SyntaxError]: Unexpected token among the classes and interfaces: program",
      "__DUMMY__.sam:1:22-1:23: [SyntaxError]: Unexpected token among the classes and interfaces: .",
      "__DUMMY__.sam:1:6-1:8: [SyntaxError]: Unexpected token among the classes and interfaces: is",
      "__DUMMY__.sam:1:9-1:12: [SyntaxError]: Unexpected token among the classes and interfaces: not"
    ];
    assert_eq!(expected_errors, error_set.error_messages());
  }

  #[test]
  fn parse_sources_test() {
    let modules = vec![
      // good
      (ModuleReference::ordinary(vec![rcs("Test1")]), "class Main { function main(): unit = {} }"),
      // bad
      (ModuleReference::ordinary(vec![rcs("Test2")]), "class Main { function main(): unt = {} }"),
    ];
    assert_eq!(1, parse_sources_with_invalid_modules_dropped(modules).len());
  }
}