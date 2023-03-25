use crate::ast::Location;
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet, VecDeque},
  rc::Rc,
};

enum ChangeWithoutLoc<'a, T> {
  Replace(&'a T, &'a T),
  Delete(&'a T),
  Insert { items: &'a [T], separator: Option<&'static str>, leading_separator: bool },
}

struct Change<'a, T> {
  location: Location,
  change: ChangeWithoutLoc<'a, T>,
}

/// differ based on http://www.xmailserver.org/diff2.pdf on page 6
mod list_differ {
  use super::*;

  enum Trace {
    Nil,
    Cons(usize, usize, Rc<Trace>),
  }

  /// Adds the match points in this snake to the trace and produces the endpoint along with the new trace.
  fn follow_snake<T: PartialEq>(
    old_list: &[T],
    new_list: &[T],
    mut x: usize,
    mut y: usize,
    mut trace: Rc<Trace>,
  ) -> (usize, usize, Rc<Trace>) {
    loop {
      match (old_list.get(x), new_list.get(y)) {
        (Some(e_x), Some(e_y)) if e_x.eq(e_y) => {
          trace = Rc::new(Trace::Cons(x, y, Rc::clone(&trace)));
          x += 1;
          y += 1;
        }
        _ => return (x, y, trace),
      }
    }
  }

  /// The shortest edit sequence problem is equivalent to finding the longest common subsequence,
  /// or equivalently the longest trace
  fn longest_trace<T: PartialEq>(old_list: &[T], new_list: &[T]) -> Vec<(usize, usize)> {
    let n = old_list.len();
    let m = new_list.len();
    // Keep track of all visited string locations so we don't duplicate work
    let mut visited: HashMap<(usize, usize), Rc<Trace>> = HashMap::with_capacity(m * n);
    let mut frontier = vec![];
    // Start with the basic trace, but follow a starting snake to a non-match point.
    let (init_x, init_y, init_trace) = follow_snake(old_list, new_list, 0, 0, Rc::new(Trace::Nil));
    frontier.push((init_x, init_y));
    visited.insert((init_x, init_y), init_trace);
    // The algorithm is a BFS, where every step is guaranteed to extend x or y coordinate by 1.
    // Thus, termination is guaranteed.
    loop {
      if let Some(mut final_trace) = visited.get(&(n, m)) {
        let mut list = vec![];
        while let Trace::Cons(x, y, next) = final_trace.as_ref() {
          list.push((*x, *y));
          final_trace = next;
        }
        list.reverse();
        return list;
      }
      let mut new_frontier = vec![];
      for (x, y) in frontier {
        let trace = visited.get(&(x, y)).unwrap();
        let (x_old, y_old, advance_in_old_list) =
          follow_snake(old_list, new_list, x + 1, y, Rc::clone(trace));
        let (x_new, y_new, advance_in_new_list) =
          follow_snake(old_list, new_list, x, y + 1, Rc::clone(trace));
        // If we have already visited this location, there is a shorter path to it,
        // so we don't store this trace.
        visited.entry((x_old, y_old)).or_insert_with(|| {
          new_frontier.push((x_old, y_old));
          advance_in_old_list
        });
        visited.entry((x_new, y_new)).or_insert_with(|| {
          new_frontier.push((x_new, y_new));
          advance_in_new_list
        });
      }
      frontier = new_frontier;
    }
  }

  fn cmp_change_ignore_content<T>(
    c1: &ChangeWithoutLoc<T>,
    c2: &ChangeWithoutLoc<T>,
  ) -> std::cmp::Ordering {
    match (c1, c2) {
      // Orders the change types alphabetically. This puts same-indexed inserts before deletes
      (ChangeWithoutLoc::Insert { .. }, ChangeWithoutLoc::Delete(_))
      | (ChangeWithoutLoc::Delete(_), ChangeWithoutLoc::Replace(_, _))
      | (ChangeWithoutLoc::Insert { .. }, ChangeWithoutLoc::Replace(_, _)) => {
        std::cmp::Ordering::Less
      }
      (ChangeWithoutLoc::Delete(_), ChangeWithoutLoc::Insert { .. })
      | (ChangeWithoutLoc::Replace(_, _), ChangeWithoutLoc::Delete(_))
      | (ChangeWithoutLoc::Replace(_, _), ChangeWithoutLoc::Insert { .. }) => {
        std::cmp::Ordering::Greater
      }
      (ChangeWithoutLoc::Replace(_, _), ChangeWithoutLoc::Replace(_, _))
      | (ChangeWithoutLoc::Delete(_), ChangeWithoutLoc::Delete(_))
      | (ChangeWithoutLoc::Insert { .. }, ChangeWithoutLoc::Insert { .. }) => {
        std::cmp::Ordering::Equal
      }
    }
  }

  fn cmp_indexed_change_without_loc<T>(
    (pos1, c1): &(i32, ChangeWithoutLoc<T>),
    (pos2, c2): &(i32, ChangeWithoutLoc<T>),
  ) -> std::cmp::Ordering {
    if pos1.ne(pos2) {
      pos1.cmp(pos2)
    } else {
      cmp_change_ignore_content(c1, c2)
    }
  }

  pub(super) fn compute<'a, T: PartialEq>(
    old_list: &'a [T],
    new_list: &'a [T],
  ) -> Vec<(i32, ChangeWithoutLoc<'a, T>)> {
    let trace = longest_trace(old_list, new_list);
    let trace_len = trace.len() as i32;
    let n = old_list.len();
    let m = new_list.len();
    // We start with delete script
    let mut script = (0..n)
      .into_iter()
      .collect::<HashSet<_>>()
      .difference(&trace.iter().map(|(x, _)| *x).collect::<HashSet<_>>())
      .sorted()
      .map(|pos| (*pos as i32, ChangeWithoutLoc::Delete(&old_list[*pos])))
      .collect_vec();

    // adds inserts at position x_k for values in new_list from y_k + 1 to y_(k + 1) - 1 for k
    // such that y_k + 1 < y_(k + 1)
    let mut k: i32 = -1;
    while k < trace_len {
      let first = if k == -1 { 0 } else { trace[k as usize].1 + 1 };
      let last = if k + 1 == trace_len { m } else { trace[(k + 1) as usize].1 };
      if first < last {
        let start = if k == -1 { -1 } else { trace[k as usize].0 as i32 };
        script.push((
          start,
          ChangeWithoutLoc::Insert {
            items: &new_list[first..last],
            separator: None,
            leading_separator: false,
          },
        ))
      }
      k += 1;
    }
    script.sort_by(cmp_indexed_change_without_loc);

    // Convert like-indexed deletes and inserts into a replacement. This relies
    // on the fact that sorting the script with our change_compare function will order all
    // Insert nodes before Deletes
    let mut old_script_queue = VecDeque::from(script);
    let mut new_script = vec![];
    while let Some(curr) = old_script_queue.pop_front() {
      match (curr, old_script_queue.pop_front()) {
        (
          (i1, ChangeWithoutLoc::Insert { items, separator, leading_separator: _ }),
          Some((i2, ChangeWithoutLoc::Delete(y))),
        ) if i1 == i2 - 1 => {
          new_script.push((i2, ChangeWithoutLoc::Replace(y, &items[0])));
          if items.len() > 1 {
            old_script_queue.push_front((
              i2,
              ChangeWithoutLoc::Insert { items: &items[1..], separator, leading_separator: true },
            ));
          }
        }
        (curr, Some(next)) => {
          old_script_queue.push_front(next);
          new_script.push(curr);
        }
        (curr, None) => {
          new_script.push(curr);
        }
      }
    }
    new_script
  }

  #[cfg(test)]
  mod tests {
    use crate::services::ast_differ::ChangeWithoutLoc;
    use itertools::Itertools;
    use pretty_assertions::assert_eq;

    #[test]
    fn cmp_tests() {
      super::cmp_change_ignore_content(
        &ChangeWithoutLoc::Delete(&1),
        &ChangeWithoutLoc::Replace(&1, &2),
      );
      super::cmp_change_ignore_content(
        &ChangeWithoutLoc::Replace(&1, &2),
        &ChangeWithoutLoc::Delete(&1),
      );
      super::cmp_change_ignore_content(
        &ChangeWithoutLoc::Delete(&1),
        &ChangeWithoutLoc::Delete(&1),
      );
      super::cmp_indexed_change_without_loc(
        &(0, ChangeWithoutLoc::Delete(&1)),
        &(0, ChangeWithoutLoc::Delete(&1)),
      );
    }

    fn diff_string<T: ToString + PartialEq>(old: &[T], new: &[T]) -> String {
      let mut collector = vec![];
      for change in super::compute(old, new).into_iter().map(|(_, c)| c) {
        match change {
          ChangeWithoutLoc::Replace(old, new) => {
            collector.push(format!("M {} -> {}", old.to_string(), new.to_string()))
          }
          ChangeWithoutLoc::Delete(v) => collector.push(format!("- {}", v.to_string())),
          ChangeWithoutLoc::Insert { items, separator: _, leading_separator: _ } => {
            collector.push(format!("+ {}", items.iter().map(|v| v.to_string()).join(",")));
          }
        }
      }
      collector.join("\n")
    }

    #[test]
    fn integration_tests() {
      assert_eq!("", diff_string::<i32>(&[], &[]));
      assert_eq!("M 1 -> 0", diff_string(&[1], &[0]));
      assert_eq!("+ 1", diff_string(&[], &[1]));
      assert_eq!("- 1", diff_string(&[1], &[]));
      assert_eq!("+ 2", diff_string(&[1], &[1, 2]));
      assert_eq!("- 2", diff_string(&[1, 2], &[1]));
      assert_eq!("M 1 -> 3\nM 2 -> 4", diff_string(&[1, 2], &[3, 4]));
      assert_eq!("M 1 -> 3\nM 2 -> 4", diff_string(&[1, 0, 2], &[3, 0, 4]));
      assert_eq!("M 1 -> 3\nM 2 -> 4\n+ 5", diff_string(&[1, 2], &[3, 4, 5]));
      assert_eq!("+ 2\n- 4", diff_string(&[1, 3, 4, 5], &[1, 2, 3, 5]));
      assert_eq!("M 22 -> 2\nM 4 -> 44", diff_string(&[1, 22, 3, 4, 5], &[1, 2, 3, 44, 5]));
      assert_eq!("M 22 -> 2\n+ 33", diff_string(&[1, 22, 3, 4, 5], &[1, 2, 33, 3, 4, 5]));
      assert_eq!("M foo -> bar", diff_string(&["foo"], &["bar"]));
    }
  }
}

/*

type node =
  | Raw of string
  | Comment of Loc.t Flow_ast.Comment.t
  | Literal of Loc.t * Loc.t Ast.Literal.t
  | StringLiteral of Loc.t * Loc.t Ast.StringLiteral.t
  | NumberLiteral of Loc.t * Loc.t Ast.NumberLiteral.t
  | BigIntLiteral of Loc.t * Loc.t Ast.BigIntLiteral.t
  | BooleanLiteral of Loc.t * Loc.t Ast.BooleanLiteral.t
  | Statement of ((Loc.t, Loc.t) Ast.Statement.t * statement_node_parent)
  | Program of (Loc.t, Loc.t) Ast.Program.t
  | Expression of ((Loc.t, Loc.t) Ast.Expression.t * expression_node_parent)
  | Pattern of (Loc.t, Loc.t) Ast.Pattern.t
  | Params of (Loc.t, Loc.t) Ast.Function.Params.t
  | Variance of Loc.t Ast.Variance.t
  | Type of (Loc.t, Loc.t) Flow_ast.Type.t
  | TypeParam of (Loc.t, Loc.t) Ast.Type.TypeParam.t
  | TypeAnnotation of (Loc.t, Loc.t) Flow_ast.Type.annotation
  | FunctionTypeAnnotation of (Loc.t, Loc.t) Flow_ast.Type.annotation
  | ClassProperty of (Loc.t, Loc.t) Flow_ast.Class.Property.t
  | ObjectProperty of (Loc.t, Loc.t) Flow_ast.Expression.Object.property
  | TemplateLiteral of Loc.t * (Loc.t, Loc.t) Ast.Expression.TemplateLiteral.t
  | JSXChild of (Loc.t, Loc.t) Ast.JSX.child
  | JSXIdentifier of (Loc.t, Loc.t) Ast.JSX.Identifier.t
 */
