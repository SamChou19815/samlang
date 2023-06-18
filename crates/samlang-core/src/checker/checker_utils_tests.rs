#[cfg(test)]
mod tests {
  use super::super::checker_utils::*;
  use super::super::type_::{ISourceType, Type, TypeParameterSignature};
  use crate::checker::type_::test_type_builder;
  use crate::common::well_known_pstrs;
  use crate::{ast::Reason, common::Heap, errors::ErrorSet};
  use pretty_assertions::assert_eq;
  use std::{collections::HashMap, rc::Rc};

  fn meet(t1: &Type, t2: &Type, heap: &mut Heap) -> String {
    let mut error_set = ErrorSet::new();
    let t = contextual_type_meet(t1, t2, heap, &mut error_set);
    if error_set.has_errors() {
      "FAILED_MEET".to_string()
    } else {
      t.pretty_print(heap)
    }
  }

  #[test]
  fn contextual_type_meet_tests() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(meet(&builder.unit_type(), &builder.unit_type(), heap), "unit");
    assert_eq!(meet(&builder.unit_type(), &builder.int_type(), heap), "FAILED_MEET");
    assert_eq!(meet(&Type::Any(Reason::dummy(), false), &builder.string_type(), heap), "Str");
    assert_eq!(
      meet(&builder.unit_type(), &builder.simple_nominal_type(well_known_pstrs::UPPER_A), heap),
      "FAILED_MEET"
    );

    assert_eq!(meet(&builder.unit_type(), &Type::Any(Reason::dummy(), false), heap), "unit");
    assert_eq!(
      meet(&Type::Any(Reason::dummy(), true), &Type::Any(Reason::dummy(), false), heap),
      "any"
    );
    assert_eq!(
      meet(&Type::Any(Reason::dummy(), true), &Type::Any(Reason::dummy(), true), heap),
      "placeholder"
    );

    assert_eq!(
      meet(&builder.simple_nominal_type(well_known_pstrs::UPPER_A), &builder.unit_type(), heap),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.simple_nominal_type(well_known_pstrs::UPPER_A),
        &builder.simple_nominal_type(well_known_pstrs::UPPER_B),
        heap
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.generic_type(well_known_pstrs::UPPER_A),
        &builder.simple_nominal_type(well_known_pstrs::UPPER_B),
        heap
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.generic_type(well_known_pstrs::UPPER_A),
        &builder.generic_type(well_known_pstrs::UPPER_B),
        heap
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.generic_type(well_known_pstrs::UPPER_A),
        &builder.generic_type(well_known_pstrs::UPPER_A),
        heap
      ),
      "A"
    );
    assert_eq!(
      meet(
        &builder.simple_nominal_type(well_known_pstrs::UPPER_A),
        &builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.int_type()]),
        heap
      ),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.simple_nominal_type(well_known_pstrs::UPPER_B)]
        ),
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.simple_nominal_type(well_known_pstrs::UPPER_B)]
        ),
        heap,
      ),
      "A<B>"
    );
    assert_eq!(
      meet(
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.simple_nominal_type(well_known_pstrs::UPPER_A)]
        ),
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.simple_nominal_type(well_known_pstrs::UPPER_B)]
        ),
        heap,
      ),
      "FAILED_MEET"
    );

    assert_eq!(
      meet(
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![builder.simple_nominal_type(well_known_pstrs::UPPER_B)]
        ),
        &builder.general_nominal_type(
          well_known_pstrs::UPPER_A,
          vec![Rc::new(Type::Any(Reason::dummy(), false))]
        ),
        heap,
      ),
      "A<B>"
    );
    assert_eq!(
      meet(
        &builder.simple_nominal_type(well_known_pstrs::UPPER_B),
        &Type::Any(Reason::dummy(), false),
        heap
      ),
      "B"
    );

    assert_eq!(
      meet(&builder.fun_type(vec![], builder.int_type()), &builder.unit_type(), heap),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![], builder.int_type()),
        &builder.simple_nominal_type(well_known_pstrs::UPPER_B),
        heap
      ),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        heap,
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        heap,
      ),
      "(int) -> int"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
        heap,
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.int_type()),
        &builder.fun_type(vec![builder.bool_type()], builder.int_type()),
        heap,
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
        &Type::Any(Reason::dummy(), false),
        heap
      ),
      "(int) -> bool"
    );
    assert_eq!(
      meet(
        &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
        &builder.fun_type(
          vec![Rc::new(Type::Any(Reason::dummy(), false))],
          Rc::new(Type::Any(Reason::dummy(), false))
        ),
        heap,
      ),
      "(int) -> bool"
    );
  }

  #[test]
  fn type_substitution_tests() {
    let heap = Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(
      "(A<int, C<int>>, int, E<F>, int) -> int",
      perform_type_substitution(
        &builder.fun_type(
          vec![
            builder.general_nominal_type(
              well_known_pstrs::UPPER_A,
              vec![
                builder.generic_type(well_known_pstrs::UPPER_B),
                builder.general_nominal_type(well_known_pstrs::UPPER_C, vec![builder.int_type()])
              ]
            ),
            builder.generic_type(well_known_pstrs::UPPER_D),
            builder.general_nominal_type(
              well_known_pstrs::UPPER_E,
              vec![builder.simple_nominal_type(well_known_pstrs::UPPER_F)]
            ),
            builder.int_type()
          ],
          builder.int_type()
        ),
        &HashMap::from([
          (well_known_pstrs::UPPER_A, builder.int_type()),
          (well_known_pstrs::UPPER_B, builder.int_type()),
          (well_known_pstrs::UPPER_C, builder.int_type()),
          (well_known_pstrs::UPPER_D, builder.int_type()),
          (well_known_pstrs::UPPER_E, builder.int_type()),
        ])
      )
      .pretty_print(&heap)
    );

    assert_eq!(
      "A",
      perform_nominal_type_substitution(
        &builder.simple_nominal_type_unwrapped(well_known_pstrs::UPPER_A),
        &HashMap::new()
      )
      .pretty_print(&heap)
    );
  }

  fn solver_test(
    concrete: &Type,
    generic: &Type,
    type_parameter_signatures: Vec<TypeParameterSignature>,
    expected: &HashMap<&str, &str>,
    heap: &mut Heap,
  ) {
    let mut error_set = ErrorSet::new();
    let TypeConstraintSolution { solved_substitution, .. } =
      solve_type_constraints(concrete, generic, &type_parameter_signatures, heap, &mut error_set);
    let mut result = HashMap::new();
    for (s, t) in solved_substitution {
      result.insert(s.as_str(heap).to_string(), t.pretty_print(heap));
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
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    // primitive types
    solver_test(
      &builder.int_type(),
      &builder.unit_type(),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.unit_type(),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("T"), bound: None }],
      &HashMap::from([("has_error", "true"), ("T", "placeholder")]),
      heap,
    );

    // identifier type
    solver_test(
      &builder.int_type(),
      &builder.simple_nominal_type(heap.alloc_str_for_test("T")),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.general_nominal_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.simple_nominal_type(heap.alloc_str_for_test("T")),
      &builder.general_nominal_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.generic_type(heap.alloc_str_for_test("T")),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("T"), bound: None }],
      &HashMap::from([("T", "int")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.general_nominal_type(heap.alloc_str_for_test("Bar"), vec![builder.int_type()]),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("Foo"), bound: None }],
      &HashMap::from([("has_error", "true"), ("Foo", "placeholder")]),
      heap,
    );
    solver_test(
      &builder.general_nominal_type(
        heap.alloc_str_for_test("Bar"),
        vec![builder.simple_nominal_type(heap.alloc_str_for_test("Baz"))],
      ),
      &builder.general_nominal_type(
        heap.alloc_str_for_test("Bar"),
        vec![builder.generic_type(heap.alloc_str_for_test("T"))],
      ),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("T"), bound: None }],
      &HashMap::from([("T", "Baz")]),
      heap,
    );

    // function type

    solver_test(
      &builder.fun_type(
        vec![builder.int_type(), builder.bool_type(), builder.string_type()],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.generic_type(well_known_pstrs::UPPER_A),
          builder.generic_type(well_known_pstrs::UPPER_B),
          builder.generic_type(well_known_pstrs::UPPER_A),
        ],
        builder.generic_type(well_known_pstrs::UPPER_C),
      ),
      vec![
        TypeParameterSignature { name: well_known_pstrs::UPPER_A, bound: None },
        TypeParameterSignature { name: well_known_pstrs::UPPER_B, bound: None },
        TypeParameterSignature { name: well_known_pstrs::UPPER_C, bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "int"), ("B", "bool"), ("C", "unit")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.fun_type(
        vec![
          builder.generic_type(well_known_pstrs::UPPER_A),
          builder.generic_type(well_known_pstrs::UPPER_B),
          builder.generic_type(well_known_pstrs::UPPER_A),
        ],
        builder.generic_type(well_known_pstrs::UPPER_C),
      ),
      vec![
        TypeParameterSignature { name: well_known_pstrs::UPPER_A, bound: None },
        TypeParameterSignature { name: well_known_pstrs::UPPER_B, bound: None },
        TypeParameterSignature { name: well_known_pstrs::UPPER_C, bound: None },
      ],
      &HashMap::from([
        ("has_error", "true"),
        ("A", "placeholder"),
        ("B", "placeholder"),
        ("C", "placeholder"),
      ]),
      heap,
    );
  }

  #[test]
  fn type_constrain_solver_integration_test_1() {
    let heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    let TypeConstraintSolution {
      solved_substitution: _,
      solved_generic_type,
      solved_contextually_typed_concrete_type,
    } = solve_type_constraints(
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![Rc::new(Type::Any(Reason::dummy(), true))],
            Rc::new(Type::Any(Reason::dummy(), false)),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![builder.generic_type(well_known_pstrs::UPPER_A)],
            builder.generic_type(well_known_pstrs::UPPER_A),
          ),
          builder.generic_type(well_known_pstrs::UPPER_B),
        ],
        builder.unit_type(),
      ),
      &vec![
        TypeParameterSignature { name: well_known_pstrs::UPPER_A, bound: None },
        TypeParameterSignature { name: well_known_pstrs::UPPER_B, bound: None },
      ],
      &heap,
      &mut error_set,
    );

    assert_eq!("((any) -> any, int) -> unit", solved_generic_type.pretty_print(&heap));
    assert_eq!(
      "((any) -> any, int) -> unit",
      solved_contextually_typed_concrete_type.pretty_print(&heap)
    );
    assert!(!error_set.has_errors());
  }

  #[test]
  fn type_constrain_solver_integration_test_2() {
    let heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    let TypeConstraintSolution {
      solved_substitution: _,
      solved_generic_type,
      solved_contextually_typed_concrete_type,
    } = solve_type_constraints(
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![Rc::new(Type::Any(Reason::dummy(), false))],
            Rc::new(Type::Any(Reason::dummy(), true)),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![builder.simple_nominal_type(well_known_pstrs::UPPER_A)],
            builder.simple_nominal_type(well_known_pstrs::UPPER_A),
          ),
          builder.generic_type(well_known_pstrs::UPPER_B),
        ],
        builder.unit_type(),
      ),
      &vec![TypeParameterSignature { name: well_known_pstrs::UPPER_B, bound: None }],
      &heap,
      &mut error_set,
    );

    assert_eq!("((A) -> A, int) -> unit", solved_generic_type.pretty_print(&heap));
    assert_eq!(
      "((A) -> A, int) -> unit",
      solved_contextually_typed_concrete_type.pretty_print(&heap)
    );
    assert!(!error_set.has_errors());
  }
}
