#[cfg(test)]
mod tests {
  use super::super::api::*;
  use crate::{
    ast::Position,
    common::{Heap, ModuleReference},
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn coverage_tests() {
    assert!(!format!("{:?}", TypeQueryContent { language: "", value: "".to_string() }).is_empty());
    assert!(!format!(
      "{:?}",
      AutoCompletionItem {
        kind: CompletionItemKind::Function,
        insert_text_format: InsertTextFormat::Snippet,
        detail: "".to_string(),
        insert_text: "".to_string(),
        label: "".to_string(),
      }
    )
    .is_empty());
  }

  #[test]
  fn update_tests() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["test".to_string()]);
    let mut service = LanguageServices::new(heap, vec![]);
    service.update(
      test_mod_ref,
      r#"
class Test {
  function test(): int = "haha"
}
interface I { function test(): int }
"#
      .to_string(),
    );

    assert_eq!(1, service.all_modules().len());
    assert!(service.get_errors(&ModuleReference::root()).is_empty());
    assert_eq!(
      vec!["test.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`."],
      service.get_error_strings(&test_mod_ref)
    );

    service.remove(&test_mod_ref);
    assert!(service.get_errors(&test_mod_ref).is_empty());
  }

  #[test]
  fn dependency_tests() {
    let mut heap = Heap::new();
    let test1_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let mut service = LanguageServices::new(
      heap,
      vec![
        (
          test1_mod_ref,
          r#"
class Test1 {
  function test(): int = "haha"
}
"#
          .to_string(),
        ),
        (
          test2_mod_ref,
          r#"
import { Test1, Test2 } from Test1

class Test2 {
  function test(): string = 3
}
"#
          .to_string(),
        ),
      ],
    );

    assert_eq!(
      vec!["Test1.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`."],
      service.get_error_strings(&test1_mod_ref)
    );
    assert_eq!(
      vec![
        "Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.",
        "Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.",
        "Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.",
      ],
      service.get_error_strings(&test2_mod_ref)
    );

    // Adding Test2 can clear one error of its reverse dependency.
    service.update(
      test1_mod_ref,
      r#"
class Test1 {
  function test(): int = "haha"
}
class Test2 {}
"#
      .to_string(),
    );
    assert_eq!(
      vec!["Test1.sam:3:26-3:32: [UnexpectedType]: Expected: `int`, actual: `string`."],
      service.get_error_strings(&test1_mod_ref)
    );
    assert_eq!(
      vec![
        "Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.",
        "Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.",
      ],
      service.get_error_strings(&test2_mod_ref)
    );

    // Clearing local error of Test1
    service.update(
      test1_mod_ref,
      r#"
class Test1 {
  function test(): int = 3
}
"#
      .to_string(),
    );
    assert!(service.get_errors(&test1_mod_ref).is_empty());
    assert_eq!(
      vec![
        "Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.",
        "Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.",
        "Test2.sam:5:29-5:30: [UnexpectedType]: Expected: `string`, actual: `int`.",
      ],
      service.get_error_strings(&test2_mod_ref)
    );

    // Clearing local error of Test2
    service.update(
      test2_mod_ref,
      r#"
import { Test1, Test2 } from Test1

class Test2 {
  function test(): string = "haha"
}
"#
      .to_string(),
    );
    assert!(service.get_errors(&test1_mod_ref).is_empty());
    assert_eq!(
      vec![
        "Test2.sam:2:17-2:22: [UnresolvedName]: Name `Test2` is not resolved.",
        "Test2.sam:4:7-4:12: [Collision]: Name `Test2` collides with a previously defined name.",
      ],
      service.get_error_strings(&test2_mod_ref)
    );

    // Clearing all errors of Test2
    service.update(
      test2_mod_ref,
      r#"
import { Test1 } from Test1

class Test2 {
  function test(): string = "haha"
}
"#
      .to_string(),
    );
    assert!(service.get_errors(&test1_mod_ref).is_empty());
    assert!(service.get_errors(&test2_mod_ref).is_empty());
  }

  #[test]
  fn query_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let test3_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test3".to_string()]);
    let service = LanguageServices::new(
      heap,
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

  function test2(): int = Test1.init(3).test()
}
"#
          .to_string(),
        ),
        (test3_mod_ref, "class Test1 { function test(): int = NonExisting.test() }".to_string()),
      ],
    );

    assert!(service.query_for_hover(&test_mod_ref, Position(100, 100)).is_none());
    assert_eq!(
      vec![TypeQueryContent { language: "samlang", value: "string".to_string() }],
      service.query_for_hover(&test_mod_ref, Position(3, 27)).unwrap().contents
    );
    assert_eq!(
      vec![
        TypeQueryContent { language: "samlang", value: "class Test1".to_string() },
        TypeQueryContent { language: "markdown", value: "Test".to_string() }
      ],
      service.query_for_hover(&test_mod_ref, Position(1, 9)).unwrap().contents
    );
    assert_eq!(
      vec![
        TypeQueryContent { language: "samlang", value: "() -> int".to_string() },
        TypeQueryContent { language: "markdown", value: "test".to_string() }
      ],
      service.query_for_hover(&test_mod_ref, Position(5, 34)).unwrap().contents
    );
    assert_eq!(
      vec![TypeQueryContent { language: "samlang", value: "class Test1".to_string() }],
      service.query_for_hover(&test2_mod_ref, Position(1, 9)).unwrap().contents
    );
    assert_eq!(
      vec![TypeQueryContent { language: "samlang", value: "() -> int".to_string() }],
      service.query_for_hover(&test2_mod_ref, Position(4, 44)).unwrap().contents
    );
    assert_eq!(
      vec![TypeQueryContent { language: "samlang", value: "class NonExisting".to_string() }],
      service.query_for_hover(&test3_mod_ref, Position(0, 45)).unwrap().contents
    );
  }

  #[test]
  fn query_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let service = LanguageServices::new(
      heap,
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

  function test2(v: int): int = Test1.test()
}
"#
          .to_string(),
        ),
      ],
    );

    // At v in v: int
    assert_eq!(
      vec![TypeQueryContent { language: "samlang", value: "int".to_string() }],
      service.query_for_hover(&test2_mod_ref, Position(4, 17)).unwrap().contents
    );
    // At the () of call
    assert!(service.query_for_hover(&test2_mod_ref, Position(4, 42)).is_none());
  }

  #[test]
  fn query_def_loc_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let service = LanguageServices::new(
      heap,
      vec![
        (
          test_mod_ref,
          r#"/** Test */
class Test1 {
  /** test */
  // function test(): int = -1

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

    assert!(service.query_definition_location(&test_mod_ref, Position(4, 33)).is_none());
    assert!(service.query_definition_location(&test2_mod_ref, Position(2, 23)).is_none());
    assert!(service.query_definition_location(&test2_mod_ref, Position(4, 30)).is_none());
    assert!(service.query_definition_location(&test2_mod_ref, Position(4, 33)).is_none());
    assert!(service.query_definition_location(&test2_mod_ref, Position(4, 37)).is_none());
  }

  #[test]
  fn query_def_loc_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let service = LanguageServices::new(
      heap,
      vec![(
        test_mod_ref,
        r#"class Test1(val a: int) {
  function test(): int = {
    val [c, b] = [1, 2];

    a + b + c
  }
}
"#
        .to_string(),
      )],
    );

    assert!(service.query_definition_location(&test_mod_ref, Position(4, 4)).is_none());
  }

  #[test]
  fn query_def_loc_test_3() {
    let mut heap = Heap::new();
    let test1_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let test3_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test3".to_string()]);
    let service = LanguageServices::new(
      heap,
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
      vec!["Test1.sam:12:15-12:16: [UnresolvedName]: Name `c` is not resolved."],
      service.get_error_strings(&test1_mod_ref)
    );

    assert!(service
      .query_definition_location(&ModuleReference::dummy(), Position(100, 100))
      .is_none());
    assert!(service.query_definition_location(&test1_mod_ref, Position(100, 100)).is_none());
    assert!(service.query_definition_location(&test1_mod_ref, Position(4, 46)).is_none());
    assert!(service.query_definition_location(&test1_mod_ref, Position(4, 59)).is_none());
    assert!(service.query_definition_location(&test1_mod_ref, Position(4, 60)).is_none());
    assert!(service.query_definition_location(&test1_mod_ref, Position(6, 35)).is_none());

    assert_eq!(
      "Test1.sam:5:17-5:18",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 16))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:3:1-15:2",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 34))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:5:3-5:61",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 38))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:5:3-5:61",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 40))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:5:17-5:18",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 48))
        .unwrap()
        .pretty_print(&service.heap)
    );
    assert_eq!(
      "Test2.sam:1:13-1:45",
      service
        .query_definition_location(&test1_mod_ref, Position(4, 51))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test3.sam:1:1-1:50",
      service
        .query_definition_location(&test1_mod_ref, Position(5, 30))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:3:1-15:2",
      service
        .query_definition_location(&test1_mod_ref, Position(6, 28))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:3:1-15:2",
      service
        .query_definition_location(&test1_mod_ref, Position(6, 41))
        .unwrap()
        .pretty_print(&service.heap)
    );

    assert_eq!(
      "Test1.sam:10:11-10:12",
      service
        .query_definition_location(&test1_mod_ref, Position(10, 15))
        .unwrap()
        .pretty_print(&service.heap)
    );
  }

  #[test]
  fn query_folding_ranges_tests() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let service = LanguageServices::new(
      heap,
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
      service
        .query_folding_ranges(&test_mod_ref)
        .unwrap()
        .iter()
        .map(|l| l.pretty_print(&service.heap))
        .collect_vec()
    );
    assert!(service.query_folding_ranges(&ModuleReference::root()).is_none());
  }

  #[test]
  fn autocomplete_test_1() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let service = LanguageServices::new(
      heap,
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

    assert!(service.auto_complete(&test_mod_ref, Position(4, 5)).is_empty());
    assert_eq!(
      vec![
        AutoCompletionItem {
          kind: CompletionItemKind::Function,
          insert_text_format: InsertTextFormat::Snippet,
          detail: "<T>((unit) -> List<T>)".to_string(),
          insert_text: "Nil($0)$1".to_string(),
          label: "Nil(a0: unit): List<T>".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Function,
          insert_text_format: InsertTextFormat::Snippet,
          detail: "<T>((Pair<T, List<T>>) -> List<T>)".to_string(),
          insert_text: "Cons($0)$1".to_string(),
          label: "Cons(a0: Pair<T, List<T>>): List<T>".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Function,
          insert_text_format: InsertTextFormat::Snippet,
          label: "of(a0: T): List<T>".to_string(),
          insert_text: "of($0)$1".to_string(),
          detail: "<T>((T) -> List<T>)".to_string(),
        },
      ],
      service.auto_complete(&test_mod_ref, Position(13, 17))
    );
    assert_eq!(
      vec![AutoCompletionItem {
        kind: CompletionItemKind::Method,
        insert_text_format: InsertTextFormat::Snippet,
        label: "cons(a0: T): List<T>".to_string(),
        insert_text: "cons($0)$1".to_string(),
        detail: "(T) -> List<T>".to_string(),
      },],
      service.auto_complete(&test_mod_ref, Position(13, 31))
    );
    assert_eq!(
      vec![
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "name".to_string(),
          insert_text: "name".to_string(),
          detail: "string".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "github".to_string(),
          insert_text: "github".to_string(),
          detail: "string".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "projects".to_string(),
          insert_text: "projects".to_string(),
          detail: "List<string>".to_string(),
        }
      ],
      service.auto_complete(&test_mod_ref, Position(15, 46))
    );
    assert_eq!(
      vec![
        AutoCompletionItem {
          kind: CompletionItemKind::Function,
          insert_text_format: InsertTextFormat::Snippet,
          detail: "(string, string, List<string>) -> Developer".to_string(),
          insert_text: "init($0, $1, $2)$3".to_string(),
          label: "init(a0: string, a1: string, a2: List<string>): Developer".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Function,
          insert_text_format: InsertTextFormat::PlainText,
          label: "sam(): Developer".to_string(),
          insert_text: "sam()".to_string(),
          detail: "() -> Developer".to_string(),
        },
      ],
      service.auto_complete(&test_mod_ref, Position(19, 41))
    );
  }

  #[test]
  fn autocomplete_test_2() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let service = LanguageServices::new(
      heap,
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
      vec![
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "name".to_string(),
          insert_text: "name".to_string(),
          detail: "string".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "github".to_string(),
          insert_text: "github".to_string(),
          detail: "string".to_string(),
        },
        AutoCompletionItem {
          kind: CompletionItemKind::Field,
          insert_text_format: InsertTextFormat::PlainText,
          label: "projects".to_string(),
          insert_text: "projects".to_string(),
          detail: "List<string>".to_string(),
        }
      ],
      service.auto_complete(&test_mod_ref, Position(15, 43))
    );
  }

  #[test]
  fn autocomplete_test_3() {
    let mod_ref = ModuleReference::dummy();
    let service = LanguageServices::new(Heap::new(), vec![(mod_ref, ".".to_string())]);
    assert!(service.auto_complete(&mod_ref, Position(0, 1)).is_empty());
  }

  #[test]
  fn autocomplete_test_4() {
    let mod_ref = ModuleReference::dummy();
    let service = LanguageServices::new(
      Heap::new(),
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
    assert!(service.auto_complete(&mod_ref, Position(2, 41)).is_empty());
  }

  #[test]
  fn autocomplete_test_5() {
    let mod_ref = ModuleReference::dummy();
    let service = LanguageServices::new(
      Heap::new(),
      vec![(
        mod_ref.clone(),
        r#"
class Main {
  function main(a: Developer): Developer = a.
}
"#
        .to_string(),
      )],
    );
    assert!(service.auto_complete(&mod_ref, Position(2, 45)).is_empty());
  }

  #[test]
  fn autocomplete_test_6() {
    let mod_ref = ModuleReference::dummy();
    let service = LanguageServices::new(
      Heap::new(),
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
      vec![AutoCompletionItem {
        kind: CompletionItemKind::Method,
        insert_text_format: InsertTextFormat::PlainText,
        label: "b(): unit".to_string(),
        insert_text: "b()".to_string(),
        detail: "() -> unit".to_string(),
      }],
      service.auto_complete(&mod_ref, Position(2, 45))
    );
  }

  #[test]
  fn autocomplete_test_7() {
    let mod_ref = ModuleReference::dummy();
    let service = LanguageServices::new(
      Heap::new(),
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
    assert!(service.auto_complete(&mod_ref, Position(2, 32)).is_empty());
  }

  #[test]
  fn rename_bad_identifier_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut service = LanguageServices::new(heap, vec![]);
    assert!(service.rename_variable(&mod_ref, Position(2, 45), "3").is_none());
    assert!(service.rename_variable(&mod_ref, Position(2, 45), "A3").is_none());
    assert!(service.rename_variable(&mod_ref, Position(2, 45), "a3").is_none());
  }

  #[test]
  fn rename_not_found_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut service = LanguageServices::new(
      heap,
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

    assert!(service.rename_variable(&mod_ref, Position(100, 100), "a").is_none());
    assert!(service.rename_variable(&mod_ref, Position(3, 27), "a").is_none());
    assert!(service.rename_variable(&mod_ref, Position(1, 9), "a").is_none());
  }

  #[test]
  fn rename_variable_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let mut service = LanguageServices::new(
      heap,
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

    assert!(service.rename_variable(&mod_ref, Position(2, 36), "a").is_none());
    assert_eq!(
      r#"class Test {
  function main(): unit = {
    val a = b;
  }
}
"#,
      service.rename_variable(&mod_ref, Position(2, 32), "a").unwrap()
    );
    assert_eq!(
      r#"class Test {
  function main(): unit = {
    val c = b;
  }
}
"#,
      service.rename_variable(&mod_ref, Position(2, 32), "c").unwrap()
    );
  }

  #[test]
  fn reformat_good_program_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let service = LanguageServices::new(
      heap,
      vec![(
        mod_ref.clone(),
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
      service.format_entire_document(&mod_ref).unwrap()
    );
    assert!(service.format_entire_document(&ModuleReference::dummy()).is_none());
  }

  #[test]
  fn reformat_bad_program_tests() {
    let mut heap = Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let service = LanguageServices::new(
      heap,
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

    assert!(service.format_entire_document(&mod_ref).is_none());
  }
}
