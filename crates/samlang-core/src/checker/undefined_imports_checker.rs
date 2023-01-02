use crate::{
  ast::{source::Module, ModuleReference},
  errors::ErrorSet,
};
use std::collections::{HashMap, HashSet};

pub(super) fn check_undefined_imports_error(
  sources: &HashMap<ModuleReference, Module>,
  error_set: &mut ErrorSet,
  module: &Module,
) {
  for one_import in module.imports.iter() {
    if let Some(available_members) = sources.get(&one_import.imported_module) {
      let mut available_members_set = HashSet::new();
      for c in available_members.toplevels.iter() {
        available_members_set.insert(c.name().name.clone());
      }
      for id in one_import.imported_members.iter() {
        if !available_members_set.contains(&id.name) {
          error_set.report_unresolved_name_error(&id.loc, &id.name);
        }
      }
    } else {
      error_set
        .report_unresolved_name_error(&one_import.loc, &one_import.imported_module.to_string());
    }
  }
}

#[cfg(test)]
mod tests {
  use std::{collections::HashMap, rc::Rc, vec};

  use crate::{
    ast::{
      source::{Id, InterfaceDeclarationCommon, Module, ModuleMembersImport, Toplevel},
      Location, ModuleReference,
    },
    common::rcs,
    errors::ErrorSet,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn mock_class(name: &'static str) -> Toplevel {
    Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: Rc::new(vec![]),
      name: Id::from(name),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![],
    })
  }

  fn mock_module(
    name: &'static str,
    imports: Vec<(&'static str, Vec<&'static str>)>,
    members: Vec<&'static str>,
  ) -> (ModuleReference, Module) {
    (
      ModuleReference::ordinary(vec![rcs(name)]),
      Module {
        imports: imports
          .into_iter()
          .map(|(imported_mod_name, imported_member_strs)| {
            let mut loc = Location::dummy();
            loc.module_reference = ModuleReference::ordinary(vec![rcs(name)]);
            let mut imported_members = vec![];
            for m in imported_member_strs {
              imported_members.push(Id {
                loc: loc.clone(),
                associated_comments: Rc::new(vec![]),
                name: rcs(m),
              });
            }
            ModuleMembersImport {
              loc: loc.clone(),
              imported_members,
              imported_module: ModuleReference::ordinary(vec![rcs(imported_mod_name)]),
              imported_module_loc: loc,
            }
          })
          .collect_vec(),
        toplevels: members.into_iter().map(mock_class).collect_vec(),
      },
    )
  }

  fn assert_expected_errors(sources: HashMap<ModuleReference, Module>, expected_errors: Vec<&str>) {
    let mut error_set = ErrorSet::new();
    for m in sources.values() {
      super::check_undefined_imports_error(&sources, &mut error_set, m);
    }
    assert_eq!(expected_errors, error_set.error_messages());
  }

  #[test]
  fn simple_tests() {
    assert_expected_errors(HashMap::new(), vec![]);
    assert_expected_errors(
      HashMap::from([
        mock_module("A", vec![], vec![]),
        mock_module("B", vec![], vec!["Foo"]),
        mock_module("C", vec![], vec!["Bar"]),
      ]),
      vec![],
    )
  }

  #[test]
  fn cyclic_dependencies_no_errors_tests() {
    assert_expected_errors(
      HashMap::from([
        mock_module("A", vec![("B", vec!["Bar"])], vec!["Foo"]),
        mock_module("B", vec![("A", vec!["Foo"])], vec!["Bar"]),
      ]),
      vec![],
    )
  }

  #[test]
  fn missing_classes_errors_tests() {
    assert_expected_errors(
      HashMap::from([
        mock_module("A", vec![("B", vec!["Foo", "Bar"])], vec![]),
        mock_module("B", vec![("A", vec!["Foo", "Bar"])], vec![]),
      ]),
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
    assert_expected_errors(
      HashMap::from([mock_module("A", vec![("B", vec![])], vec![])]),
      vec!["A.sam:0:0-0:0: [UnresolvedName]: Name `B` is not resolved."],
    )
  }
}
