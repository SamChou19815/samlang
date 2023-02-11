use crate::{
  ast::source::Module,
  common::{Heap, ModuleReference},
  errors::ErrorSet,
};
use std::collections::{HashMap, HashSet};

pub(super) fn check_undefined_imports_error(
  sources: &HashMap<ModuleReference, Module>,
  heap: &Heap,
  error_set: &mut ErrorSet,
  module: &Module,
) {
  for one_import in module.imports.iter() {
    if let Some(available_members) = sources.get(&one_import.imported_module) {
      let mut available_members_set = HashSet::new();
      for c in available_members.toplevels.iter() {
        available_members_set.insert(c.name().name);
      }
      for id in one_import.imported_members.iter() {
        if !available_members_set.contains(&id.name) {
          error_set.report_unresolved_name_error(id.loc, id.name.as_str(heap).to_string());
        }
      }
    } else {
      error_set.report_unresolved_name_error(
        one_import.loc,
        one_import.imported_module.pretty_print(heap),
      );
    }
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{
        CommentStore, Id, InterfaceDeclarationCommon, Module, ModuleMembersImport, Toplevel,
        NO_COMMENT_REFERENCE,
      },
      Location,
    },
    common::{Heap, ModuleReference, PStr},
    errors::ErrorSet,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::collections::HashMap;

  fn mock_class(name: PStr) -> Toplevel {
    Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(name),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![],
    })
  }

  fn mock_module(
    heap: &mut Heap,
    name: &'static str,
    imports: Vec<(&'static str, Vec<&'static str>)>,
    members: Vec<&'static str>,
  ) -> (ModuleReference, Module) {
    (
      heap.alloc_module_reference_from_string_vec(vec![name.to_string()]),
      Module {
        comment_store: CommentStore::new(),
        imports: imports
          .into_iter()
          .map(|(imported_mod_name, imported_member_strs)| {
            let mut loc = Location::dummy();
            loc.module_reference =
              heap.alloc_module_reference_from_string_vec(vec![name.to_string()]);
            let mut imported_members = vec![];
            for m in imported_member_strs {
              imported_members.push(Id {
                loc,
                associated_comments: NO_COMMENT_REFERENCE,
                name: heap.alloc_str(m),
              });
            }
            ModuleMembersImport {
              loc,
              imported_members,
              imported_module: heap
                .alloc_module_reference_from_string_vec(vec![imported_mod_name.to_string()]),
              imported_module_loc: loc,
            }
          })
          .collect_vec(),
        toplevels: members.into_iter().map(|n| mock_class(heap.alloc_str(n))).collect_vec(),
      },
    )
  }

  fn assert_expected_errors(
    sources: HashMap<ModuleReference, Module>,
    heap: &mut Heap,
    expected_errors: Vec<&'static str>,
  ) {
    let mut error_set = ErrorSet::new();
    for m in sources.values() {
      super::check_undefined_imports_error(&sources, heap, &mut error_set, m);
    }
    assert_eq!(expected_errors, error_set.error_messages(heap));
  }

  #[test]
  fn simple_tests() {
    let heap = &mut Heap::new();
    assert_expected_errors(HashMap::new(), heap, vec![]);
    assert_expected_errors(
      HashMap::from([
        mock_module(heap, "A", vec![], vec![]),
        mock_module(heap, "B", vec![], vec!["Foo"]),
        mock_module(heap, "C", vec![], vec!["Bar"]),
      ]),
      heap,
      vec![],
    )
  }

  #[test]
  fn cyclic_dependencies_no_errors_tests() {
    let heap = &mut Heap::new();
    assert_expected_errors(
      HashMap::from([
        mock_module(heap, "A", vec![("B", vec!["Bar"])], vec!["Foo"]),
        mock_module(heap, "B", vec![("A", vec!["Foo"])], vec!["Bar"]),
      ]),
      heap,
      vec![],
    )
  }

  #[test]
  fn missing_classes_errors_tests() {
    let heap = &mut Heap::new();
    assert_expected_errors(
      HashMap::from([
        mock_module(heap, "A", vec![("B", vec!["Foo", "Bar"])], vec![]),
        mock_module(heap, "B", vec![("A", vec!["Foo", "Bar"])], vec![]),
      ]),
      heap,
      vec![
        "A.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved.",
        "A.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.",
        "B.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved.",
        "B.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.",
      ],
    )
  }

  #[test]
  fn missing_modules_errors_tests() {
    let heap = &mut Heap::new();
    assert_expected_errors(
      HashMap::from([mock_module(heap, "A", vec![("B", vec![])], vec![])]),
      heap,
      vec!["A.sam:0:0-0:0: [UnresolvedName]: Name `B` is not resolved."],
    )
  }
}
