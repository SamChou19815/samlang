#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, test_builder, ISourceType, Id},
      Location, ModuleReference,
    },
    checker::{ssa_analysis, typing_context::LocalTypingContext},
    common::boxed,
    errors::ErrorSet,
    parser,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn method_access_coverage_hack() {
    // method access can never be produced by the parser, but we need coverage anyways...
    let mut error_set = ErrorSet::new();
    let builder = test_builder::create();
    ssa_analysis::perform_ssa_analysis_on_expression(
      &expr::E::MethodAccess(expr::MethodAccess {
        common: builder.expr_common(builder.bool_type()),
        type_arguments: vec![builder.bool_type()],
        object: boxed(builder.true_expr()),
        method_name: Id::from("name"),
      }),
      &mut error_set,
    )
    .to_string();
  }

  #[test]
  fn expression_test() {
    let mut error_set = ErrorSet::new();
    let expr_str = r#"{
  val a: int = 3;
  val b = true;
  val c = a;
  val _ = if a && b then {
    match (!c) {
      | Foo d -> d + a
      | Bar _ -> b
    }
  } else {
    (p1: Foo, p2) -> Baz.ouch<Foo>(p2).ahha<Foo>(p1) + a
  };
  val a = 3;
  val {o1, o2 as o3} = {};
  o1 + o3
}"#;
    let expr = parser::parse_source_expression_from_text(
      expr_str,
      &ModuleReference::dummy(),
      &mut error_set,
    );
    assert!(!error_set.has_errors());
    let expected = r#"
Unbound names: [Foo]
Invalid defines: [13:7-13:8]
Lambda Capture Locs: [11:5-11:57]
def_to_use_map:
11:15-11:17 -> [11:36-11:38]
11:6-11:8 -> [11:50-11:52]
14:18-14:20 -> [15:8-15:10]
14:8-14:10 -> [15:3-15:5]
2:7-2:8 -> [11:56-11:57, 4:11-4:12, 5:14-5:15, 7:22-7:23]
3:7-3:8 -> [5:19-5:20, 8:18-8:19]
4:7-4:8 -> [6:13-6:14]
7:13-7:14 -> [7:18-7:19]
"#
    .trim();
    let analysis_result = ssa_analysis::perform_ssa_analysis_on_expression(&expr, &mut error_set);
    assert_eq!(expected, analysis_result.to_string().trim());

    let builder = test_builder::create();
    let mut cx = LocalTypingContext::new(analysis_result);
    cx.write(Location::from_pos(1, 6, 1, 7), builder.bool_type());
    assert_eq!("bool", cx.read(&Location::from_pos(3, 10, 3, 11)).pretty_print());
    assert_eq!("unknown", cx.read(&Location::from_pos(3, 10, 3, 12)).pretty_print());
    assert_eq!(
      vec!["a"],
      cx.get_captured(&Location::from_pos(10, 4, 10, 56))
        .keys()
        .map(|l| l.to_string())
        .collect::<Vec<_>>()
    );
  }

  #[test]
  fn toplevel_tests() {
    let mut error_set = ErrorSet::new();
    let program_str = r#"
import { Pair } from tests.StdLib

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
    let module =
      parser::parse_source_module_from_text(program_str, &ModuleReference::dummy(), &mut error_set);
    assert!(!error_set.has_errors());
    let expected = r#"
Unbound names: []
Invalid defines: [23:26-23:27]
Lambda Capture Locs: [18:40-18:55]
def_to_use_map:
10:1-12:2 -> [11:42-11:46]
10:7-10:15 -> [10:41-10:49, 11:25-11:33]
11:18-11:23 -> [11:51-11:56]
14:1-21:2 -> [17:32-17:36, 19:28-19:32, 20:55-20:59]
14:12-14:13 -> [14:26-14:27, 14:51-14:52, 14:59-14:60, 17:18-17:19, 17:27-17:28, 18:19-18:20, 19:23-19:24, 20:40-20:41, 20:50-20:51]
14:7-14:11 -> [14:54-14:61, 15:38-15:45, 16:41-16:48, 17:22-17:29, 18:44-18:48, 19:18-19:25, 20:35-20:42, 20:45-20:52]
15:13-15:14 -> [15:27-15:28, 15:43-15:44]
16:13-16:14 -> [16:27-16:28, 16:37-16:38, 16:46-16:47]
2:10-2:14 -> [14:46-14:62]
4:11-4:18 -> [10:52-10:59, 6:27-6:34]
6:11-6:21 -> [10:30-10:50, 14:15-14:28, 15:16-15:29, 16:16-16:29]
6:22-6:23 -> [7:25-7:26]
"#
    .trim();
    let analysis_result = ssa_analysis::perform_ssa_analysis_on_module(&module, &mut error_set);
    assert_eq!(expected, analysis_result.to_string().trim());

    let builder = test_builder::create();
    let mut cx = LocalTypingContext::new(analysis_result);
    cx.write(Location::from_pos(13, 6, 13, 10), builder.bool_type());
    assert!(cx
      .get_captured(&Location::from_pos(17, 39, 17, 54))
      .iter()
      .collect::<Vec<_>>()
      .is_empty());
  }
}
