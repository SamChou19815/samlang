#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, test_builder, Id, Literal},
      Location,
    },
    checker::{
      ssa_analysis,
      type_::{test_type_builder, ISourceType},
      typing_context::LocalTypingContext,
    },
    common::{Heap, ModuleReference},
    errors::ErrorSet,
    parser,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn method_access_coverage_hack() {
    let mut heap = Heap::new();
    // method access can never be produced by the parser, but we need coverage anyways...
    let mut error_set = ErrorSet::new();
    ssa_analysis::perform_ssa_analysis_on_expression(
      &expr::E::MethodAccess(expr::MethodAccess {
        common: expr::ExpressionCommon::dummy(()),
        explicit_type_arguments: vec![test_builder::create().bool_annot()],
        inferred_type_arguments: vec![],
        object: Box::new(expr::E::Literal(expr::ExpressionCommon::dummy(()), Literal::Bool(true))),
        method_name: Id::from(heap.alloc_str_for_test("name")),
      }),
      &mut error_set,
    )
    .to_string(&heap);
  }

  #[test]
  fn expression_test() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let expr_str = r#"{
  val a: int = 3;
  val b = true;
  val c = a;
  val _ = if a && b then {
    match (!c) {
      Foo(d) -> d + a,
      Bar(_) -> b
    }
  } else {
    (p1: Foo, p2) -> Baz.ouch<Foo>(p2).ahha<Foo>(p1) + a
  };
  val a = 3;
  val {o1, o2 as o3} = {};
  o1 + o3
}"#;
    let (_, expr) = parser::parse_source_expression_from_text(
      expr_str,
      ModuleReference::dummy(),
      &mut heap,
      &mut error_set,
    );
    assert!(!error_set.has_errors());
    let expected = r#"
Unbound names: [Foo]
Invalid defines: [13:7-13:8]
Locally Scoped Defs:
10:10-12:4: []
11:5-11:57: [p1, p2]
14:24-14:26: []
1:1-16:2: [a, b, c, o1, o3]
5:26-10:4: []
7:7-7:23: [d]
8:7-8:18: []
Lambda Capture Locs: [11:5-11:57]
def_to_use_map:
11:15-11:17 -> [11:15-11:17, 11:36-11:38]
11:6-11:8 -> [11:50-11:52, 11:6-11:8]
13:7-13:8 -> [13:7-13:8]
14:18-14:20 -> [14:18-14:20, 15:8-15:10]
14:8-14:10 -> [14:8-14:10, 15:3-15:5]
2:7-2:8 -> [11:56-11:57, 2:7-2:8, 4:11-4:12, 5:14-5:15, 7:21-7:22]
3:7-3:8 -> [3:7-3:8, 5:19-5:20, 8:17-8:18]
4:7-4:8 -> [4:7-4:8, 6:13-6:14]
7:11-7:12 -> [7:11-7:12, 7:17-7:18]
"#
    .trim();
    let analysis_result = ssa_analysis::perform_ssa_analysis_on_expression(&expr, &mut error_set);
    assert_eq!(expected, analysis_result.to_string(&heap).trim());

    let builder = test_type_builder::create();
    let mut cx = LocalTypingContext::new(analysis_result);
    cx.write(Location::from_pos(1, 6, 1, 7), builder.bool_type());
    assert_eq!("bool", cx.read(&Location::from_pos(3, 10, 3, 11)).pretty_print(&heap));
    assert_eq!("any", cx.read(&Location::from_pos(3, 10, 3, 12)).pretty_print(&heap));
    assert_eq!(
      vec!["a"],
      cx.get_captured(&heap, &Location::from_pos(10, 4, 10, 56))
        .keys()
        .map(|l| l.as_str(&heap))
        .collect::<Vec<_>>()
    );
  }

  #[test]
  fn toplevel_tests() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let program_str = r#"
import { Pair } from stdlib.utils

interface Useless

interface Comparable<T> : Useless {
  method compare(other: T): int
}

class BoxedInt(val i: int) : Comparable<BoxedInt>, Useless {
  method compare(other: BoxedInt): int = this.i - other.i
}

class List<T: Comparable<T>>(Nil(unit), Cons(Pair<T, List<T>>)) {
  function <T: Comparable<T>> nil(): List<T> = {}
  function <T: Comparable<T>> of(t: T): List<T> = {}
  method cons(t: T): List<T> = this
  method iter(f: (T) -> unit): unit = {(v: List) -> {}}
  method sort(): List<T> = this
  private method <A> merge(other: List<T>): List<T> = this
}

class MultiInvalidDef<T, T> {}
"#;
    let module = parser::parse_source_module_from_text(
      program_str,
      ModuleReference::dummy(),
      &mut heap,
      &mut error_set,
    );
    assert!(!error_set.has_errors());
    let expected = r#"
Unbound names: []
Invalid defines: [23:26-23:27]
Locally Scoped Defs:
11:3-11:58: [other]
15:3-15:50: []
15:48-15:50: []
16:3-16:53: [t]
16:51-16:53: []
17:3-17:36: [t]
18:3-18:56: [f]
18:39-18:56: []
18:40-18:55: [v]
18:53-18:55: []
19:3-19:32: []
20:11-20:59: [other]
7:3-7:32: [other]
Lambda Capture Locs: [18:40-18:55]
def_to_use_map:
10:1-12:2 -> [10:1-12:2, 11:42-11:46]
10:20-10:21 -> [10:20-10:21]
10:7-10:15 -> [10:41-10:49, 10:7-10:15, 11:25-11:33]
11:10-11:17 -> [11:10-11:17]
11:18-11:23 -> [11:18-11:23, 11:51-11:56]
14:1-21:2 -> [14:1-21:2, 17:32-17:36, 19:28-19:32, 20:55-20:59]
14:12-14:13 -> [14:12-14:13, 14:26-14:27, 14:51-14:52, 14:59-14:60, 17:18-17:19, 17:27-17:28, 18:19-18:20, 19:23-19:24, 20:40-20:41, 20:50-20:51]
14:30-14:33 -> [14:30-14:33]
14:41-14:45 -> [14:41-14:45]
14:7-14:11 -> [14:54-14:61, 14:7-14:11, 15:38-15:45, 16:41-16:48, 17:22-17:29, 18:44-18:48, 19:18-19:25, 20:35-20:42, 20:45-20:52]
15:13-15:14 -> [15:13-15:14, 15:27-15:28, 15:43-15:44]
15:31-15:34 -> [15:31-15:34]
16:13-16:14 -> [16:13-16:14, 16:27-16:28, 16:37-16:38, 16:46-16:47]
16:31-16:33 -> [16:31-16:33]
16:34-16:35 -> [16:34-16:35]
17:10-17:14 -> [17:10-17:14]
17:15-17:16 -> [17:15-17:16]
18:10-18:14 -> [18:10-18:14]
18:15-18:16 -> [18:15-18:16]
18:41-18:42 -> [18:41-18:42]
19:10-19:14 -> [19:10-19:14]
20:19-20:20 -> [20:19-20:20]
20:22-20:27 -> [20:22-20:27]
20:28-20:33 -> [20:28-20:33]
23:1-23:31 -> [23:1-23:31]
23:23-23:24 -> [23:23-23:24]
23:26-23:27 -> [23:26-23:27]
23:7-23:22 -> [23:7-23:22]
2:10-2:14 -> [14:46-14:62, 2:10-2:14]
4:11-4:18 -> [10:52-10:59, 4:11-4:18, 6:27-6:34]
6:11-6:21 -> [10:30-10:40, 14:15-14:28, 15:16-15:29, 16:16-16:29, 6:11-6:21]
6:22-6:23 -> [6:22-6:23, 7:25-7:26]
7:10-7:17 -> [7:10-7:17]
7:18-7:23 -> [7:18-7:23]
"#
    .trim();
    let analysis_result =
      ssa_analysis::perform_ssa_analysis_on_module(&module, &heap, &mut error_set);
    assert_eq!(expected, analysis_result.to_string(&heap).trim());

    let builder = test_type_builder::create();
    let mut cx = LocalTypingContext::new(analysis_result);
    cx.write(Location::from_pos(13, 6, 13, 10), builder.bool_type());
    assert!(cx.get_captured(&heap, &Location::from_pos(17, 39, 17, 54)).is_empty());
  }
}
