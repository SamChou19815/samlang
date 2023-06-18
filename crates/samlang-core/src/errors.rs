use itertools::Itertools;

use crate::{
  ast::Location,
  common::{Heap, ModuleReference, PStr},
};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum ErrorDetail {
  CannotResolveClass { module_reference: ModuleReference, name: PStr },
  CannotResolveModule { module_reference: ModuleReference },
  CannotResolveName { name: PStr },
  CyclicTypeDefinition { type_: String },
  IllegalFunctionInInterface,
  IncompatibleType { expected: String, actual: String, subtype: bool },
  InvalidArity { kind: &'static str, expected: usize, actual: usize },
  InvalidSyntax(String),
  MemberMissing { parent: String, member: PStr },
  MissingDefinitions { missing_definitions: Vec<PStr> },
  MissingExport { module_reference: ModuleReference, name: PStr },
  NameAlreadyBound { name: PStr, old_loc: Location },
  NonExhausiveMatch { missing_tags: Vec<PStr> },
  TypeParameterNameMismatch { expected: String },
  Underconstrained,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct CompileTimeError {
  pub location: Location,
  pub(crate) detail: ErrorDetail,
}

impl CompileTimeError {
  pub(crate) fn is_syntax_error(&self) -> bool {
    matches!(&self.detail, ErrorDetail::InvalidSyntax(_))
  }

  pub fn pretty_print(&self, heap: &Heap) -> String {
    let (error_type, reason) = match &self.detail {
      ErrorDetail::CannotResolveClass { module_reference: _, name } => {
        ("cannot-resolve-class", format!("Class `{}` is not resolved.", name.as_str(heap)))
      }
      ErrorDetail::CannotResolveModule { module_reference } => (
        "cannot-resolve-module",
        format!("Module `{}` is not resolved.", module_reference.pretty_print(heap)),
      ),
      ErrorDetail::CannotResolveName { name } => {
        ("cannot-resolve-name", format!("Name `{}` is not resolved.", name.as_str(heap)))
      }
      ErrorDetail::CyclicTypeDefinition { type_ } => {
        ("cyclic-type-definition", format!("Type `{type_}` has a cyclic definition."))
      }
      ErrorDetail::IllegalFunctionInInterface => (
        "illegal-function-in-interface",
        "Function declarations are not allowed in interfaces.".to_string(),
      ),
      ErrorDetail::IncompatibleType { expected, actual, subtype: false } => {
        ("incompatible-type", format!("Expected: `{expected}`, actual: `{actual}`.",))
      }
      ErrorDetail::IncompatibleType { expected, actual, subtype: true } => {
        ("incompatible-type", format!("Expected: subtype of `{expected}`, actual: `{actual}`.",))
      }
      ErrorDetail::InvalidArity { kind, expected, actual } => {
        ("invalid-arity", format!("Incorrect {kind} size. Expected: {expected}, actual: {actual}."))
      }
      ErrorDetail::InvalidSyntax(reason) => ("invalid-syntax", reason.to_string()),
      ErrorDetail::MemberMissing { parent, member } => {
        ("member-missing", format!("Cannot find member `{}` on `{}`.", member.as_str(heap), parent))
      }
      ErrorDetail::MissingDefinitions { missing_definitions } => (
        "missing-definitions",
        format!(
          "Missing definitions for [{}].",
          missing_definitions.iter().map(|p| p.as_str(heap).to_string()).sorted().join(", ")
        ),
      ),
      ErrorDetail::MissingExport { module_reference, name } => (
        "missing-export",
        format!(
          "There is no `{}` export in `{}`.",
          name.as_str(heap),
          module_reference.pretty_print(heap)
        ),
      ),
      ErrorDetail::NameAlreadyBound { name, old_loc } => (
        "name-already-bound",
        format!(
          "Name `{}` collides with a previously defined name at {}.",
          name.as_str(heap),
          old_loc.pretty_print(heap)
        ),
      ),
      ErrorDetail::NonExhausiveMatch { missing_tags } => (
        "non-exhaustive-match",
        format!(
          "The following tags are not considered in the match: [{}].",
          missing_tags.iter().map(|p| p.as_str(heap).to_string()).sorted().join(", ")
        ),
      ),
      ErrorDetail::TypeParameterNameMismatch { expected } => (
        "type-parameter-name-mismatch",
        format!("Type parameter name mismatch. Expected exact match of `{expected}`."),
      ),
      ErrorDetail::Underconstrained => (
        "underconstrained",
        "There is not enough context information to decide the type of this expression."
          .to_string(),
      ),
    };
    format!("{}: [{}]: {}", self.location.pretty_print(heap), error_type, reason)
  }
}

pub(crate) struct ErrorSet {
  errors: BTreeSet<CompileTimeError>,
}

impl ErrorSet {
  pub(crate) fn new() -> ErrorSet {
    ErrorSet { errors: BTreeSet::new() }
  }

  pub(crate) fn has_errors(&self) -> bool {
    !self.errors.is_empty()
  }

  pub(crate) fn errors(&self) -> Vec<&CompileTimeError> {
    self.errors.iter().collect()
  }

  pub(crate) fn into_errors(self) -> Vec<CompileTimeError> {
    self.errors.into_iter().collect()
  }

  pub(crate) fn error_messages(&self, heap: &Heap) -> Vec<String> {
    self.errors().into_iter().map(|e| e.pretty_print(heap)).collect()
  }

  fn report_error(&mut self, location: Location, detail: ErrorDetail) {
    self.errors.insert(CompileTimeError { location, detail });
  }

  pub(crate) fn report_cannot_resolve_module_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveModule { module_reference })
  }

  pub(crate) fn report_cannot_resolve_class_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::CannotResolveClass { module_reference, name })
  }

  pub(crate) fn report_cannot_resolve_name_error(&mut self, loc: Location, name: PStr) {
    self.report_error(loc, ErrorDetail::CannotResolveName { name })
  }

  pub(crate) fn report_cyclic_type_definition_error(&mut self, type_loc: Location, type_: String) {
    self.report_error(type_loc, ErrorDetail::CyclicTypeDefinition { type_ });
  }

  pub(crate) fn report_illegal_function_in_interface(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::IllegalFunctionInInterface);
  }

  pub(crate) fn report_incompatible_type_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleType { expected, actual, subtype: false })
  }

  pub(crate) fn report_incompatible_subtype_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::IncompatibleType { expected, actual, subtype: true })
  }

  pub(crate) fn report_invalid_arity_error(
    &mut self,
    loc: Location,
    kind: &'static str,
    expected_size: usize,
    actual_size: usize,
  ) {
    self.report_error(
      loc,
      ErrorDetail::InvalidArity { kind, expected: expected_size, actual: actual_size },
    )
  }

  pub(crate) fn report_invalid_syntax_error(&mut self, loc: Location, reason: String) {
    self.report_error(loc, ErrorDetail::InvalidSyntax(reason))
  }

  pub(crate) fn report_member_missing_error(
    &mut self,
    loc: Location,
    parent: String,
    member: PStr,
  ) {
    self.report_error(loc, ErrorDetail::MemberMissing { parent, member })
  }

  pub(crate) fn report_missing_definition_error(
    &mut self,
    loc: Location,
    missing_definitions: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::MissingDefinitions { missing_definitions })
  }

  pub(crate) fn report_missing_export_error(
    &mut self,
    loc: Location,
    module_reference: ModuleReference,
    name: PStr,
  ) {
    self.report_error(loc, ErrorDetail::MissingExport { module_reference, name })
  }

  pub(crate) fn report_name_already_bound_error(
    &mut self,
    new_loc: Location,
    name: PStr,
    old_loc: Location,
  ) {
    self.report_error(new_loc, ErrorDetail::NameAlreadyBound { name, old_loc })
  }

  pub(crate) fn report_non_exhausive_match_error(
    &mut self,
    loc: Location,
    missing_tags: Vec<PStr>,
  ) {
    self.report_error(loc, ErrorDetail::NonExhausiveMatch { missing_tags })
  }

  pub(crate) fn report_type_parameter_mismatch_error(&mut self, loc: Location, expected: String) {
    self.report_error(loc, ErrorDetail::TypeParameterNameMismatch { expected })
  }
  pub(crate) fn report_underconstrained_error(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::Underconstrained)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    checker::type_::{test_type_builder, ISourceType},
    common::{well_known_pstrs, Heap},
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(!format!(
      "{:?}",
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
    )
    .is_empty());
    assert_eq!(
      Some(std::cmp::Ordering::Equal),
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
        .partial_cmp(&CompileTimeError {
          location: Location::dummy(),
          detail: ErrorDetail::Underconstrained
        })
    );
    assert!(
      CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
        == CompileTimeError { location: Location::dummy(), detail: ErrorDetail::Underconstrained }
    );
  }

  #[test]
  fn error_message_tests() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    error_set.report_cannot_resolve_module_error(Location::dummy(), ModuleReference::dummy());
    error_set
      .report_cannot_resolve_name_error(Location::dummy(), heap.alloc_str_for_test("global"));
    error_set.report_cannot_resolve_class_error(
      Location::dummy(),
      ModuleReference::dummy(),
      heap.alloc_str_for_test("global"),
    );
    error_set.report_cyclic_type_definition_error(
      builder.int_type().get_reason().use_loc,
      builder.int_type().pretty_print(&heap),
    );
    error_set.report_incompatible_type_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_invalid_arity_error(Location::dummy(), "pair", 1, 2);
    error_set.report_incompatible_subtype_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_invalid_syntax_error(Location::dummy(), "bad code".to_string());
    error_set.report_member_missing_error(
      Location::dummy(),
      "Foo".to_string(),
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_missing_definition_error(
      Location::dummy(),
      vec![heap.alloc_str_for_test("foo"), heap.alloc_str_for_test("bar")],
    );
    error_set.report_missing_export_error(
      Location::dummy(),
      ModuleReference::dummy(),
      heap.alloc_str_for_test("bar"),
    );
    error_set.report_name_already_bound_error(
      Location::dummy(),
      well_known_pstrs::LOWER_A,
      Location::dummy(),
    );
    error_set.report_non_exhausive_match_error(
      Location::dummy(),
      vec![well_known_pstrs::UPPER_A, well_known_pstrs::UPPER_B],
    );
    error_set.report_type_parameter_mismatch_error(Location::dummy(), "".to_string());
    error_set.report_underconstrained_error(Location::dummy());

    assert!(error_set.errors().iter().any(|e| e.is_syntax_error()));

    let actual_errors = error_set
      .error_messages(&heap)
      .into_iter()
      .map(|s| {
        s.chars().collect::<Vec<_>>()["DUMMY.sam:0:0-0:0: ".len()..].iter().collect::<String>()
      })
      .collect::<Vec<_>>();
    let expected_errors = vec![
      "[cannot-resolve-class]: Class `global` is not resolved.",
      "[cannot-resolve-module]: Module `DUMMY` is not resolved.",
      "[cannot-resolve-name]: Name `global` is not resolved.",
      "[cyclic-type-definition]: Type `int` has a cyclic definition.",
      "[incompatible-type]: Expected: `int`, actual: `bool`.",
      "[incompatible-type]: Expected: subtype of `int`, actual: `bool`.",
      "[invalid-arity]: Incorrect pair size. Expected: 1, actual: 2.",
      "[invalid-syntax]: bad code",
      "[member-missing]: Cannot find member `bar` on `Foo`.",
      "[missing-definitions]: Missing definitions for [bar, foo].",
      "[missing-export]: There is no `bar` export in `DUMMY`.",
      "[name-already-bound]: Name `a` collides with a previously defined name at DUMMY.sam:0:0-0:0.",
      "[non-exhaustive-match]: The following tags are not considered in the match: [A, B].",
      "[type-parameter-name-mismatch]: Type parameter name mismatch. Expected exact match of ``.",
      "[underconstrained]: There is not enough context information to decide the type of this expression.",
    ];
    assert_eq!(expected_errors, actual_errors);
    assert!(error_set.has_errors());
    error_set.into_errors();
  }
}
