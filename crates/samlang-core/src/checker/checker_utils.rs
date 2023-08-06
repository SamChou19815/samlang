use crate::{
  ast::Reason,
  checker::type_::{FunctionType, NominalType, Type, TypeParameterSignature},
  checker::type_system,
  common::PStr,
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

pub(super) fn perform_fn_type_substitution(
  t: &FunctionType,
  mapping: &HashMap<PStr, Rc<Type>>,
) -> FunctionType {
  FunctionType {
    reason: t.reason,
    argument_types: t
      .argument_types
      .iter()
      .map(|it| perform_type_substitution(it, mapping))
      .collect_vec(),
    return_type: perform_type_substitution(&t.return_type, mapping),
  }
}

pub(super) fn perform_type_substitution(t: &Type, mapping: &HashMap<PStr, Rc<Type>>) -> Rc<Type> {
  match t {
    Type::Any(_, _) | Type::Primitive(_, _) => Rc::new((*t).clone()),
    Type::Nominal(nominal_type) => {
      Rc::new(Type::Nominal(perform_nominal_type_substitution(nominal_type, mapping)))
    }
    Type::Generic(_, id) => {
      if let Some(replaced) = mapping.get(id) {
        replaced.clone()
      } else {
        Rc::new((*t).clone())
      }
    }
    Type::Fn(f) => Rc::new(Type::Fn(perform_fn_type_substitution(f, mapping))),
  }
}

pub(super) fn perform_nominal_type_substitution(
  type_: &NominalType,
  mapping: &HashMap<PStr, Rc<Type>>,
) -> NominalType {
  NominalType {
    reason: type_.reason,
    is_class_statics: type_.is_class_statics,
    module_reference: type_.module_reference,
    id: type_.id,
    type_arguments: type_
      .type_arguments
      .iter()
      .map(|it| perform_type_substitution(it, mapping))
      .collect_vec(),
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
      if let Type::Nominal(c) = concrete {
        if g.module_reference == c.module_reference
          && g.id == c.id
          && g.type_arguments.len() == c.type_arguments.len()
        {
          for (g_targ, c_targ) in g.type_arguments.iter().zip(&c.type_arguments) {
            solve_type_constraints_internal(c_targ, g_targ, type_parameters, partially_solved);
          }
        }
      }
    }
    Type::Generic(_, id) => {
      if type_parameters.contains(id) && !partially_solved.contains_key(id) {
        // Placeholder types, which might come from expressions that need to be contextually typed (e.g. lambda),
        // do not participate in constraint solving.
        if !type_system::contains_placeholder(concrete) {
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
  pub(super) solved_contextually_typed_concrete_type: Rc<Type>,
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
  let solved_generic_type = perform_type_substitution(generic, &solved_substitution);
  let solved_contextually_typed_concrete_type =
    match type_system::type_meet(concrete, &solved_generic_type) {
      Ok(t) => Rc::new(t),
      Err(stackable) => {
        error_set.report_stackable_error(concrete.get_reason().use_loc, stackable);
        Rc::new(concrete.clone())
      }
    };
  TypeConstraintSolution {
    solved_substitution,
    solved_generic_type,
    solved_contextually_typed_concrete_type,
  }
}
