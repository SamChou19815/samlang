use crate::{ast::Location, Heap};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum ErrorDetail {
  ArityMismatchError { kind: &'static str, expected: usize, actual: usize },
  Collision { name: String },
  CyclicTypeDefinition { type_: String },
  InsufficientTypeInferenceContext,
  MissingDefinitions { missing_definitions: Vec<String> },
  NonExhausiveMatch { missing_tags: Vec<String> },
  SyntaxError(String),
  TypeParameterNameMismatch { expected: String },
  UnresolvedName { name: String },
  UnexpectedSubtype { expected: String, actual: String },
  UnexpectedTypeKind { expected: String, actual: String },
  UnexpectedType { expected: String, actual: String },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct CompileTimeError {
  pub location: Location,
  detail: ErrorDetail,
}

impl CompileTimeError {
  pub fn pretty_print(&self, heap: &Heap) -> String {
    let (error_type, reason) = match &self.detail {
      ErrorDetail::SyntaxError(reason) => ("SyntaxError", reason.to_string()),
      ErrorDetail::UnexpectedType { expected, actual } => {
        ("UnexpectedType", format!("Expected: `{expected}`, actual: `{actual}`."))
      }
      ErrorDetail::UnexpectedSubtype { expected, actual } => {
        ("UnexpectedSubtype", format!("Expected: subtype of `{expected}`, actual: `{actual}`."))
      }
      ErrorDetail::UnexpectedTypeKind { expected, actual } => {
        ("UnexpectedTypeKind", format!("Expected kind: `{expected}`, actual: `{actual}`."))
      }
      ErrorDetail::UnresolvedName { name } => {
        ("UnresolvedName", format!("Name `{name}` is not resolved."))
      }
      ErrorDetail::Collision { name } => {
        ("Collision", format!("Name `{name}` collides with a previously defined name."))
      }
      ErrorDetail::TypeParameterNameMismatch { expected } => (
        "TypeParameterNameMismatch",
        format!("Type parameter name mismatch. Expected exact match of `{expected}`."),
      ),
      ErrorDetail::MissingDefinitions { missing_definitions } => (
        "MissingDefinitions",
        format!("Missing definitions for [{}].", missing_definitions.join(", ")),
      ),
      ErrorDetail::ArityMismatchError { kind, expected, actual } => (
        "ArityMismatchError",
        format!("Incorrect {kind} size. Expected: {expected}, actual: {actual}."),
      ),
      ErrorDetail::InsufficientTypeInferenceContext => (
        "InsufficientTypeInferenceContext",
        "There is not enough context information to decide the type of this expression."
          .to_string(),
      ),
      ErrorDetail::NonExhausiveMatch { missing_tags } => (
        "NonExhausiveMatch",
        format!(
          "The following tags are not considered in the match: [{}].",
          missing_tags.join(", ")
        ),
      ),
      ErrorDetail::CyclicTypeDefinition { type_ } => {
        ("CyclicTypeDefinition", format!("Type `{type_}` has a cyclic definition."))
      }
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

  pub(crate) fn report_syntax_error(&mut self, loc: Location, reason: String) {
    self.report_error(loc, ErrorDetail::SyntaxError(reason))
  }

  pub(crate) fn report_unexpected_type_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::UnexpectedType { expected, actual })
  }

  pub(crate) fn report_unexpected_subtype_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::UnexpectedSubtype { expected, actual })
  }

  pub(crate) fn report_unexpected_type_kind_error(
    &mut self,
    loc: Location,
    expected: String,
    actual: String,
  ) {
    self.report_error(loc, ErrorDetail::UnexpectedTypeKind { expected, actual })
  }

  pub(crate) fn report_unresolved_name_error(&mut self, loc: Location, name: String) {
    self.report_error(loc, ErrorDetail::UnresolvedName { name })
  }

  pub(crate) fn report_collision_error(&mut self, loc: Location, name: String) {
    self.report_error(loc, ErrorDetail::Collision { name })
  }

  pub(crate) fn report_type_parameter_mismatch_error(&mut self, loc: Location, expected: String) {
    self.report_error(loc, ErrorDetail::TypeParameterNameMismatch { expected })
  }

  pub(crate) fn report_missing_definition_error(
    &mut self,
    loc: Location,
    missing_definitions: Vec<String>,
  ) {
    self.report_error(loc, ErrorDetail::MissingDefinitions { missing_definitions })
  }

  pub(crate) fn report_arity_mismatch_error(
    &mut self,
    loc: Location,
    kind: &'static str,
    expected_size: usize,
    actual_size: usize,
  ) {
    self.report_error(
      loc,
      ErrorDetail::ArityMismatchError { kind, expected: expected_size, actual: actual_size },
    )
  }

  pub(crate) fn report_insufficient_type_inference_context_error(&mut self, loc: Location) {
    self.report_error(loc, ErrorDetail::InsufficientTypeInferenceContext)
  }

  pub(crate) fn report_non_exhausive_match_error(
    &mut self,
    loc: Location,
    missing_tags: Vec<String>,
  ) {
    self.report_error(loc, ErrorDetail::NonExhausiveMatch { missing_tags })
  }

  pub(crate) fn report_cyclic_type_definition_error(&mut self, type_loc: Location, type_: String) {
    self.report_error(type_loc, ErrorDetail::CyclicTypeDefinition { type_ });
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    checker::type_::{test_type_builder, ISourceType},
    common::Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(!format!(
      "{:?}",
      CompileTimeError {
        location: Location::dummy(),
        detail: ErrorDetail::InsufficientTypeInferenceContext
      }
    )
    .is_empty());
    assert_eq!(
      Some(std::cmp::Ordering::Equal),
      CompileTimeError {
        location: Location::dummy(),
        detail: ErrorDetail::InsufficientTypeInferenceContext
      }
      .partial_cmp(&CompileTimeError {
        location: Location::dummy(),
        detail: ErrorDetail::InsufficientTypeInferenceContext
      })
    );
    assert!(
      CompileTimeError {
        location: Location::dummy(),
        detail: ErrorDetail::InsufficientTypeInferenceContext
      } == CompileTimeError {
        location: Location::dummy(),
        detail: ErrorDetail::InsufficientTypeInferenceContext
      }
    );
  }

  #[test]
  fn error_message_tests() {
    let heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    error_set.report_syntax_error(Location::dummy(), "bad code".to_string());
    error_set.report_unexpected_type_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_unexpected_subtype_error(
      Location::dummy(),
      builder.int_type().pretty_print(&heap),
      builder.bool_type().pretty_print(&heap),
    );
    error_set.report_unresolved_name_error(Location::dummy(), "global".to_string());
    error_set.report_type_parameter_mismatch_error(Location::dummy(), "".to_string());
    error_set.report_unexpected_type_kind_error(
      Location::dummy(),
      "array".to_string(),
      "object".to_string(),
    );
    error_set.report_arity_mismatch_error(Location::dummy(), "pair", 1, 2);
    error_set.report_insufficient_type_inference_context_error(Location::dummy());
    error_set.report_collision_error(Location::dummy(), "a".to_string());
    error_set
      .report_non_exhausive_match_error(Location::dummy(), vec!["A".to_string(), "B".to_string()]);
    error_set.report_missing_definition_error(
      Location::dummy(),
      vec!["foo".to_string(), "bar".to_string()],
    );
    error_set.report_cyclic_type_definition_error(
      builder.int_type().get_reason().use_loc,
      builder.int_type().pretty_print(&heap),
    );

    let actual_errors = error_set
      .error_messages(&heap)
      .into_iter()
      .map(|s| {
        s.chars().collect::<Vec<_>>()["__DUMMY__.sam:0:0-0:0: ".len()..].iter().collect::<String>()
      })
      .collect::<Vec<_>>();
    let expected_errors = vec![
      "[ArityMismatchError]: Incorrect pair size. Expected: 1, actual: 2.",
      "[Collision]: Name `a` collides with a previously defined name.",
      "[CyclicTypeDefinition]: Type `int` has a cyclic definition.",
      "[InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
      "[MissingDefinitions]: Missing definitions for [foo, bar].",
      "[NonExhausiveMatch]: The following tags are not considered in the match: [A, B].",
      "[SyntaxError]: bad code",
      "[TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of ``.",
      "[UnresolvedName]: Name `global` is not resolved.",
      "[UnexpectedSubtype]: Expected: subtype of `int`, actual: `bool`.",
      "[UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.",
      "[UnexpectedType]: Expected: `int`, actual: `bool`.",
    ];
    assert_eq!(expected_errors, actual_errors);
    assert!(error_set.has_errors());
    error_set.into_errors();
  }
}
