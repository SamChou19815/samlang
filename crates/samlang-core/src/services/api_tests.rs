#[cfg(test)]
mod tests {
  use super::super::api::*;
  use crate::{
    ast::{Location, Position},
    common::{Heap, ModuleReference},
    services::server_state::ServerState,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn coverage_tests() {
    assert!(!format!(
      "{:?}",
      rewrite::CodeAction::Quickfix { title: "".to_string(), edits: vec![] }
    )
    .is_empty());
  }

  #[test]
  fn query_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let test3_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test3".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (
          test_mod_ref,
          r#"/** Test */
class Test1 {
  /** test */
  function test(): int = "haha"

  function test2(): int = Test1.test()
}
"#
          .to_string(),
        ),
        (
          test2_mod_ref,
          r#"
class Test1(val a: int) {
  method test(): int = 1
  method getA(): int = this.a
  function test2(): int = Test1.init(3).test()
}
"#
          .to_string(),
        ),
        (test3_mod_ref, "class Test1 { function test(): int = NonExisting.test() }".to_string()),
      ],
    );

    assert!(query::hover(&state, &test_mod_ref, Position(100, 100)).is_none());
    assert_eq!(
      "string [lang=samlang]",
      query::hover(&state, &test_mod_ref, Position(3, 27))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "class Test1 [lang=samlang]\nTest [lang=markdown]",
      query::hover(&state, &test_mod_ref, Position(1, 9))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "() -> int [lang=samlang]\ntest [lang=markdown]",
      query::hover(&state, &test_mod_ref, Position(5, 34))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "class Test1 [lang=samlang]",
      query::hover(&state, &test2_mod_ref, Position(1, 9))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "int [lang=samlang]",
      query::hover(&state, &test2_mod_ref, Position(3, 28))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "() -> int [lang=samlang]",
      query::hover(&state, &test2_mod_ref, Position(4, 44))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    assert_eq!(
      "class NonExisting [lang=samlang]",
      query::hover(&state, &test3_mod_ref, Position(0, 45))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
  }

  #[test]
  fn query_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (
          test_mod_ref,
          r#"/** Test */
class Test1 {
  /** test */
  // function test(): int = "haha"

  function test2(): int = Test1.test()
}
"#
          .to_string(),
        ),
        (
          test2_mod_ref,
          r#"import {Test1} from Test
class Test2(val a: int) {
  method test(): int = 1
  method getB(): int = this.b
  function test2(v: int): int = Test1.test()
}
"#
          .to_string(),
        ),
      ],
    );

    // At v in v: int
    assert_eq!(
      "int [lang=samlang]",
      query::hover(&state, &test2_mod_ref, Position(4, 17))
        .unwrap()
        .contents
        .iter()
        .map(query::TypeQueryContent::to_string)
        .join("\n")
    );
    // At b in this.b
    assert!(query::hover(&state, &test2_mod_ref, Position(3, 28)).is_none());
    // At the () of call
    assert!(query::hover(&state, &test2_mod_ref, Position(4, 42)).is_none());
    // Non-existent
    assert!(query::all_references(&state, &ModuleReference::dummy(), Position(4, 100)).is_empty());
    assert!(query::all_references(&state, &test2_mod_ref, Position(4, 100)).is_empty());
  }

  #[test]
  fn query_def_loc_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (
          test_mod_ref,
          r#"/** Test */
class Test1 {
  /** test */
  // function test(): int = -1
  method getB(): int = this.b
  function test2(): int = Builtins.stringToInt("")
}
"#
          .to_string(),
        ),
        (
          test2_mod_ref,
          r#"import {Test1} from Test
class Test2(val a: int) {
  method test(): int = -1

  function test2(): int = Builtins.panic("")
}
"#
          .to_string(),
        ),
      ],
    );

    assert!(query::definition_location(&state, &test_mod_ref, Position(4, 28)).is_none());
    assert!(query::definition_location(&state, &test_mod_ref, Position(4, 33)).is_none());
    assert!(query::definition_location(&state, &test2_mod_ref, Position(2, 23)).is_none());
    assert!(query::definition_location(&state, &test2_mod_ref, Position(4, 30)).is_none());
    assert!(query::definition_location(&state, &test2_mod_ref, Position(4, 33)).is_none());
    assert!(query::definition_location(&state, &test2_mod_ref, Position(4, 37)).is_none());
  }

  #[test]
  fn query_def_loc_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        test_mod_ref,
        r#"class Test1(val a: int) {
  function test(): int = {
    val {c, b} = 1 + 2;

    a + b + c
  }
}
"#
        .to_string(),
      )],
    );

    assert_eq!(
      vec![
        "Test1.sam:3:10-3:11: [member-missing]: Cannot find member `c` on `int`.",
        "Test1.sam:3:13-3:14: [member-missing]: Cannot find member `b` on `int`.",
        "Test1.sam:5:5-5:6: [cannot-resolve-name]: Name `a` is not resolved.",
      ],
      state.get_error_strings(&test_mod_ref)
    );

    // At 1 in `[1, 2]`
    assert!(query::definition_location(&state, &test_mod_ref, Position(2, 18)).is_none());
    assert!(query::all_references(&state, &test_mod_ref, Position(2, 18)).is_empty());
    // At a in `a + b + c`
    assert!(query::definition_location(&state, &test_mod_ref, Position(4, 4)).is_none());
    assert!(query::all_references(&state, &test_mod_ref, Position(4, 4)).is_empty());
    // At + in `a + b + c`
    assert!(query::definition_location(&state, &test_mod_ref, Position(4, 6)).is_none());
    assert!(query::all_references(&state, &test_mod_ref, Position(4, 6)).is_empty());
  }

  #[test]
  fn query_def_loc_test_3() {
    let mut heap = Heap::new();
    let test1_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let test3_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test3".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (test3_mod_ref, "class ABC { function a(): unit = { val _ = 1; } }".to_string()),
        (test2_mod_ref, "class TTT { method test(): int = this.test() }".to_string()),
        (
          test1_mod_ref,
          r#"import {ABC} from Test3
import {TTT} from Test2
class Test1(val a: int) {
  function test1(): int = 42
  function test(t: TTT): int = Test1 .test(t) + t.test() + 1
  function test2(): unit = ABC.a()
  function test3(): int = Test1.init(3).a
  function test4(): unit = {
    val _ = {
      val b = 3;
      val _ = b + 2;
      val _ = c;
    };
  }
}
"#
          .to_string(),
        ),
      ],
    );

    assert_eq!(
      vec!["Test1.sam:12:15-12:16: [cannot-resolve-name]: Name `c` is not resolved."],
      state.get_error_strings(&test1_mod_ref)
    );

    assert!(
      query::definition_location(&state, &ModuleReference::dummy(), Position(100, 100)).is_none()
    );
    assert!(query::definition_location(&state, &test1_mod_ref, Position(100, 100)).is_none());
    assert!(query::definition_location(&state, &test1_mod_ref, Position(4, 46)).is_none());
    assert!(query::definition_location(&state, &test1_mod_ref, Position(4, 59)).is_none());
    assert!(query::definition_location(&state, &test1_mod_ref, Position(4, 60)).is_none());
    assert!(query::definition_location(&state, &test1_mod_ref, Position(6, 35)).is_none());

    // At t in `(t: TTT)`
    assert_eq!(
      "Test1.sam:5:17-5:18",
      query::definition_location(&state, &test1_mod_ref, Position(4, 16))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:5:17-5:18, Test1.sam:5:44-5:45, Test1.sam:5:49-5:50",
      query::all_references(&state, &test1_mod_ref, Position(4, 16))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    // At Test1 in `Test1 .test`
    assert_eq!(
      "Test1.sam:3:1-15:2",
      query::definition_location(&state, &test1_mod_ref, Position(4, 34))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:3:7-3:12, Test1.sam:5:32-5:37, Test1.sam:7:27-7:32",
      query::all_references(&state, &test1_mod_ref, Position(4, 34))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    // At test in `Test1 .test`
    assert_eq!(
      "Test1.sam:5:3-5:61",
      query::definition_location(&state, &test1_mod_ref, Position(4, 38))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:5:12-5:16, Test1.sam:5:39-5:43",
      query::all_references(&state, &test1_mod_ref, Position(4, 38))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    // At t in `t.test()`
    assert_eq!(
      "Test1.sam:5:17-5:18",
      query::definition_location(&state, &test1_mod_ref, Position(4, 48))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:5:17-5:18, Test1.sam:5:44-5:45, Test1.sam:5:49-5:50",
      query::all_references(&state, &test1_mod_ref, Position(4, 48))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );
    // At test in `t.test()`
    assert_eq!(
      "Test2.sam:1:13-1:45",
      query::definition_location(&state, &test1_mod_ref, Position(4, 51))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:5:51-5:55, Test2.sam:1:20-1:24, Test2.sam:1:39-1:43",
      query::all_references(&state, &test1_mod_ref, Position(4, 51))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    // At ABC in `ABC.a`
    assert_eq!(
      "Test3.sam:1:1-1:50",
      query::definition_location(&state, &test1_mod_ref, Position(5, 30))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:6:28-6:31, Test3.sam:1:7-1:10",
      query::all_references(&state, &test1_mod_ref, Position(5, 30))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    // At Test1 in `Test1.init`
    assert_eq!(
      "Test1.sam:3:1-15:2",
      query::definition_location(&state, &test1_mod_ref, Position(6, 28))
        .unwrap()
        .pretty_print(&state.heap)
    );

    // At a in `Test1.init(3).a`
    assert_eq!(
      "Test1.sam:3:17-3:18",
      query::definition_location(&state, &test1_mod_ref, Position(6, 41))
        .unwrap()
        .pretty_print(&state.heap)
    );
    assert_eq!(
      "Test1.sam:3:17-3:18, Test1.sam:7:41-7:42",
      query::all_references(&state, &test1_mod_ref, Position(6, 41))
        .into_iter()
        .map(|it| it.pretty_print(&state.heap))
        .join(", ")
    );

    assert_eq!(
      "Test1.sam:10:11-10:12",
      query::definition_location(&state, &test1_mod_ref, Position(10, 15))
        .unwrap()
        .pretty_print(&state.heap)
    );
  }

  #[test]
  fn query_folding_ranges_tests() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        test_mod_ref,
        r#"/** Test */
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons(Pair.init(t, Nil({})))
  method cons(t: T): List<T> =
    Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    Developer.init("Sam Zhou", github, l)
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
"#
        .to_string(),
      )],
    );

    assert_eq!(
      vec![
        "Test.sam:2:1-2:40",
        "Test.sam:4:3-5:32",
        "Test.sam:6:3-7:29",
        "Test.sam:3:1-8:2",
        "Test.sam:13:3-17:4",
        "Test.sam:9:1-18:2",
        "Test.sam:20:3-20:47",
        "Test.sam:19:1-21:2",
      ],
      query::folding_ranges(&state, &test_mod_ref)
        .unwrap()
        .iter()
        .map(|l| l.pretty_print(&state.heap))
        .collect_vec()
    );
    assert!(query::folding_ranges(&state, &ModuleReference::root()).is_none());
  }

  #[test]
  fn query_signature_help_tests() {
    let heap = Heap::new();
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      heap,
      false,
      vec![(
        mod_ref,
        r#"
class Func { function a(x: int, y: bool, z: string): int = 1 }
class Main {
  function test1(): int = Func.a()
  function test2(): int = Func.a(0,)
  function test3(): int = Func.a(0,true,)
  function test4(): int = Func.a(0,true,"")
  function test5(): int = 1(0)
  function test6(): int = Func.a(0)
}
"#
        .to_string(),
      )],
    );

    // Bad location
    assert!(query::signature_help(&state, &mod_ref, Position(2, 3)).is_none());
    // At 0 in test5
    assert!(query::signature_help(&state, &mod_ref, Position(7, 29)).is_none());
    // At callee in test6
    assert!(query::signature_help(&state, &mod_ref, Position(8, 26)).is_none());

    // Mid of () in test1
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=0]",
      query::signature_help(&state, &mod_ref, Position(3, 33)).unwrap().to_string()
    );
    // After , in test2
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=1]",
      query::signature_help(&state, &mod_ref, Position(4, 35)).unwrap().to_string()
    );
    // At true in test2
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=1]",
      query::signature_help(&state, &mod_ref, Position(5, 35)).unwrap().to_string()
    );
    // At final , in test2
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=2]",
      query::signature_help(&state, &mod_ref, Position(5, 40)).unwrap().to_string()
    );
    // At true in test3
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=1]",
      query::signature_help(&state, &mod_ref, Position(6, 35)).unwrap().to_string()
    );
    // At "" in test3
    assert_eq!(
      "(a0: int, a1: bool, a2: string) -> int [params=a0: int,a1: bool,a2: string, active=2]",
      query::signature_help(&state, &mod_ref, Position(6, 40)).unwrap().to_string()
    );
  }

  #[test]
  fn reformat_good_program_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(): Developer = Developer.sam()
}
"#
        .to_string(),
      )],
    );

    assert_eq!(
      r#"class Main {
  function main(): Developer = Developer.sam()
}
"#,
      rewrite::format_entire_document(&state, &mod_ref).unwrap()
    );
    assert!(rewrite::format_entire_document(&state, &ModuleReference::dummy()).is_none());
  }

  #[test]
  fn reformat_bad_program_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        mod_ref,
        r#"
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    { name: projects:  }.
  }
}
"#
        .to_string(),
      )],
    );

    assert!(rewrite::format_entire_document(&state, &mod_ref).is_none());
  }

  #[test]
  fn rename_bad_identifier_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut state = ServerState::new(heap, false, vec![]);
    assert!(rewrite::rename(&mut state, &mod_ref, Position(2, 45), "3").is_none());
    assert!(rewrite::rename(&mut state, &mod_ref, Position(2, 45), "A3").is_none());
    assert!(rewrite::rename(&mut state, &mod_ref, Position(2, 45), "a3").is_none());
  }

  #[test]
  fn rename_not_found_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut state = ServerState::new(
      heap,
      false,
      vec![(
        mod_ref,
        r#"/** Test */
class Test1 {
  /** test */
  function test(): int = "haha"

  function test2(): int = Test1.test()
}
"#
        .to_string(),
      )],
    );

    assert!(rewrite::rename(&mut state, &mod_ref, Position(100, 100), "a").is_none());
    assert!(rewrite::rename(&mut state, &mod_ref, Position(3, 27), "a").is_none());
    assert!(rewrite::rename(&mut state, &mod_ref, Position(1, 9), "a").is_none());
  }

  #[test]
  fn rename_variable_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut state = ServerState::new(
      heap,
      false,
      vec![(
        mod_ref,
        r#"
class Test {
  function main(): unit = { val a = b; }
}
"#
        .to_string(),
      )],
    );

    assert!(rewrite::rename(&mut state, &mod_ref, Position(2, 36), "a").is_none());
    assert_eq!(
      r#"class Test {
  function main(): unit = {
    val a = b;
  }
}
"#,
      rewrite::rename(&mut state, &mod_ref, Position(2, 32), "a").unwrap()
    );
    assert_eq!(
      r#"class Test {
  function main(): unit = {
    val c = b;
  }
}
"#,
      rewrite::rename(&mut state, &mod_ref, Position(2, 32), "c").unwrap()
    );
  }

  #[test]
  fn error_quickfix_test1() {
    let heap = Heap::new();
    // Intentional syntax error
    let state = ServerState::new(heap, false, vec![(ModuleReference::dummy(), "dfsf".to_string())]);
    assert!(rewrite::code_actions(&state, Location::from_pos(0, 1, 0, 2)).is_empty());
  }

  #[test]
  fn error_quickfix_test2() {
    let mut heap = Heap::new();
    let mod_a = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (
          ModuleReference::dummy(),
          r#"
class Main {
  function main(): int = Foo.bar()
}
"#
          .to_string(),
        ),
        (
          mod_a,
          r#"
class Foo {
  function bar(): int = 2
}
"#
          .to_string(),
        ),
      ],
    );
    // At Foo in `Foo.bar`
    assert_eq!(
      vec![rewrite::CodeAction::Quickfix {
        title: "Import `Foo` from `A`".to_string(),
        edits: vec![(
          Location::document_start(ModuleReference::dummy()),
          "import { Foo } from A;".to_string()
        )]
      }],
      rewrite::code_actions(&state, Location::from_pos(2, 28, 2, 28))
    );
  }

  #[test]
  fn error_quickfix_test3() {
    let mut heap = Heap::new();
    let mod_a = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![
        (
          ModuleReference::dummy(),
          r#"
class Main {
  function main(): int = Foo
}
"#
          .to_string(),
        ),
        (
          mod_a,
          r#"
class Foo {}
"#
          .to_string(),
        ),
      ],
    );
    // At Foo in `function main(): int = Foo`
    assert_eq!(
      vec![rewrite::CodeAction::Quickfix {
        title: "Import `Foo` from `A`".to_string(),
        edits: vec![(
          Location::document_start(ModuleReference::dummy()),
          "import { Foo } from A;".to_string()
        )]
      }],
      rewrite::code_actions(&state, Location::from_pos(2, 28, 2, 28))
    );
  }

  #[test]
  fn autocomplete_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        test_mod_ref,
        r#"import {A} from B
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons
  method cons(t: T): List<T> =
    Cons
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...");
    val github = "SamChou19815";
    Developer.init("Sam Zhou", github, l).
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
interface Interface {}
"#
        .to_string(),
      )],
    );

    assert!(completion::auto_complete(&state, &test_mod_ref, Position(4, 3)).is_empty());
    assert!(completion::auto_complete(&state, &test_mod_ref, Position(14, 22)).is_empty());
    assert_eq!(
      r#"Builtins [kind=Class, detail=class Builtins]
Pair [kind=Class, detail=class Pair]
List [kind=Class, detail=class List]
Developer [kind=Class, detail=class Developer]
Main [kind=Class, detail=class Main]
Interface [kind=Interface, detail=interface Interface]"#,
      completion::auto_complete(&state, &test_mod_ref, Position(4, 5))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
    assert_eq!(
      r#"Cons [kind=Function, detail=Cons(a0: Pair<T, List<T>>): List<T>]
Nil [kind=Function, detail=Nil(a0: unit): List<T>]
of [kind=Function, detail=of(a0: T): List<T>]"#,
      completion::auto_complete(&state, &test_mod_ref, Position(13, 17))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
    assert_eq!(
      "cons [kind=Method, detail=cons(a0: T): List<T>]",
      completion::auto_complete(&state, &test_mod_ref, Position(13, 31))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
    assert_eq!(
      r#"github [kind=Field, detail=string]
name [kind=Field, detail=string]
projects [kind=Field, detail=List<string>]"#,
      completion::auto_complete(&state, &test_mod_ref, Position(15, 46))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
    assert_eq!(
      r#"init [kind=Function, detail=init(a0: string, a1: string, a2: List<string>): Developer]
sam [kind=Function, detail=sam(): Developer]"#,
      completion::auto_complete(&state, &test_mod_ref, Position(19, 41))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
  }

  #[test]
  fn autocomplete_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let state = ServerState::new(
      heap,
      false,
      vec![(
        test_mod_ref,
        r#"
class Pair<A, B>(val a: A, val b: B) {}
class List<T>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T> of(t: T): List<T> =
    Cons(Pair.init(t, Nil({})))
  method cons(t: T): List<T> =
    Cons(Pair.init(t, this))
}
class Developer(
  val name: string, val github: string,
  val projects: List<string>
) {
  function sam(): Developer = {
    val l = List.of("SAMLANG").cons("...")
    val github = "SamChou19815"
    Developer.init("Sam Zhou", github, l).
  }
}
class Main {
  function main(): Developer = Developer.sam()
}
"#
        .to_string(),
      )],
    );

    assert_eq!(
      r#"github [kind=Field, detail=string]
name [kind=Field, detail=string]
projects [kind=Field, detail=List<string>]"#,
      completion::auto_complete(&state, &test_mod_ref, Position(15, 43))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
  }

  #[test]
  fn autocomplete_test_3() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(Heap::new(), false, vec![(mod_ref, ".".to_string())]);
    assert!(completion::auto_complete(&state, &mod_ref, Position(0, 1)).is_empty());
  }

  #[test]
  fn autocomplete_test_4() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      Heap::new(),
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(): Developer = Developer.
}
"#
        .to_string(),
      )],
    );
    assert!(completion::auto_complete(&state, &mod_ref, Position(2, 41)).is_empty());
  }

  #[test]
  fn autocomplete_test_5() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      Heap::new(),
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(a: Developer): Developer = a.
}
"#
        .to_string(),
      )],
    );
    assert!(completion::auto_complete(&state, &mod_ref, Position(2, 45)).is_empty());
  }

  #[test]
  fn autocomplete_test_6() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      Heap::new(),
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(a: Developer): Developer = a.
}
class Developer {
  private method f(): unit = {}
  method b(): unit = {}
}
"#
        .to_string(),
      )],
    );
    assert_eq!(
      "b [kind=Method, detail=b(): unit]",
      completion::auto_complete(&state, &mod_ref, Position(2, 45))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
  }

  #[test]
  fn autocomplete_test_7() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      Heap::new(),
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(): unit = aaa.aa
}
"#
        .to_string(),
      )],
    );
    assert!(completion::auto_complete(&state, &mod_ref, Position(2, 32)).is_empty());
  }

  #[test]
  fn autocomplete_test_8() {
    let mod_ref = ModuleReference::dummy();
    let state = ServerState::new(
      Heap::new(),
      false,
      vec![(
        mod_ref,
        r#"
class Main {
  function main(): unit = {
    val foo = "";
    val bar = 3;
    val baz = true;
    a
  }
}
"#
        .to_string(),
      )],
    );
    assert_eq!(
      r#"foo [kind=Variable, detail=string]
bar [kind=Variable, detail=int]
baz [kind=Variable, detail=bool]"#,
      completion::auto_complete(&state, &mod_ref, Position(6, 4))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
    assert_eq!(
      r#"foo [kind=Variable, detail=string]
bar [kind=Variable, detail=int]
baz [kind=Variable, detail=bool]"#,
      completion::auto_complete(&state, &mod_ref, Position(6, 5))
        .iter()
        .map(completion::AutoCompletionItem::to_string)
        .join("\n")
    );
  }
}
