#[cfg(test)]
mod tests {
  use super::super::checker_utils::*;
  use super::super::type_::{ISourceType, Type, TypeParameterSignature};
  use crate::checker::type_::test_type_builder;
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
    assert_eq!(meet(&Type::Unknown(Reason::dummy()), &builder.string_type(), heap), "string");
    assert_eq!(
      meet(&builder.unit_type(), &builder.simple_id_type(heap.alloc_str_for_test("A")), heap),
      "FAILED_MEET"
    );

    assert_eq!(meet(&builder.unit_type(), &Type::Unknown(Reason::dummy()), heap), "unit");

    assert_eq!(
      meet(&builder.simple_id_type(heap.alloc_str_for_test("A")), &builder.unit_type(), heap),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.simple_id_type(heap.alloc_str_for_test("A")),
        &builder.simple_id_type(heap.alloc_str_for_test("B")),
        heap
      ),
      "FAILED_MEET"
    );
    assert_eq!(
      meet(
        &builder.simple_id_type(heap.alloc_str_for_test("A")),
        &builder.general_id_type(heap.alloc_str_for_test("A"), vec![builder.int_type()]),
        heap
      ),
      "FAILED_MEET",
    );
    assert_eq!(
      meet(
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![builder.simple_id_type(heap.alloc_str_for_test("B"))]
        ),
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![builder.simple_id_type(heap.alloc_str_for_test("B"))]
        ),
        heap,
      ),
      "A<B>"
    );
    assert_eq!(
      meet(
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![builder.simple_id_type(heap.alloc_str_for_test("A"))]
        ),
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![builder.simple_id_type(heap.alloc_str_for_test("B"))]
        ),
        heap,
      ),
      "FAILED_MEET"
    );

    assert_eq!(
      meet(
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![builder.simple_id_type(heap.alloc_str_for_test("B"))]
        ),
        &builder.general_id_type(
          heap.alloc_str_for_test("A"),
          vec![Rc::new(Type::Unknown(Reason::dummy()))]
        ),
        heap,
      ),
      "A<B>"
    );
    assert_eq!(
      meet(
        &builder.simple_id_type(heap.alloc_str_for_test("B")),
        &Type::Unknown(Reason::dummy()),
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
        &builder.simple_id_type(heap.alloc_str_for_test("B")),
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
        &Type::Unknown(Reason::dummy()),
        heap
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
        heap,
      ),
      "(int) -> bool"
    );
  }

  #[test]
  fn type_substitution_tests() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(
      "(A<int, C<int>>, int, E<F>, int) -> int",
      perform_type_substitution(
        &builder.fun_type(
          vec![
            builder.general_id_type(
              heap.alloc_str_for_test("A"),
              vec![
                builder.simple_id_type(heap.alloc_str_for_test("B")),
                builder.general_id_type(heap.alloc_str_for_test("C"), vec![builder.int_type()])
              ]
            ),
            builder.simple_id_type(heap.alloc_str_for_test("D")),
            builder.general_id_type(
              heap.alloc_str_for_test("E"),
              vec![builder.simple_id_type(heap.alloc_str_for_test("F"))]
            ),
            builder.int_type()
          ],
          builder.int_type()
        ),
        &HashMap::from([
          (heap.alloc_str_for_test("A"), builder.int_type()),
          (heap.alloc_str_for_test("B"), builder.int_type()),
          (heap.alloc_str_for_test("C"), builder.int_type()),
          (heap.alloc_str_for_test("D"), builder.int_type()),
          (heap.alloc_str_for_test("E"), builder.int_type()),
        ])
      )
      .pretty_print(&heap)
    );

    assert_eq!(
      "A",
      perform_id_type_substitution_asserting_id_type_return(
        &builder.simple_id_type_unwrapped(heap.alloc_str_for_test("A")),
        &HashMap::new()
      )
      .pretty_print(&heap)
    );
  }

  #[test]
  fn id_type_substitution_panic_test() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    perform_id_type_substitution_asserting_id_type_return(
      &builder.simple_id_type_unwrapped(heap.alloc_str_for_test("A")),
      &HashMap::from([(heap.alloc_str_for_test("A"), builder.int_type())]),
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
      &HashMap::from([("has_error", "true"), ("T", "unknown")]),
      heap,
    );

    // identifier type
    solver_test(
      &builder.int_type(),
      &builder.simple_id_type(heap.alloc_str_for_test("T")),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.general_id_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.simple_id_type(heap.alloc_str_for_test("T")),
      &builder.general_id_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      vec![],
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.simple_id_type(heap.alloc_str_for_test("T")),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("T"), bound: None }],
      &HashMap::from([("T", "int")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.general_id_type(heap.alloc_str_for_test("Bar"), vec![builder.int_type()]),
      vec![TypeParameterSignature { name: heap.alloc_str_for_test("Foo"), bound: None }],
      &HashMap::from([("has_error", "true"), ("Foo", "unknown")]),
      heap,
    );
    solver_test(
      &builder.general_id_type(
        heap.alloc_str_for_test("Bar"),
        vec![builder.simple_id_type(heap.alloc_str_for_test("Baz"))],
      ),
      &builder.general_id_type(
        heap.alloc_str_for_test("Bar"),
        vec![builder.simple_id_type(heap.alloc_str_for_test("T"))],
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
          builder.simple_id_type(heap.alloc_str_for_test("A")),
          builder.simple_id_type(heap.alloc_str_for_test("B")),
          builder.simple_id_type(heap.alloc_str_for_test("A")),
        ],
        builder.simple_id_type(heap.alloc_str_for_test("C")),
      ),
      vec![
        TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
        TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
        TypeParameterSignature { name: heap.alloc_str_for_test("C"), bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "int"), ("B", "bool"), ("C", "unit")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.fun_type(
        vec![
          builder.simple_id_type(heap.alloc_str_for_test("A")),
          builder.simple_id_type(heap.alloc_str_for_test("B")),
          builder.simple_id_type(heap.alloc_str_for_test("A")),
        ],
        builder.simple_id_type(heap.alloc_str_for_test("C")),
      ),
      vec![
        TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
        TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
        TypeParameterSignature { name: heap.alloc_str_for_test("C"), bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "unknown"), ("B", "unknown"), ("C", "unknown")]),
      heap,
    );
  }

  #[test]
  fn type_constrain_solver_integration_test_1() {
    let mut heap = Heap::new();
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
            vec![Rc::new(Type::Unknown(Reason::dummy()))],
            Rc::new(Type::Unknown(Reason::dummy())),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![builder.simple_id_type(heap.alloc_str_for_test("A"))],
            builder.simple_id_type(heap.alloc_str_for_test("A")),
          ),
          builder.simple_id_type(heap.alloc_str_for_test("B")),
        ],
        builder.unit_type(),
      ),
      &vec![
        TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
        TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
      ],
      &heap,
      &mut error_set,
    );

    assert_eq!("((unknown) -> unknown, int) -> unit", solved_generic_type.pretty_print(&heap));
    assert_eq!(
      "((unknown) -> unknown, int) -> unit",
      solved_contextually_typed_concrete_type.pretty_print(&heap)
    );
    assert!(!error_set.has_errors());
  }

  #[test]
  fn type_constrain_solver_integration_test_2() {
    let mut heap = Heap::new();
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
            vec![Rc::new(Type::Unknown(Reason::dummy()))],
            Rc::new(Type::Unknown(Reason::dummy())),
          ),
          builder.int_type(),
        ],
        builder.unit_type(),
      ),
      &builder.fun_type(
        vec![
          builder.fun_type(
            vec![builder.simple_id_type(heap.alloc_str_for_test("A"))],
            builder.simple_id_type(heap.alloc_str_for_test("A")),
          ),
          builder.simple_id_type(heap.alloc_str_for_test("B")),
        ],
        builder.unit_type(),
      ),
      &vec![TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None }],
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
