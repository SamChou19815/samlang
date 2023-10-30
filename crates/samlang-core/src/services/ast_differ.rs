use crate::{
  ast::{
    source::{annotation, expr, CommentStore, Module, ModuleMembersImport, Toplevel},
    Location,
  },
  printer,
};
use itertools::Itertools;
use samlang_heap::{Heap, ModuleReference};
use std::{
  collections::{HashMap, HashSet, VecDeque},
  rc::Rc,
};

enum ChangeWithoutLoc<'a, T> {
  Replace(&'a T, &'a T),
  Delete(&'a T),
  Insert { items: &'a [T], separator: Option<&'static str>, leading_separator: bool },
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

  fn cmp_change_type_to_int<T>(c: &ChangeWithoutLoc<T>) -> i32 {
    match c {
      ChangeWithoutLoc::Insert { .. } => 1,
      ChangeWithoutLoc::Delete(_) => 2,
      ChangeWithoutLoc::Replace(_, _) => 3,
    }
  }

  fn cmp_indexed_change_without_loc<T>(
    (pos1, c1): &(i32, ChangeWithoutLoc<T>),
    (pos2, c2): &(i32, ChangeWithoutLoc<T>),
  ) -> std::cmp::Ordering {
    pos1.cmp(pos2).then(cmp_change_type_to_int(c1).cmp(&cmp_change_type_to_int(c2)))
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
      super::cmp_change_type_to_int(&ChangeWithoutLoc::Delete(&1));
      super::cmp_change_type_to_int(&ChangeWithoutLoc::Replace(&1, &2));
      super::cmp_change_type_to_int(&ChangeWithoutLoc::Insert {
        items: &[1],
        separator: None,
        leading_separator: false,
      });
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
    }
  }
}

enum DiffNode<'a> {
  Annotation(&'a annotation::T),
  Expression(&'a expr::E<()>),
  Statement(&'a expr::DeclarationStatement<()>),
  Import(&'a ModuleMembersImport),
  Toplevel(&'a Toplevel<()>),
}

impl DiffNode<'_> {
  fn location(&self) -> Location {
    match self {
      DiffNode::Annotation(n) => n.location(),
      DiffNode::Expression(n) => n.loc(),
      DiffNode::Statement(n) => n.loc,
      DiffNode::Import(n) => n.loc,
      DiffNode::Toplevel(n) => n.loc(),
    }
  }

  fn printed(&self, heap: &Heap, comment_store: &CommentStore) -> String {
    match self {
      DiffNode::Annotation(n) => printer::pretty_print_annotation(heap, 100, comment_store, n),
      DiffNode::Expression(n) => printer::pretty_print_expression(heap, 100, comment_store, n),
      DiffNode::Statement(n) => printer::pretty_print_statement(heap, 100, comment_store, n),
      DiffNode::Import(n) => printer::pretty_print_import(heap, 100, n),
      DiffNode::Toplevel(n) => printer::pretty_print_toplevel(heap, 100, comment_store, n),
    }
  }
}

enum Change<'a> {
  Replace(DiffNode<'a>, DiffNode<'a>),
  Delete(DiffNode<'a>),
  Insert {
    location: Location,
    items: Vec<DiffNode<'a>>,
    separator: Option<&'static str>,
    leading_separator: bool,
  },
}

impl Change<'_> {
  fn to_edit(&self, heap: &Heap, comment_store: &CommentStore) -> (Location, String) {
    match self {
      Change::Replace(old, new) => {
        (old.location(), new.printed(heap, comment_store).trim_end().to_string())
      }
      Change::Delete(node) => (node.location(), "".to_string()),
      Change::Insert { location, items, separator, leading_separator } => {
        let separator = separator.unwrap_or("\n");
        let mut collector = String::new();
        if *leading_separator {
          collector.push_str(separator);
        }
        for (i, item) in items.iter().enumerate() {
          collector.push_str(item.printed(heap, comment_store).trim_end());
          if i + 1 < items.len() {
            collector.push_str(separator);
          }
        }
        (*location, collector)
      }
    }
  }
}

fn wrapped_list_diff<
  'a,
  T: PartialEq,
  ToNode: Fn(&'a T) -> DiffNode<'a>,
  FlatMapChange: Fn(&'a T, &'a T) -> Option<Vec<Change<'a>>>,
>(
  old_list: &'a [T],
  new_list: &'a [T],
  to_diff_node: &ToNode,
  flat_map_change: FlatMapChange,
) -> Result<Vec<Change<'a>>, (Vec<DiffNode<'a>>, bool)> {
  let unwrapped = list_differ::compute(old_list, new_list);
  let mut wrapped = vec![];
  for (insert_index, change_without_loc) in unwrapped {
    match change_without_loc {
      ChangeWithoutLoc::Replace(old, new) => {
        if let Some(mut diffs) = flat_map_change(old, new) {
          wrapped.append(&mut diffs);
        } else {
          wrapped.push(Change::Replace(to_diff_node(old), to_diff_node(new)));
        }
      }
      ChangeWithoutLoc::Delete(old) => wrapped.push(Change::Delete(to_diff_node(old))),
      ChangeWithoutLoc::Insert { items, separator, leading_separator } => {
        let items = items.iter().map(to_diff_node).collect_vec();
        let location = if insert_index == -1 {
          if old_list.is_empty() {
            return Err((items, leading_separator));
          }
          let mut loc = to_diff_node(&old_list[0]).location();
          loc.end = loc.start;
          loc
        } else {
          let mut loc = to_diff_node(&old_list[insert_index as usize]).location();
          loc.start = loc.end;
          loc
        };
        wrapped.push(Change::Insert { location, items, separator, leading_separator });
      }
    }
  }
  Ok(wrapped)
}

fn generic_non_recursive_compute_diff<'a, T>(_old: &'a T, _new: &'a T) -> Option<Vec<Change<'a>>> {
  None
}

fn compute_toplevel_diff<'a>(
  old: &'a Toplevel<()>,
  new: &'a Toplevel<()>,
) -> Option<Vec<Change<'a>>> {
  if !(old.is_class() ^ new.is_class()) {
    return None;
  }

  // Better implementation pending. So far we just need imports diff
  Some(vec![Change::Replace(DiffNode::Toplevel(old), DiffNode::Toplevel(new))])
}

fn compute_module_diff<'a>(
  module_reference: ModuleReference,
  old: &'a Module<()>,
  new: &'a Module<()>,
) -> Option<Vec<Change<'a>>> {
  if old.comment_store.ne(&new.comment_store) {
    // When the comment store is different, per node diffing can be dangerous.
    // Therefore, we choose to give up and replace the entire module.
    return None;
  }
  let mut diffs = match wrapped_list_diff(
    &old.imports,
    &new.imports,
    &DiffNode::Import,
    generic_non_recursive_compute_diff,
  ) {
    Ok(d) => d,
    Err((items, leading_separator)) => {
      vec![Change::Insert {
        location: Location::document_start(module_reference),
        items,
        separator: None,
        leading_separator,
      }]
    }
  };
  match wrapped_list_diff(
    &old.toplevels,
    &new.toplevels,
    &DiffNode::Toplevel,
    compute_toplevel_diff,
  ) {
    Ok(mut new_diff) => diffs.append(&mut new_diff),
    Err((items, leading_separator)) => diffs.push(Change::Insert {
      location: if let Some(last_old_import) = old.imports.last() {
        let mut loc = last_old_import.loc;
        loc.start = loc.end;
        loc
      } else {
        Location::document_start(module_reference)
      },
      items,
      separator: None,
      leading_separator,
    }),
  }
  Some(diffs)
}

pub(super) fn compute_module_diff_edits(
  heap: &Heap,
  module_reference: ModuleReference,
  old: &Module<()>,
  new: &Module<()>,
) -> Vec<(Location, String)> {
  if let Some(diff) = compute_module_diff(module_reference, old, new) {
    diff.iter().map(|c| c.to_edit(heap, &new.comment_store)).collect()
  } else {
    vec![(
      Location::full_document(module_reference),
      printer::pretty_print_source_module(heap, 100, new),
    )]
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::source::{test_builder, Id, InterfaceDeclarationCommon, NO_COMMENT_REFERENCE},
    errors::ErrorSet,
    parser,
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::PStr;

  #[test]
  fn change_to_edit_tests() {
    let heap = &mut Heap::new();
    let builder = test_builder::create();

    assert_eq!(
      "",
      Change::Delete(DiffNode::Annotation(&builder.bool_annot()))
        .to_edit(heap, &CommentStore::new())
        .1
    );
    assert_eq!(
      "bool",
      Change::Replace(
        DiffNode::Annotation(&builder.bool_annot()),
        DiffNode::Annotation(&builder.bool_annot())
      )
      .to_edit(heap, &CommentStore::new())
      .1
    );
    assert_eq!(
      "bool,bool",
      Change::Insert {
        location: Location::dummy(),
        items: vec![
          DiffNode::Annotation(&builder.bool_annot()),
          DiffNode::Annotation(&builder.bool_annot())
        ],
        separator: Some(","),
        leading_separator: false
      }
      .to_edit(heap, &CommentStore::new())
      .1
    );
    assert_eq!(
      "\nbool\nbool",
      Change::Insert {
        location: Location::dummy(),
        items: vec![
          DiffNode::Annotation(&builder.bool_annot()),
          DiffNode::Annotation(&builder.bool_annot())
        ],
        separator: None,
        leading_separator: true
      }
      .to_edit(heap, &CommentStore::new())
      .1
    );

    let expression =
      expr::E::LocalId(expr::ExpressionCommon::dummy(()), Id::from(heap.alloc_str_for_test("s")));
    assert_eq!(
      "s",
      Change::Replace(DiffNode::Expression(&expression), DiffNode::Expression(&expression))
        .to_edit(heap, &CommentStore::new())
        .1
    );

    let stmt = expr::DeclarationStatement {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      pattern: crate::ast::source::pattern::MatchingPattern::Id(
        Id::from(heap.alloc_str_for_test("v")),
        (),
      ),
      annotation: Some(builder.bool_annot()),
      assigned_expression: Box::new(expr::E::LocalId(
        expr::ExpressionCommon::dummy(()),
        Id::from(heap.alloc_str_for_test("s")),
      )),
    };
    assert_eq!(
      "let v: bool = s;",
      Change::Replace(DiffNode::Statement(&stmt), DiffNode::Statement(&stmt))
        .to_edit(heap, &CommentStore::new())
        .1
    );

    let import = ModuleMembersImport {
      loc: Location::dummy(),
      imported_members: vec![Id::from(PStr::UPPER_A)],
      imported_module: ModuleReference::DUMMY,
      imported_module_loc: Location::dummy(),
    };
    assert_eq!(
      "import { A } from DUMMY;",
      Change::Replace(DiffNode::Import(&import), DiffNode::Import(&import))
        .to_edit(heap, &CommentStore::new())
        .1
    );

    let toplevel = Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      private: false,
      name: Id::from(PStr::UPPER_A),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![],
    });
    assert_eq!(
      "interface A",
      Change::Replace(DiffNode::Toplevel(&toplevel), DiffNode::Toplevel(&toplevel))
        .to_edit(heap, &CommentStore::new())
        .1
    );
  }

  fn produce_module_diff(old_source: &str, new_source: &str) -> Vec<(String, String)> {
    let heap = &mut Heap::new();
    let error_set = &mut ErrorSet::new();
    let old =
      parser::parse_source_module_from_text(old_source, ModuleReference::DUMMY, heap, error_set);
    let new =
      parser::parse_source_module_from_text(new_source, ModuleReference::DUMMY, heap, error_set);
    assert!(!error_set.has_errors());
    compute_module_diff_edits(heap, ModuleReference::DUMMY, &old, &new)
      .into_iter()
      .map(|(loc, edit)| (loc.pretty_print_without_file(), edit))
      .collect()
  }

  #[test]
  fn toplevel_module_diff_tests() {
    assert_eq!(
      vec![(
        Location::full_document(ModuleReference::DUMMY).pretty_print_without_file(),
        "".to_string()
      )],
      produce_module_diff("// a", "")
    );
    assert_eq!(
      vec![(
        Location::full_document(ModuleReference::DUMMY).pretty_print_without_file(),
        "/* B */\nclass A\n".to_string()
      )],
      produce_module_diff("/* A */ class A {}", "/* B */ class A {}")
    );

    assert!(produce_module_diff(
      "import {Foo} from Bar\nclass A{}",
      "import {Foo} from Bar\nclass A{}"
    )
    .is_empty());
    assert_eq!(
      vec![("1:1-1:1".to_string(), "import { Foo } from Bar;".to_string())],
      produce_module_diff("", "import {Foo} from Bar")
    );
    assert_eq!(
      vec![("1:1-1:24".to_string(), "import { Foo1 } from Bar;".to_string())],
      produce_module_diff("import { Foo } from Bar", "import {Foo1} from Bar")
    );
    assert_eq!(
      vec![("1:22-1:22".to_string(), "import { Foo } from Bar;".to_string())],
      produce_module_diff("import {Foo} from Bar", "import {Foo} from Bar\nimport {Foo} from Bar")
    );
    assert_eq!(
      vec![("1:1-1:1".to_string(), "class A".to_string())],
      produce_module_diff("", "class A {}")
    );
    assert_eq!(
      vec![("1:22-1:22".to_string(), "class A".to_string())],
      produce_module_diff("import {Foo} from Bar", "import {Foo} from Bar\nclass A {}")
    );
    assert_eq!(
      vec![("1:1-1:11".to_string(), "class B".to_string())],
      produce_module_diff("class A {}", "class B {}")
    );
    assert_eq!(
      vec![("1:1-1:11".to_string(), "interface A".to_string())],
      produce_module_diff("class A {}", "interface A {}")
    );
    assert_eq!(
      vec![("1:11-1:11".to_string(), "class B".to_string())],
      produce_module_diff("class A {}", "class A {}\nclass B {}")
    );
    assert_eq!(
      vec![("2:1-2:1".to_string(), "class A".to_string())],
      produce_module_diff(
        "          \nclass B {}\nclass C {}\nclass D {}",
        "class A {}\nclass B {}\nclass C {}\nclass D {}"
      )
    );
    assert_eq!(
      vec![("1:1-1:11".to_string(), "".to_string())],
      produce_module_diff("class A {}", "")
    );
  }
}
