use std::collections::HashSet;

use itertools::Itertools;

use crate::ast::{
  source::{ISourceType, Type, TypeParameterSignature},
  Location, ModuleReference,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct CompileTimeError(pub(crate) Location, pub(crate) String);

impl ToString for CompileTimeError {
  fn to_string(&self) -> String {
    self.1.to_string()
  }
}

pub(crate) struct ErrorSet {
  errors: HashSet<CompileTimeError>,
  modules_with_error: HashSet<ModuleReference>,
}

impl ErrorSet {
  pub(crate) fn new() -> ErrorSet {
    ErrorSet { errors: HashSet::new(), modules_with_error: HashSet::new() }
  }

  pub(crate) fn has_errors(&self) -> bool {
    !self.errors.is_empty()
  }

  pub(crate) fn module_has_error(&self, module_reference: &ModuleReference) -> bool {
    self.modules_with_error.contains(module_reference)
  }

  pub(crate) fn errors(&self) -> Vec<&CompileTimeError> {
    let mut errors = self.errors.iter().collect_vec();
    errors.sort_by(|a, b| a.1.cmp(&b.1));
    errors
  }

  pub(crate) fn error_messages(&self) -> Vec<String> {
    self.errors().into_iter().map(|e| e.to_string()).collect()
  }

  fn report_error(&mut self, error_type: &str, loc: &Location, reason: String) {
    self.errors.insert(CompileTimeError(
      loc.clone(),
      format!("{}: [{}]: {}", loc.to_string(), error_type, reason),
    ));
    self.modules_with_error.insert(loc.module_reference.clone());
  }

  pub(crate) fn report_syntax_error(&mut self, loc: &Location, reason: &str) {
    self.report_error("SyntaxError", loc, reason.to_string())
  }

  pub(crate) fn report_unexpected_type_error<T1: ISourceType, T2: ISourceType>(
    &mut self,
    loc: &Location,
    expected: &T1,
    actual: &T2,
  ) {
    self.report_error(
      "UnexpectedType",
      loc,
      format!("Expected: `{}`, actual: `{}`.", expected.pretty_print(), actual.pretty_print()),
    )
  }

  pub(crate) fn report_unexpected_subtype_error<T1: ISourceType, T2: ISourceType>(
    &mut self,
    loc: &Location,
    expected: &T1,
    actual: &T2,
  ) {
    self.report_error(
      "UnexpectedSubtype",
      loc,
      format!(
        "Expected: subtype of `{}`, actual: `{}`.",
        expected.pretty_print(),
        actual.pretty_print()
      ),
    )
  }

  pub(crate) fn report_unexpected_type_kind_error(
    &mut self,
    loc: &Location,
    expected: &str,
    actual: &str,
  ) {
    self.report_error(
      "UnexpectedTypeKind",
      loc,
      format!("Expected kind: `{}`, actual: `{}`.", expected, actual),
    )
  }

  pub(crate) fn report_unresolved_name_error(&mut self, loc: &Location, name: &str) {
    self.report_error("UnresolvedName", loc, format!("Name `{}` is not resolved.", name))
  }

  pub(crate) fn report_type_parameter_mismatch_error(
    &mut self,
    loc: &Location,
    expected: &Vec<TypeParameterSignature>,
  ) {
    self.report_error(
      "TypeParameterNameMismatch",
      loc,
      format!(
        "Type parameter name mismatch. Expected exact match of `{}`.",
        TypeParameterSignature::pretty_print_list(expected)
      ),
    )
  }

  pub(crate) fn report_missing_definition_error(
    &mut self,
    loc: &Location,
    missing_definitions: Vec<String>,
  ) {
    self.report_error(
      "MissingDefinitions",
      loc,
      format!("Missing definitions for [{}].", missing_definitions.join(", ")),
    )
  }

  pub(crate) fn report_arity_mismatch_error(
    &mut self,
    loc: &Location,
    kind: &str,
    expected_size: usize,
    actual_size: usize,
  ) {
    self.report_error(
      "ArityMismatchError",
      loc,
      format!("Incorrect {} size. Expected: {}, actual: {}.", kind, expected_size, actual_size),
    )
  }

  pub(crate) fn report_insufficient_type_inference_context_error(&mut self, loc: &Location) {
    self.report_error(
      "InsufficientTypeInferenceContext",
      loc,
      "There is not enough context information to decide the type of this expression.".to_string(),
    )
  }

  pub(crate) fn report_collision_error(&mut self, loc: &Location, name: &str) {
    self.report_error(
      "Collision",
      loc,
      format!("Name `{}` collides with a previously defined name.", name),
    )
  }

  pub(crate) fn report_non_exhausive_match_error(
    &mut self,
    loc: &Location,
    missing_tags: Vec<String>,
  ) {
    self.report_error(
      "NonExhausiveMatch",
      loc,
      format!("The following tags are not considered in the match: [{}].", missing_tags.join(", ")),
    )
  }

  pub(crate) fn report_cyclic_type_definition_error(&mut self, type_: &Type) {
    self.report_error(
      "CyclicTypeDefinition",
      &type_.get_reason().use_loc,
      format!("Type `{}` has a cyclic definition.", type_.pretty_print()),
    );
  }
}

#[cfg(test)]
mod tests {
  use std::ops::Deref;

  use super::*;
  use crate::ast::source::test_builder;

  #[test]
  fn boilterplate() {
    assert!(
      !format!("{:?}", CompileTimeError(Location::dummy(), "ddd".to_string()).clone()).is_empty()
    );
    assert!(
      CompileTimeError(Location::dummy(), "ddd".to_string())
        == CompileTimeError(Location::dummy(), "ddd".to_string()).clone()
    );
  }

  #[test]
  fn error_message_tests() {
    let mut error_set = ErrorSet::new();
    let builder = test_builder::create();

    error_set.report_syntax_error(&Location::dummy(), "bad code");
    error_set.report_unexpected_type_error(
      &Location::dummy(),
      builder.int_type().deref(),
      builder.bool_type().deref(),
    );
    error_set.report_unexpected_subtype_error(
      &Location::dummy(),
      builder.int_type().deref(),
      builder.bool_type().deref(),
    );
    error_set.report_unresolved_name_error(&Location::dummy(), "global");
    error_set.report_type_parameter_mismatch_error(&Location::dummy(), &vec![]);
    error_set.report_unexpected_type_kind_error(&Location::dummy(), "array", "object");
    error_set.report_arity_mismatch_error(&Location::dummy(), "pair", 1, 2);
    error_set.report_insufficient_type_inference_context_error(&Location::dummy());
    error_set.report_collision_error(&Location::dummy(), "a");
    error_set
      .report_non_exhausive_match_error(&Location::dummy(), vec!["A".to_string(), "B".to_string()]);
    error_set.report_missing_definition_error(
      &Location::dummy(),
      vec!["foo".to_string(), "bar".to_string()],
    );
    error_set.report_cyclic_type_definition_error(&builder.int_type());

    let actual_errors = error_set
      .error_messages()
      .into_iter()
      .map(|s| {
        s.chars().collect::<Vec<_>>()["__DUMMY__.sam:0:0-0:0: ".len()..]
          .into_iter()
          .collect::<String>()
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
      "[UnexpectedSubtype]: Expected: subtype of `int`, actual: `bool`.",
      "[UnexpectedTypeKind]: Expected kind: `array`, actual: `object`.",
      "[UnexpectedType]: Expected: `int`, actual: `bool`.",
      "[UnresolvedName]: Name `global` is not resolved.",
    ];
    assert_eq!(expected_errors, actual_errors);
    assert!(error_set.has_errors());
    assert!(error_set.module_has_error(&ModuleReference::dummy()))
  }
}
