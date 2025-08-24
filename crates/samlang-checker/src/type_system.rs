use super::type_::{FunctionType, ISourceType, NominalType, Type, TypeParameterSignature};
use samlang_ast::Reason;
use samlang_errors::{ErrorSet, StackableError};
use samlang_heap::PStr;
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

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

fn assignability_check_visit(lower: &Type, upper: &Type, error_stack: &mut StackableError) -> bool {
  match (lower, upper) {
    (Type::Any(_, _), _) | (_, Type::Any(_, _)) => return true,
    (Type::Primitive(_, lower_p), Type::Primitive(_, upper_p)) if lower_p == upper_p => {
      return true;
    }
    (Type::Generic(_, lower_n), Type::Generic(_, upper_n)) if lower_n == upper_n => return true,
    (Type::Nominal(lower_n), Type::Nominal(upper_n))
      if lower_n.module_reference == upper_n.module_reference
        && lower_n.id == upper_n.id
        && lower_n.is_class_statics == upper_n.is_class_statics =>
    {
      if lower_n.type_arguments.len() == upper_n.type_arguments.len() {
        if lower_n
          .type_arguments
          .iter()
          .zip(&upper_n.type_arguments)
          .all(|(l, u)| assignability_check_visit(l, u, error_stack))
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
          .all(|(l, u)| assignability_check_visit(l, u, error_stack))
          && assignability_check_visit(&lower_f.return_type, &upper_f.return_type, error_stack)
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
  error_stack.add_type_incompatibility_error(
    *lower.get_reason(),
    lower.to_description(),
    *upper.get_reason(),
    upper.to_description(),
  );
  false
}

pub(super) fn assignability_check(lower: &Type, upper: &Type) -> Option<StackableError> {
  let mut error_stack = StackableError::new();
  if assignability_check_visit(lower, upper, &mut error_stack) {
    debug_assert!(error_stack.is_empty());
    None
  } else {
    debug_assert!(!error_stack.is_empty());
    Some(error_stack)
  }
}

fn type_meet_visit(lower: &Type, upper: &Type, error_stack: &mut StackableError) -> Option<Type> {
  if let Type::Any(reason, lower_is_placeholder) = lower {
    if let Type::Any(_upper_reason, upper_is_placeholder) = upper {
      return Some(Type::Any(*reason, *lower_is_placeholder && *upper_is_placeholder));
    }
    return Some(upper.reposition(lower.get_reason().use_loc));
  }
  match (lower, upper) {
    (specific, Type::Any(_, _)) => return Some(specific.clone()),
    (Type::Primitive(lower_r, lower_p), Type::Primitive(_, upper_p)) if lower_p == upper_p => {
      return Some(Type::Primitive(*lower_r, *lower_p));
    }
    (Type::Generic(lower_r, lower_n), Type::Generic(_, upper_n)) if lower_n == upper_n => {
      return Some(Type::Generic(*lower_r, *lower_n));
    }
    (Type::Nominal(lower_n), Type::Nominal(upper_n))
      if lower_n.module_reference == upper_n.module_reference
        && lower_n.id == upper_n.id
        && lower_n.is_class_statics == upper_n.is_class_statics =>
    {
      if lower_n.type_arguments.len() == upper_n.type_arguments.len() {
        let mut type_arguments = Vec::with_capacity(lower_n.type_arguments.len());
        let mut passing = true;
        for (l, u) in lower_n.type_arguments.iter().zip(&upper_n.type_arguments) {
          if let Some(t) = type_meet_visit(l, u, error_stack) {
            type_arguments.push(Rc::new(t));
          } else {
            passing = false;
            break;
          }
        }
        if passing {
          return Some(Type::Nominal(NominalType {
            reason: lower_n.reason,
            is_class_statics: lower_n.is_class_statics,
            module_reference: lower_n.module_reference,
            id: lower_n.id,
            type_arguments,
          }));
        }
      } else {
        error_stack
          .add_type_args_arity_error(lower_n.type_arguments.len(), upper_n.type_arguments.len());
      }
    }
    (Type::Fn(lower_f), Type::Fn(upper_f)) => {
      if lower_f.argument_types.len() == upper_f.argument_types.len() {
        let mut argument_types = Vec::with_capacity(lower_f.argument_types.len());
        let mut passing = true;
        for (l, u) in lower_f.argument_types.iter().zip(&upper_f.argument_types) {
          if let Some(t) = type_meet_visit(l, u, error_stack) {
            argument_types.push(Rc::new(t));
          } else {
            passing = false;
            break;
          }
        }
        if passing
          && let Some(return_type) =
            type_meet_visit(&lower_f.return_type, &upper_f.return_type, error_stack)
        {
          return Some(Type::Fn(FunctionType {
            reason: lower_f.reason,
            argument_types,
            return_type: Rc::new(return_type),
          }));
        }
      } else {
        error_stack
          .add_fn_param_arity_error(lower_f.argument_types.len(), upper_f.argument_types.len());
      }
    }
    (_, _) => {}
  }
  error_stack.add_type_incompatibility_error(
    *lower.get_reason(),
    lower.to_description(),
    *upper.get_reason(),
    upper.to_description(),
  );
  None
}

pub(super) fn type_meet(lower: &Type, upper: &Type) -> Result<Type, StackableError> {
  let mut error_stack = StackableError::new();
  if let Some(t) = type_meet_visit(lower, upper, &mut error_stack) {
    debug_assert!(error_stack.is_empty());
    Ok(t)
  } else {
    debug_assert!(!error_stack.is_empty());
    Err(error_stack)
  }
}

pub(super) fn subst_fn_type(t: &FunctionType, mapping: &HashMap<PStr, Rc<Type>>) -> FunctionType {
  FunctionType {
    reason: t.reason,
    argument_types: t.argument_types.iter().map(|it| subst_type(it, mapping)).collect(),
    return_type: subst_type(&t.return_type, mapping),
  }
}

fn solve_type_constraints_internal(
  concrete: &Type,
  generic: &Type,
  type_parameters: &HashSet<PStr>,
  partially_solved: &mut HashMap<PStr, Rc<Type>>,
) {
  match generic {
    Type::Any(_, _) | Type::Primitive(_, _) => {}
    Type::Nominal(g) => {
      if let Type::Nominal(c) = concrete
        && g.module_reference == c.module_reference
        && g.id == c.id
        && g.type_arguments.len() == c.type_arguments.len()
      {
        for (g_targ, c_targ) in g.type_arguments.iter().zip(&c.type_arguments) {
          solve_type_constraints_internal(c_targ, g_targ, type_parameters, partially_solved);
        }
      }
    }
    Type::Generic(_, id) => {
      if type_parameters.contains(id) && !partially_solved.contains_key(id) {
        // Placeholder types, which might come from expressions that need to be contextually typed (e.g. lambda),
        // do not participate in constraint solving.
        if !contains_placeholder(concrete) {
          partially_solved.insert(*id, Rc::new(concrete.clone()));
        }
      }
    }
    Type::Fn(g) => {
      if let Type::Fn(c) = concrete {
        for (g_arg, c_arg) in g.argument_types.iter().zip(&c.argument_types) {
          solve_type_constraints_internal(c_arg, g_arg, type_parameters, partially_solved);
        }
        solve_type_constraints_internal(
          &c.return_type,
          &g.return_type,
          type_parameters,
          partially_solved,
        )
      }
    }
  }
}

pub(super) struct TypeConstraint<'a> {
  pub(super) concrete_type: &'a Type,
  pub(super) generic_type: &'a Type,
}

pub(super) fn solve_multiple_type_constrains(
  constraints: &Vec<TypeConstraint>,
  type_parameter_signatures: &Vec<TypeParameterSignature>,
) -> HashMap<PStr, Rc<Type>> {
  let mut partially_solved = HashMap::new();
  let mut type_parameters = HashSet::new();
  for sig in type_parameter_signatures {
    type_parameters.insert(sig.name);
  }
  for TypeConstraint { concrete_type, generic_type } in constraints {
    solve_type_constraints_internal(
      concrete_type,
      generic_type,
      &type_parameters,
      &mut partially_solved,
    )
  }
  partially_solved
}

pub(super) struct TypeConstraintSolution {
  pub(super) solved_substitution: HashMap<PStr, Rc<Type>>,
  pub(super) solved_generic_type: Rc<Type>,
}

pub(super) fn solve_type_constraints(
  concrete: &Type,
  generic: &Type,
  type_parameter_signatures: &Vec<TypeParameterSignature>,
  error_set: &mut ErrorSet,
) -> TypeConstraintSolution {
  let mut solved_substitution = solve_multiple_type_constrains(
    &vec![TypeConstraint { concrete_type: concrete, generic_type: generic }],
    type_parameter_signatures,
  );
  for type_param in type_parameter_signatures {
    solved_substitution.entry(type_param.name).or_insert_with(|| {
      // Fill in placeholder for unsolved types.
      Rc::new(Type::Any(Reason::new(concrete.get_reason().use_loc, None), true))
    });
  }
  let solved_generic_type = subst_type(generic, &solved_substitution);
  match type_meet(concrete, &solved_generic_type) {
    Ok(_) => {}
    Err(stackable) => {
      error_set.report_stackable_error(concrete.get_reason().use_loc, stackable);
    }
  };
  TypeConstraintSolution { solved_substitution, solved_generic_type }
}

pub(super) fn subst_nominal_type(
  type_: &NominalType,
  mapping: &HashMap<PStr, Rc<Type>>,
) -> NominalType {
  NominalType {
    reason: type_.reason,
    is_class_statics: type_.is_class_statics,
    module_reference: type_.module_reference,
    id: type_.id,
    type_arguments: type_.type_arguments.iter().map(|it| subst_type(it, mapping)).collect(),
  }
}

pub(super) fn subst_type(t: &Type, mapping: &HashMap<PStr, Rc<Type>>) -> Rc<Type> {
  match t {
    Type::Any(_, _) | Type::Primitive(_, _) => Rc::new((*t).clone()),
    Type::Nominal(nominal_type) => {
      Rc::new(Type::Nominal(subst_nominal_type(nominal_type, mapping)))
    }
    Type::Generic(_, id) => {
      if let Some(replaced) = mapping.get(id) {
        replaced.clone()
      } else {
        Rc::new((*t).clone())
      }
    }
    Type::Fn(f) => Rc::new(Type::Fn(subst_fn_type(f, mapping))),
  }
}

#[cfg(test)]
mod tests {
  use super::super::type_::ISourceType;
  use super::super::type_::{Type, TypeParameterSignature, test_type_builder};
  use pretty_assertions::assert_eq;
  use samlang_ast::{Location, Reason};
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, PStr};
  use std::{collections::HashMap, rc::Rc};

  #[test]
  fn contains_placeholder_test() {
    let builder = test_type_builder::create();

    assert_eq!(
      true,
      super::contains_placeholder(&builder.fun_type(
        vec![
          builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
          builder.generic_type(PStr::UPPER_B)
        ],
        Rc::new(super::Type::Any(Reason::dummy(), true))
      ))
    );
    assert_eq!(
      false,
      super::contains_placeholder(&builder.fun_type(
        vec![
          builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
          builder.generic_type(PStr::UPPER_B)
        ],
        builder.int_type()
      ))
    );
  }

  fn assert_successful_meet(lower: &Type, upper: &Type, heap: &Heap, expected: &str) {
    assert_eq!(None, super::assignability_check(lower, upper));
    assert_eq!(
      expected,
      super::type_meet(lower, upper).ok().unwrap().to_description().pretty_print(heap)
    );
  }

  fn assert_failed_meet(lower: &Type, upper: &Type, heap: &Heap, expected: &str) {
    let mut error_set = ErrorSet::new();
    error_set
      .report_stackable_error(Location::dummy(), super::assignability_check(lower, upper).unwrap());
    let mut error_set_2 = ErrorSet::new();
    error_set_2
      .report_stackable_error(Location::dummy(), super::type_meet(lower, upper).err().unwrap());
    assert_eq!(
      expected.trim(),
      error_set_2.pretty_print_error_messages_no_frame_for_test(heap).trim()
    );
    assert_eq!(
      expected.trim(),
      error_set.pretty_print_error_messages_no_frame_for_test(heap).trim()
    );
  }

  #[test]
  fn meet_and_assignability_tests() {
    let builder = test_type_builder::create();
    let heap = &Heap::new();

    assert_successful_meet(
      &super::Type::Any(Reason::dummy(), true),
      &builder.int_type(),
      heap,
      "int",
    );
    assert_successful_meet(
      &builder.int_type(),
      &super::Type::Any(Reason::dummy(), true),
      heap,
      "int",
    );
    assert_successful_meet(
      &super::Type::Any(Reason::dummy(), true),
      &super::Type::Any(Reason::dummy(), true),
      heap,
      "any",
    );
    assert_successful_meet(&builder.int_type(), &builder.int_type(), heap, "int");
    assert_successful_meet(
      &builder.fun_type(
        vec![
          builder.general_nominal_type(PStr::UPPER_A, vec![builder.generic_type(PStr::UPPER_B)]),
        ],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![
          builder.general_nominal_type(PStr::UPPER_A, vec![builder.generic_type(PStr::UPPER_B)]),
        ],
        builder.bool_type(),
      ),
      heap,
      "(A<B>) -> bool",
    );

    assert_failed_meet(
      &builder.fun_type(
        vec![
          builder.general_nominal_type(PStr::UPPER_A, vec![builder.generic_type(PStr::UPPER_B)]),
        ],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()])],
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

    assert_failed_meet(
      &builder.fun_type(
        vec![builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()])],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()])],
        builder.int_type(),
      ),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`(A<bool>) -> bool` is incompatible with `(A<bool>) -> int`.
- `bool`  is incompatible with `int` .


Found 1 error.
"#,
    );

    assert_failed_meet(
      &builder.fun_type(vec![builder.bool_type()], builder.bool_type()),
      &builder.fun_type(Vec::new(), builder.bool_type()),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`(bool) -> bool` is incompatible with `() -> bool`.
- Function parameter arity of 1 is incompatible with function parameter arity of 0.


Found 1 error.
"#,
    );
    assert_failed_meet(
      &builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()]),
      &builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type(), builder.bool_type()]),
      heap,
      r#"
Error ------------------------------------ DUMMY.sam:0:0-0:0

`A<bool>` is incompatible with `A<bool, bool>`.
- Type argument arity of 1 is incompatible with type argument arity of 2.


Found 1 error.
"#,
    );
  }

  #[test]
  fn type_substitution_tests() {
    let heap = Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(
      "(A<int, C<int>>, int, E<F>, int) -> int",
      super::subst_type(
        &builder.fun_type(
          vec![
            builder.general_nominal_type(
              PStr::UPPER_A,
              vec![
                builder.generic_type(PStr::UPPER_B),
                builder.general_nominal_type(PStr::UPPER_C, vec![builder.int_type()])
              ]
            ),
            builder.generic_type(PStr::UPPER_D),
            builder.general_nominal_type(
              PStr::UPPER_E,
              vec![builder.simple_nominal_type(PStr::UPPER_F)]
            ),
            builder.int_type()
          ],
          builder.int_type()
        ),
        &super::HashMap::from([
          (PStr::UPPER_A, builder.int_type()),
          (PStr::UPPER_B, builder.int_type()),
          (PStr::UPPER_C, builder.int_type()),
          (PStr::UPPER_D, builder.int_type()),
          (PStr::UPPER_E, builder.int_type()),
        ])
      )
      .pretty_print(&heap)
    );

    assert_eq!(
      "A",
      super::subst_nominal_type(
        &builder.simple_nominal_type_unwrapped(PStr::UPPER_A),
        &super::HashMap::new()
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
    let super::TypeConstraintSolution { solved_substitution, .. } =
      super::solve_type_constraints(concrete, generic, &type_parameter_signatures, &mut error_set);
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
      Vec::new(),
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
      Vec::new(),
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.int_type(),
      &builder.general_nominal_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      Vec::new(),
      &HashMap::from([("has_error", "true")]),
      heap,
    );
    solver_test(
      &builder.simple_nominal_type(heap.alloc_str_for_test("T")),
      &builder.general_nominal_type(heap.alloc_str_for_test("T"), vec![builder.int_type()]),
      Vec::new(),
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

    let super::TypeConstraintSolution { solved_substitution: _, solved_generic_type } =
      super::solve_type_constraints(
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
    assert_eq!(false, error_set.has_errors());
  }

  #[test]
  fn type_constrain_solver_integration_test_2() {
    let heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let builder = test_type_builder::create();

    let super::TypeConstraintSolution { solved_substitution: _, solved_generic_type } =
      super::solve_type_constraints(
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
    assert_eq!(false, error_set.has_errors());
  }
}
