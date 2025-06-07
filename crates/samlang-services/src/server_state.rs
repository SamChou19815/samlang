use super::{dep_graph::DependencyGraph, gc::perform_gc_after_recheck};
use samlang_ast::source::Module;
use samlang_checker::{
  build_module_signature,
  type_::{GlobalSignature, Type},
  type_check_module, type_check_sources,
};
use samlang_errors::{CompileTimeError, ErrorSet};
use samlang_heap::{Heap, ModuleReference};
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

pub struct ServerState {
  pub heap: Heap,
  enable_profiling: bool,
  pub string_sources: HashMap<ModuleReference, String>,
  pub(super) parsed_modules: HashMap<ModuleReference, Module<()>>,
  dep_graph: DependencyGraph,
  pub(super) checked_modules: HashMap<ModuleReference, Module<Rc<Type>>>,
  pub(super) global_cx: GlobalSignature,
  pub(super) errors: HashMap<ModuleReference, Vec<CompileTimeError>>,
}

impl ServerState {
  pub fn new(
    mut heap: Heap,
    enable_profiling: bool,
    string_sources: HashMap<ModuleReference, String>,
  ) -> ServerState {
    samlang_profiling::measure_time(enable_profiling, "LSP Init", || {
      let mut error_set = ErrorSet::new();
      let parsed_modules = string_sources
        .iter()
        .map(|(mod_ref, text)| {
          (
            *mod_ref,
            samlang_parser::parse_source_module_from_text(
              text,
              *mod_ref,
              &mut heap,
              &mut error_set,
            ),
          )
        })
        .collect::<HashMap<_, _>>();
      let dep_graph = DependencyGraph::new(&parsed_modules);
      let (checked_modules, global_cx) = type_check_sources(&parsed_modules, &mut error_set);
      let errors = error_set.group_errors();
      ServerState {
        heap,
        enable_profiling,
        string_sources,
        parsed_modules,
        dep_graph,
        checked_modules,
        global_cx,
        errors,
      }
    })
  }

  /// Preconditions:
  /// - Parsed modules updated
  /// - Global context updated
  /// - Dependency graph updated
  /// - recheck_set is the conservative estimate of moduled need to recheck
  fn recheck(&mut self, mut error_set: ErrorSet, recheck_set: &HashSet<ModuleReference>) {
    // Type Checking
    for recheck_mod_ref in recheck_set {
      if let Some(parsed) = self.parsed_modules.get(recheck_mod_ref) {
        let (checked, _) =
          type_check_module(*recheck_mod_ref, parsed, &self.global_cx, &mut error_set);
        self.checked_modules.insert(*recheck_mod_ref, checked);
      }
    }

    // Collating Errors
    let mut grouped_errors = error_set.group_errors();
    for rechecked_module in recheck_set {
      if !grouped_errors.contains_key(rechecked_module) {
        grouped_errors.insert(*rechecked_module, vec![]);
      }
    }
    for (mod_ref, mod_scoped_errors) in grouped_errors {
      self.errors.insert(mod_ref, mod_scoped_errors);
    }

    // GC
    samlang_profiling::measure_time(self.enable_profiling, "GC", || {
      perform_gc_after_recheck(
        &mut self.heap,
        &self.checked_modules,
        self.checked_modules.keys().copied().collect(),
      )
    });
  }

  pub fn all_modules(&self) -> Vec<&ModuleReference> {
    self.parsed_modules.keys().collect()
  }

  pub fn get_errors(&self, module_reference: &ModuleReference) -> &[CompileTimeError] {
    if let Some(errors) = self.errors.get(module_reference) { errors.as_slice() } else { &[] }
  }

  #[cfg(test)]
  pub(super) fn get_error_dump(&self) -> String {
    ErrorSet::pretty_print_from_grouped_error_messages_for_tests(
      &self.heap,
      &self.string_sources,
      &self.errors,
    )
  }

  pub fn update(&mut self, updates: Vec<(ModuleReference, String)>) {
    let mut error_set = ErrorSet::new();
    let initial_update_set = updates.iter().map(|(m, _)| *m).collect::<HashSet<_>>();
    for (mod_ref, source_code) in updates {
      let parsed = samlang_parser::parse_source_module_from_text(
        &source_code,
        mod_ref,
        &mut self.heap,
        &mut error_set,
      );
      self.global_cx.insert(mod_ref, build_module_signature(mod_ref, &parsed));
      self.string_sources.insert(mod_ref, source_code);
      self.parsed_modules.insert(mod_ref, parsed);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    let recheck_set = self.dep_graph.affected_set(initial_update_set);
    self.recheck(error_set, &recheck_set);
  }

  pub fn rename_module(&mut self, renames: Vec<(ModuleReference, ModuleReference)>) {
    let mut error_set = ErrorSet::new();
    let recheck_set = self
      .dep_graph
      .affected_set(renames.iter().flat_map(|(a, b)| vec![*a, *b].into_iter()).collect());
    for (old_mod_ref, new_mod_ref) in renames {
      if let Some(source) = self.string_sources.remove(&old_mod_ref) {
        self.parsed_modules.remove(&old_mod_ref).unwrap();
        let parsed = samlang_parser::parse_source_module_from_text(
          &source,
          new_mod_ref,
          &mut self.heap,
          &mut error_set,
        );
        self.string_sources.insert(new_mod_ref, source);
        self.parsed_modules.insert(new_mod_ref, parsed);
        let mod_cx = self.global_cx.remove(&old_mod_ref).unwrap();
        self.global_cx.insert(new_mod_ref, mod_cx);
      }
      self.checked_modules.remove(&old_mod_ref);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    self.recheck(error_set, &recheck_set);
  }

  pub fn remove(&mut self, module_references: &[ModuleReference]) {
    let recheck_set = self.dep_graph.affected_set(module_references.iter().copied().collect());
    for mod_ref in module_references {
      self.string_sources.remove(mod_ref);
      self.parsed_modules.remove(mod_ref);
      self.checked_modules.remove(mod_ref);
      self.global_cx.remove(mod_ref);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    self.recheck(ErrorSet::new(), &recheck_set);
  }
}

#[cfg(test)]
mod tests {
  use super::ServerState;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, ModuleReference};
  use std::collections::HashMap;

  #[test]
  fn update_tests() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["test".to_string()]);
    let mut service = ServerState::new(heap, false, HashMap::new());
    service.update(vec![(
      test_mod_ref,
      r#"
class Test {
  function test(): int = "haha"
}
interface I { method test(): int }
"#
      .to_string(),
    )]);

    assert_eq!(1, service.all_modules().len());
    assert!(service.get_errors(&ModuleReference::ROOT).is_empty());
    assert_eq!(
      r#"
Error ----------------------------------- test.sam:3:26-3:32

`Str` [1] is incompatible with `int` [2].

  3|   function test(): int = "haha"
                              ^^^^^^

  [1] test.sam:3:26-3:32
  ----------------------
  3|   function test(): int = "haha"
                              ^^^^^^

  [2] test.sam:3:20-3:23
  ----------------------
  3|   function test(): int = "haha"
                        ^^^

"#
      .trim(),
      service.get_error_dump().trim()
    );

    service.remove(&[test_mod_ref]);
    assert!(service.get_errors(&test_mod_ref).is_empty());
  }

  #[test]
  fn dependency_tests() {
    let mut heap = Heap::new();
    let test1_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test1".to_string()]);
    let test2_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test2".to_string()]);
    let mut service = ServerState::new(
      heap,
      false,
      HashMap::from([
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
  function test(): Str = 3
}
"#
          .to_string(),
        ),
      ]),
    );

    assert_eq!(
      r#"
Error ---------------------------------- Test1.sam:3:26-3:32

`Str` [1] is incompatible with `int` [2].

  3|   function test(): int = "haha"
                              ^^^^^^

  [1] Test1.sam:3:26-3:32
  -----------------------
  3|   function test(): int = "haha"
                              ^^^^^^

  [2] Test1.sam:3:20-3:23
  -----------------------
  3|   function test(): int = "haha"
                        ^^^


Error ---------------------------------- Test2.sam:2:17-2:22

There is no `Test2` export in `Test1`.

  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ----------------------------------- Test2.sam:4:7-4:12

Name `Test2` collides with a previously defined name at [1].

  4| class Test2 {
           ^^^^^

  [1] Test2.sam:2:17-2:22
  -----------------------
  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ---------------------------------- Test2.sam:5:26-5:27

`int` [1] is incompatible with `Str` [2].

  5|   function test(): Str = 3
                              ^

  [1] Test2.sam:5:26-5:27
  -----------------------
  5|   function test(): Str = 3
                              ^

  [2] Test2.sam:5:20-5:23
  -----------------------
  5|   function test(): Str = 3
                        ^^^
"#
      .trim(),
      service.get_error_dump().trim()
    );

    // Adding Test2 can clear one error of its reverse dependency.
    service.update(vec![(
      test1_mod_ref,
      r#"
class Test1 {
  function test(): int = "haha"
}
class Test2 {}
"#
      .to_string(),
    )]);
    assert_eq!(
      r#"Error ---------------------------------- Test1.sam:3:26-3:32

`Str` [1] is incompatible with `int` [2].

  3|   function test(): int = "haha"
                              ^^^^^^

  [1] Test1.sam:3:26-3:32
  -----------------------
  3|   function test(): int = "haha"
                              ^^^^^^

  [2] Test1.sam:3:20-3:23
  -----------------------
  3|   function test(): int = "haha"
                        ^^^


Error ----------------------------------- Test2.sam:4:7-4:12

Name `Test2` collides with a previously defined name at [1].

  4| class Test2 {
           ^^^^^

  [1] Test2.sam:2:17-2:22
  -----------------------
  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ---------------------------------- Test2.sam:5:26-5:27

`int` [1] is incompatible with `Str` [2].

  5|   function test(): Str = 3
                              ^

  [1] Test2.sam:5:26-5:27
  -----------------------
  5|   function test(): Str = 3
                              ^

  [2] Test2.sam:5:20-5:23
  -----------------------
  5|   function test(): Str = 3
                        ^^^
    "#
      .trim(),
      service.get_error_dump().trim()
    );

    // Clearing local error of Test1
    service.update(vec![(
      test1_mod_ref,
      r#"
class Test1 {
  function test(): int = 3
}
"#
      .to_string(),
    )]);
    assert_eq!(
      r#"
Error ---------------------------------- Test2.sam:2:17-2:22

There is no `Test2` export in `Test1`.

  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ----------------------------------- Test2.sam:4:7-4:12

Name `Test2` collides with a previously defined name at [1].

  4| class Test2 {
           ^^^^^

  [1] Test2.sam:2:17-2:22
  -----------------------
  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ---------------------------------- Test2.sam:5:26-5:27

`int` [1] is incompatible with `Str` [2].

  5|   function test(): Str = 3
                              ^

  [1] Test2.sam:5:26-5:27
  -----------------------
  5|   function test(): Str = 3
                              ^

  [2] Test2.sam:5:20-5:23
  -----------------------
  5|   function test(): Str = 3
                        ^^^
"#
      .trim(),
      service.get_error_dump().trim()
    );

    // Clearing local error of Test2
    service.update(vec![(
      test2_mod_ref,
      r#"
import { Test1, Test2 } from Test1

class Test2 {
  function test(): Str = "haha"
}
"#
      .to_string(),
    )]);
    assert_eq!(
      r#"
Error ---------------------------------- Test2.sam:2:17-2:22

There is no `Test2` export in `Test1`.

  2| import { Test1, Test2 } from Test1
                     ^^^^^


Error ----------------------------------- Test2.sam:4:7-4:12

Name `Test2` collides with a previously defined name at [1].

  4| class Test2 {
           ^^^^^

  [1] Test2.sam:2:17-2:22
  -----------------------
  2| import { Test1, Test2 } from Test1
                     ^^^^^
"#
      .trim(),
      service.get_error_dump().trim()
    );

    // Clearing all errors of Test2
    service.update(vec![(
      test2_mod_ref,
      r#"
import { Test1 } from Test1

class Test2 {
  function test(): Str = "haha"
}
"#
      .to_string(),
    )]);
    assert!(service.get_errors(&test1_mod_ref).is_empty());
    assert!(service.get_errors(&test2_mod_ref).is_empty());
  }

  #[test]
  fn rename_mod_ref_tests() {
    let mut heap = Heap::new();
    let test_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]);
    let a_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let b_mod_ref = heap.alloc_module_reference_from_string_vec(vec!["B".to_string()]);
    let mut service = ServerState::new(
      heap,
      false,
      HashMap::from([
        (test_mod_ref, "import {A} from A\nimport {A} from B".to_string()),
        (a_mod_ref, "class A {}".to_string()),
      ]),
    );

    assert_eq!(
      r#"
Error ------------------------------------ Test.sam:2:1-2:18

Cannot resolve module `B`.

  2| import {A} from B
     ^^^^^^^^^^^^^^^^^


Error ------------------------------------ Test.sam:2:9-2:10

Name `A` collides with a previously defined name at [1].

  2| import {A} from B
             ^

  [1] Test.sam:1:9-1:10
  ---------------------
  1| import {A} from A
             ^
"#
      .trim(),
      service.get_error_dump().trim()
    );

    service.rename_module(vec![(a_mod_ref, b_mod_ref)]);
    assert_eq!(
      r#"
Error ------------------------------------ Test.sam:1:1-1:18

Cannot resolve module `A`.

  1| import {A} from A
     ^^^^^^^^^^^^^^^^^


Error ------------------------------------ Test.sam:2:9-2:10

Name `A` collides with a previously defined name at [1].

  2| import {A} from B
             ^

  [1] Test.sam:1:9-1:10
  ---------------------
  1| import {A} from A
             ^
"#
      .trim(),
      service.get_error_dump().trim()
    );

    service.rename_module(vec![(ModuleReference::DUMMY, test_mod_ref)]);
    assert_eq!(
      r#"
Error ------------------------------------ Test.sam:1:1-1:18

Cannot resolve module `A`.

  1| import {A} from A
     ^^^^^^^^^^^^^^^^^


Error ------------------------------------ Test.sam:2:9-2:10

Name `A` collides with a previously defined name at [1].

  2| import {A} from B
             ^

  [1] Test.sam:1:9-1:10
  ---------------------
  1| import {A} from A
             ^
"#
      .trim(),
      service.get_error_dump().trim()
    );
  }
}
