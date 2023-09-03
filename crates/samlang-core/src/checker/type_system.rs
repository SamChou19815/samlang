use super::type_::{FunctionType, ISourceType, NominalType, Type};
use crate::errors::{StackableError, TypeIncompatibilityNode};
use samlang_heap::PStr;
use std::{collections::HashMap, rc::Rc};

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
      return true
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
  error_stack.add_type_error(TypeIncompatibilityNode {
    lower_reason: *lower.get_reason(),
    lower_description: lower.to_description(),
    upper_reason: *upper.get_reason(),
    upper_description: upper.to_description(),
  });
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
      return Some(Type::Primitive(*lower_r, *lower_p))
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
        if passing {
          if let Some(return_type) =
            type_meet_visit(&lower_f.return_type, &upper_f.return_type, error_stack)
          {
            return Some(Type::Fn(FunctionType {
              reason: lower_f.reason,
              argument_types,
              return_type: Rc::new(return_type),
            }));
          }
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
  use super::super::type_::{test_type_builder, Type};
  use crate::{
    ast::{Location, Reason},
    checker::type_::ISourceType,
    errors::ErrorSet,
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};
  use std::rc::Rc;

  #[test]
  fn contains_placeholder_test() {
    let builder = test_type_builder::create();

    assert!(super::contains_placeholder(&builder.fun_type(
      vec![
        builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
        builder.generic_type(PStr::UPPER_B)
      ],
      Rc::new(super::Type::Any(Reason::dummy(), true))
    )));
    assert!(!super::contains_placeholder(&builder.fun_type(
      vec![
        builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
        builder.generic_type(PStr::UPPER_B)
      ],
      builder.int_type()
    )));
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
    assert_eq!(expected.trim(), error_set_2.pretty_print_error_messages_no_frame(heap).trim());
    assert_eq!(expected.trim(), error_set.pretty_print_error_messages_no_frame(heap).trim());
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
        vec![builder.general_nominal_type(
          PStr::UPPER_A,
          vec![builder.generic_type(PStr::UPPER_B)],
        )],
        builder.bool_type(),
      ),
      &builder.fun_type(
        vec![builder.general_nominal_type(
          PStr::UPPER_A,
          vec![builder.generic_type(PStr::UPPER_B)],
        )],
        builder.bool_type(),
      ),
      heap,
      "(A<B>) -> bool",
    );

    assert_failed_meet(
      &builder.fun_type(
        vec![builder.general_nominal_type(
          PStr::UPPER_A,
          vec![builder.generic_type(PStr::UPPER_B)],
        )],
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
      &builder.fun_type(vec![], builder.bool_type()),
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
}
