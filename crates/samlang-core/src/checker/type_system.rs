use super::type_::{ISourceType, Type};
use crate::errors::{StackableError, TypeIncompatibilityNode};

pub(super) fn contains_placeholder(type_: &Type) -> bool {
  match type_ {
    Type::Any(_, is_placeholder) => *is_placeholder,
    Type::Primitive(_, _) | Type::Generic(_, _) => false,
    Type::Nominal(n) => n.type_arguments.iter().any(|t| contains_placeholder(t)),
    Type::Fn(f) => {
      f.argument_types.iter().any(|t| contains_placeholder(t))
        || contains_placeholder(&f.return_type)
    }
  }
}

fn meet_visit(lower: &Type, upper: &Type, error_stack: &mut StackableError) -> bool {
  match (lower, upper) {
    (Type::Any(_, _), _) | (_, Type::Any(_, _)) => return true,
    (Type::Primitive(_, lower_p), Type::Primitive(_, upper_p)) if lower_p == upper_p => {
      return true
    }
    (Type::Generic(_, lower_n), Type::Generic(_, upper_n)) if lower_n == upper_n => return true,
    (Type::Nominal(lower_n), Type::Nominal(upper_n)) if lower_n.id == upper_n.id => {
      if lower_n.type_arguments.len() == upper_n.type_arguments.len() {
        if lower_n
          .type_arguments
          .iter()
          .zip(&upper_n.type_arguments)
          .all(|(l, u)| meet_visit(l, u, error_stack))
        {
          return true;
        }
      } else {
        error_stack
          .add_type_args_arity_error(lower_n.type_arguments.len(), upper_n.type_arguments.len());
      }
    }
    (Type::Fn(lower_f), Type::Fn(upper_f)) => {
      if lower_f.argument_types.len() == upper_f.argument_types.len() {
        if lower_f
          .argument_types
          .iter()
          .zip(&upper_f.argument_types)
          .all(|(l, u)| meet_visit(l, u, error_stack))
          && meet_visit(&lower_f.return_type, &upper_f.return_type, error_stack)
        {
          return true;
        }
      } else {
        error_stack
          .add_fn_param_arity_error(lower_f.argument_types.len(), upper_f.argument_types.len());
      }
    }
    (_, _) => {}
  }
  error_stack.add_type_error(TypeIncompatibilityNode {
    lower_reason: *lower.get_reason(),
    lower_description: lower.to_description(),
    upper_reason: *upper.get_reason(),
    upper_description: upper.to_description(),
  });
  false
}

pub(super) fn meet(lower: &Type, upper: &Type) -> Option<StackableError> {
  let mut error_stack = StackableError::new();
  if meet_visit(lower, upper, &mut error_stack) {
    debug_assert!(error_stack.is_empty());
    None
  } else {
    debug_assert!(!error_stack.is_empty());
    Some(error_stack)
  }
}

#[cfg(test)]
mod tests {
  use super::super::type_::{test_type_builder, Type};
  use crate::{
    ast::{Location, Reason},
    common::{well_known_pstrs, Heap},
    errors::ErrorSet,
  };
  use pretty_assertions::assert_eq;
  use std::rc::Rc;

  #[test]
  fn contains_placeholder_test() {
    let builder = test_type_builder::create();

    assert!(super::contains_placeholder(&builder.fun_type(
      vec![
        builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.int_type()]),
        builder.generic_type(well_known_pstrs::UPPER_B)
      ],
      Rc::new(super::Type::Any(Reason::dummy(), true))
    )));
    assert!(!super::contains_placeholder(&builder.fun_type(
      vec![
        builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.int_type()]),
        builder.generic_type(well_known_pstrs::UPPER_B)
      ],
      builder.int_type()
    )));
  }

  fn assert_errors(lower: &Type, upper: &Type, heap: &Heap, expected_error_string: &str) {
    let mut error_set = ErrorSet::new();
    if let Some(e) = super::meet(lower, upper) {
      error_set.report_stackable_error(Location::dummy(), e);
    }
    assert_eq!(
      expected_error_string.trim(),
      error_set.pretty_print_error_messages_no_frame(heap,).trim()
    );
  }

  #[test]
  fn meet_test() {
    let builder = test_type_builder::create();
    let heap = &Heap::new();

    assert_errors(&super::Type::Any(Reason::dummy(), true), &builder.int_type(), heap, "");
    assert_errors(&builder.int_type(), &super::Type::Any(Reason::dummy(), true), heap, "");
    assert_errors(&builder.int_type(), &builder.int_type(), heap, "");
    assert_errors(
      &builder.fun_type(
        vec![builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.generic_type(well_known_pstrs::UPPER_B)],
        )],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.generic_type(well_known_pstrs::UPPER_B)],
        )],
        builder.bool_type(),
      ),
      heap,
      "",
    );

    assert_errors(
      &builder.fun_type(
        vec![builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.generic_type(well_known_pstrs::UPPER_B)],
        )],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.bool_type()])],
        builder.bool_type(),
      ),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`(A<B>) -> bool` is incompatible with `(A<bool>) -> bool`.
- `A<B>` is incompatible with `A<bool>`.
  - `B`  is incompatible with `bool` .


Found 1 error.
"#,
    );

    assert_errors(
      &builder.fun_type(vec![builder.bool_type()], builder.bool_type()),
      &builder.fun_type(vec![], builder.bool_type()),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`(bool) -> bool` is incompatible with `() -> bool`.
- Function parameter arity of 1 is incompatible with function parameter arity of 0.


Found 1 error.
"#,
    );
    assert_errors(
      &builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.bool_type()]),
      &builder.general_nominal_type(
        well_known_pstrs::UPPER_A,
        vec![builder.bool_type(), builder.bool_type()],
      ),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`A<bool>` is incompatible with `A<bool, bool>`.
- Type argument arity of 1 is incompatible with type argument arity of 2.


Found 1 error.
"#,
    );
  }
}
