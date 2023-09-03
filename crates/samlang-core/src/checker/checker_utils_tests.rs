#[cfg(test)]
mod tests {
  use super::super::checker_utils::*;
  use super::super::type_::{ISourceType, Type, TypeParameterSignature};
  use crate::checker::type_::test_type_builder;
  use crate::{ast::Reason, errors::ErrorSet};
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};
  use std::{collections::HashMap, rc::Rc};

  fn solver_test(
    concrete: &Type,
    generic: &Type,
    type_parameter_signatures: Vec<TypeParameterSignature>,
    expected: &HashMap<&str, &str>,
    heap: &mut Heap,
  ) {
    let mut error_set = ErrorSet::new();
    let TypeConstraintSolution { solved_substitution, .. } =
      solve_type_constraints(concrete, generic, &type_parameter_signatures, &mut error_set);
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
          builder.generic_type(PStr::UPPER_A),
          builder.generic_type(PStr::UPPER_B),
          builder.generic_type(PStr::UPPER_A),
        ],
        builder.generic_type(PStr::UPPER_C),
      ),
      vec![
        TypeParameterSignature { name: PStr::UPPER_A, bound: None },
        TypeParameterSignature { name: PStr::UPPER_B, bound: None },
        TypeParameterSignature { name: PStr::UPPER_C, bound: None },
      ],
      &HashMap::from([("has_error", "true"), ("A", "int"), ("B", "bool"), ("C", "unit")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.fun_type(
        vec![
          builder.generic_type(PStr::UPPER_A),
          builder.generic_type(PStr::UPPER_B),
          builder.generic_type(PStr::UPPER_A),
        ],
        builder.generic_type(PStr::UPPER_C),
      ),
      vec![
        TypeParameterSignature { name: PStr::UPPER_A, bound: None },
        TypeParameterSignature { name: PStr::UPPER_B, bound: None },
        TypeParameterSignature { name: PStr::UPPER_C, bound: None },
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
            vec![builder.generic_type(PStr::UPPER_A)],
            builder.generic_type(PStr::UPPER_A),
          ),
          builder.generic_type(PStr::UPPER_B),
        ],
        builder.unit_type(),
      ),
      &vec![
        TypeParameterSignature { name: PStr::UPPER_A, bound: None },
        TypeParameterSignature { name: PStr::UPPER_B, bound: None },
      ],
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
            vec![builder.simple_nominal_type(PStr::UPPER_A)],
            builder.simple_nominal_type(PStr::UPPER_A),
          ),
          builder.generic_type(PStr::UPPER_B),
        ],
        builder.unit_type(),
      ),
      &vec![TypeParameterSignature { name: PStr::UPPER_B, bound: None }],
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
