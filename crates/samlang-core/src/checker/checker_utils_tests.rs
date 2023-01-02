#[cfg(test)]
mod tests {
  use super::super::checker_utils::*;
  use crate::{
    ast::{
      source::{test_builder, ISourceType, Type, TypeParameterSignature},
      Reason,
    },
    common::rcs,
    errors::ErrorSet,
  };
  use std::{collections::HashMap, rc::Rc};

  fn meet(t1: &Type, t2: &Type) -> String {
    let mut error_set = ErrorSet::new();
    let t = contextual_type_meet(t1, t2, &mut error_set);
    if error_set.has_errors() {
      "FAILED_MEET".to_string()
    } else {
      t.pretty_print()
    }
  }

  #[test]
  fn contextual_type_meet_tests() {
    let builder = test_builder::create();

    assert_eq!(meet(&builder.unit_type(), &builder.unit_type()), "unit");
    assert_eq!(meet(&builder.unit_type(), &builder.int_type()), "FAILED_MEET");
    assert_eq!(meet(&Type::Unknown(Reason::dummy()), &builder.string_type()), "string");
    assert_eq!(meet(&builder.unit_type(), &builder.simple_id_type("A")), "FAILED_MEET");

    assert_eq!(meet(&builder.unit_type(), &Type::Unknown(Reason::dummy())), "unit");

    assert_eq!(meet(&builder.simple_id_type("A"), &builder.unit_type()), "FAILED_MEET");
    assert_eq!(meet(&builder.simple_id_type("A"), &builder.simple_id_type("B")), "FAILED_MEET");
    assert_eq!(
      meet(&builder.simple_id_type("A"), &builder.general_id_type("A", vec![builder.int_type()])),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.general_id_type("A", vec![builder.simple_id_type("B")]),
        &builder.general_id_type("A", vec![builder.simple_id_type("B")]),
      ),
      "A<B>"
    );
    assert_eq!(
      meet(
        &builder.general_id_type("A", vec![builder.simple_id_type("A")]),
        &builder.general_id_type("A", vec![builder.simple_id_type("B")]),
      ),
      "FAILED_MEET"
    );

    assert_eq!(
      meet(
        &builder.general_id_type("A", vec![builder.simple_id_type("B")]),
        &builder.general_id_type("A", vec![Rc::new(Type::Unknown(Reason::dummy()))]),
      ),
      "A<B>"
    );
    assert_eq!(meet(&builder.simple_id_type("B"), &Type::Unknown(Reason::dummy())), "B");

    assert_eq!(
      meet(&builder.fun_type(vec![], builder.int_type()), &builder.unit_type()),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(&builder.fun_type(vec![], builder.int_type()), &builder.simple_id_type("B")),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
      ),
      "(int) -> int"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.bool_type()], builder.int_type()),
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
        &Type::Unknown(Reason::dummy())
      ),
      "(int) -> bool"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
        &builder.fun_type(
          vec![Rc::new(Type::Unknown(Reason::dummy()))],
          Rc::new(Type::Unknown(Reason::dummy()))
        ),
      ),
      "(int) -> bool"
    );
  }

  #[test]
  fn type_substitution_tests() {
    let builder = test_builder::create();

    assert_eq!(
      "(A<int, C<int>>, int, E<F>, int) -> int",
      perform_type_substitution(
        &builder.fun_type(
          vec![
            builder.general_id_type(
              "A",
              vec![
                builder.simple_id_type("B"),
                builder.general_id_type("C", vec![builder.int_type()])
              ]
            ),
            builder.simple_id_type("D"),
            builder.general_id_type("E", vec![builder.simple_id_type("F")]),
            builder.int_type()
          ],
          builder.int_type()
        ),
        &HashMap::from([
          (rcs("A"), builder.int_type()),
          (rcs("B"), builder.int_type()),
          (rcs("C"), builder.int_type()),
          (rcs("D"), builder.int_type()),
          (rcs("E"), builder.int_type()),
        ])
      )
      .pretty_print()
    );

    assert_eq!(
      "A",
      perform_id_type_substitution_asserting_id_type_return(
        &builder.simple_id_type_unwrapped("A"),
        &HashMap::new()
      )
      .pretty_print()
    );
  }

  #[test]
  fn id_type_substitution_panic_test() {
    let builder = test_builder::create();

    perform_id_type_substitution_asserting_id_type_return(
      &builder.simple_id_type_unwrapped("A"),
      &HashMap::from([(rcs("A"), builder.int_type())]),
    );
  }

  fn solver_test(
    concrete: &Type,
    generic: &Type,
    type_parameter_signatures: Vec<TypeParameterSignature>,
    expected: &HashMap<&str, &str>,
  ) {
    let mut error_set = ErrorSet::new();
    let TypeConstraintSolution { solved_substitution, .. } =
      solve_type_constraints(concrete, generic, &type_parameter_signatures, &mut error_set);
    let mut result = HashMap::new();
    for (s, t) in solved_substitution {
      result.insert(s.to_string(), t.pretty_print());
    }
    if error_set.has_errors() {
      result.insert("has_error".to_string(), "true".to_string());
    }
    let mut transformed_expected = HashMap::new();
    for (k, v) in expected {
      transformed_expected.insert(k.to_string(), v.to_string());
    }
    assert_eq!(transformed_expected, result);
  }

  #[test]
  fn type_constrain_solver_tests() {
    let builder = test_builder::create();

    // primitive types
    solver_test(
      &builder.int_type(),
      &builder.unit_type(),
      vec![],
      &HashMap::from([("has_error", "true")]),
    );
    solver_test(
      &builder.int_type(),
      &builder.unit_type(),
      vec![TypeParameterSignature { name: rcs("T"), bound: None }],
      &HashMap::from([("has_error", "true"), ("T", "unknown")]),
    );

    // identifier type
    solver_test(
      &builder.int_type(),
      &builder.simple_id_type("T"),
      vec![],
      &HashMap::from([("has_error", "true")]),
    );
    solver_test(
      &builder.int_type(),
      &builder.general_id_type("T", vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
    );
    solver_test(
      &builder.simple_id_type("T"),
      &builder.general_id_type("T", vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
    );
    solver_test(
      &builder.int_type(),
      &builder.simple_id_type("T"),
      vec![TypeParameterSignature { name: rcs("T"), bound: None }],
      &HashMap::from([("T", "int")]),
    );
    solver_test(
      &builder.int_type(),
      &builder.general_id_type("Bar", vec![builder.int_type()]),
      vec![TypeParameterSignature { name: rcs("Foo"), bound: None }],
      &HashMap::from([("has_error", "true"), ("Foo", "unknown")]),
    );
    solver_test(
      &builder.general_id_type("Bar", vec![builder.simple_id_type("Baz")]),
      &builder.general_id_type("Bar", vec![builder.simple_id_type("T")]),
      vec![TypeParameterSignature { name: rcs("T"), bound: None }],
      &HashMap::from([("T", "Baz")]),
    );

    // function type

    solver_test(
      &builder.fun_type(
        vec![builder.int_type(), builder.bool_type(), builder.string_type()],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![builder.simple_id_type("A"), builder.simple_id_type("B"), builder.simple_id_type("A")],
        builder.simple_id_type("C"),
      ),
      vec![
        TypeParameterSignature { name: rcs("A"), bound: None },
        TypeParameterSignature { name: rcs("B"), bound: None },
        TypeParameterSignature { name: rcs("C"), bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "int"), ("B", "bool"), ("C", "unit")]),
    );
    solver_test(
      &builder.int_type(),
      &builder.fun_type(
        vec![builder.simple_id_type("A"), builder.simple_id_type("B"), builder.simple_id_type("A")],
        builder.simple_id_type("C"),
      ),
      vec![
        TypeParameterSignature { name: rcs("A"), bound: None },
        TypeParameterSignature { name: rcs("B"), bound: None },
        TypeParameterSignature { name: rcs("C"), bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "unknown"), ("B", "unknown"), ("C", "unknown")]),
    );
  }

  #[test]
  fn type_constrain_solver_integration_test_1() {
    let mut error_set = ErrorSet::new();
    let builder = test_builder::create();

    let TypeConstraintSolution {
      solved_substitution: _,
      solved_generic_type,
      solved_contextually_typed_concrete_type,
    } = solve_type_constraints(
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![Rc::new(Type::Unknown(Reason::dummy()))],
            Rc::new(Type::Unknown(Reason::dummy())),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(vec![builder.simple_id_type("A")], builder.simple_id_type("A")),
          builder.simple_id_type("B"),
        ],
        builder.unit_type(),
      ),
      &vec![
        TypeParameterSignature { name: rcs("A"), bound: None },
        TypeParameterSignature { name: rcs("B"), bound: None },
      ],
      &mut error_set,
    );

    assert_eq!("((unknown) -> unknown, int) -> unit", solved_generic_type.pretty_print());
    assert_eq!(
      "((unknown) -> unknown, int) -> unit",
      solved_contextually_typed_concrete_type.pretty_print()
    );
    assert!(!error_set.has_errors());
  }

  #[test]
  fn type_constrain_solver_integration_test_2() {
    let mut error_set = ErrorSet::new();
    let builder = test_builder::create();

    let TypeConstraintSolution {
      solved_substitution: _,
      solved_generic_type,
      solved_contextually_typed_concrete_type,
    } = solve_type_constraints(
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![Rc::new(Type::Unknown(Reason::dummy()))],
            Rc::new(Type::Unknown(Reason::dummy())),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(vec![builder.simple_id_type("A")], builder.simple_id_type("A")),
          builder.simple_id_type("B"),
        ],
        builder.unit_type(),
      ),
      &vec![TypeParameterSignature { name: rcs("B"), bound: None }],
      &mut error_set,
    );

    assert_eq!("((A) -> A, int) -> unit", solved_generic_type.pretty_print());
    assert_eq!("((A) -> A, int) -> unit", solved_contextually_typed_concrete_type.pretty_print());
    assert!(!error_set.has_errors());
  }
}
