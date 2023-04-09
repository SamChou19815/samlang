use crate::{
  ast::Reason,
  checker::type_::{FunctionType, ISourceType, NominalType, Type, TypeParameterSignature},
  common::{Heap, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

fn contextual_nominal_type_meet_opt(
  general: &NominalType,
  specific: &NominalType,
) -> Option<NominalType> {
  if general.module_reference == specific.module_reference
    && general.id == specific.id
    && general.type_arguments.len() == specific.type_arguments.len()
  {
    let mut type_arguments = vec![];
    for (g, s) in general.type_arguments.iter().zip(&specific.type_arguments) {
      let targ = contextual_type_meet_opt(g, s)?;
      type_arguments.push(Rc::new(targ));
    }
    return Some(NominalType {
      reason: specific.reason,
      module_reference: specific.module_reference,
      id: specific.id,
      type_arguments,
    });
  }
  None
}

fn contextual_type_meet_opt(general: &Type, specific: &Type) -> Option<Type> {
  if let Type::Any(reason, specific_is_placeholder) = specific {
    if let Type::Any(_, general_is_placeholder) = general {
      return Some(Type::Any(*reason, *specific_is_placeholder && *general_is_placeholder));
    }
    return Some(general.reposition(specific.get_reason().use_loc));
  }
  match general {
    Type::Any(_, _) => Some(specific.clone()),
    Type::Primitive(_, _) => {
      if general.is_the_same_type(specific) {
        Some(specific.clone())
      } else {
        None
      }
    }
    Type::Nominal(g) => {
      Some(Type::Nominal(contextual_nominal_type_meet_opt(g, specific.as_nominal()?)?))
    }
    Type::Generic(_, id1) => {
      let (_, id2) = specific.as_generic()?;
      if id1.eq(id2) {
        Some(specific.clone())
      } else {
        None
      }
    }
    Type::Fn(FunctionType { reason: _, argument_types: args1, return_type: r1 }) => {
      let FunctionType { reason, argument_types: args2, return_type: r2 } = specific.as_fn()?;
      if args1.len() == args2.len() {
        let mut argument_types = vec![];
        for (g, s) in args1.iter().zip(args2) {
          if let Some(arg) = contextual_type_meet_opt(g, s) {
            argument_types.push(Rc::new(arg));
          } else {
            return None;
          }
        }
        if let Some(r) = contextual_type_meet_opt(r1, r2) {
          return Some(Type::Fn(FunctionType {
            reason: *reason,
            argument_types,
            return_type: Rc::new(r),
          }));
        }
      }
      None
    }
  }
}

pub(super) fn contextual_type_meet(
  general: &Type,
  specific: &Type,
  heap: &Heap,
  error_set: &mut ErrorSet,
) -> Type {
  if let Some(t) = contextual_type_meet_opt(general, specific) {
    t
  } else {
    error_set.report_incompatible_type_error(
      specific.get_reason().use_loc,
      general.pretty_print(heap),
      specific.pretty_print(heap),
    );
    specific.clone()
  }
}

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
    module_reference: type_.module_reference,
    id: type_.id,
    type_arguments: type_
      .type_arguments
      .iter()
      .map(|it| perform_type_substitution(it, mapping))
      .collect_vec(),
  }
}

fn nominal_type_has_placeholder_type(type_: &NominalType) -> bool {
  type_.type_arguments.iter().any(|t| has_placeholder_type(t))
}

fn has_placeholder_type(type_: &Type) -> bool {
  match type_ {
    Type::Any(_, is_placeholder) => *is_placeholder,
    Type::Primitive(_, _) | Type::Generic(_, _) => false,
    Type::Nominal(nominal_type) => nominal_type_has_placeholder_type(nominal_type),
    Type::Fn(fn_type) => {
      fn_type.argument_types.iter().any(|t| has_placeholder_type(t))
        || has_placeholder_type(&fn_type.return_type)
    }
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
        if !has_placeholder_type(concrete) {
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
  heap: &Heap,
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
    Rc::new(contextual_type_meet(&solved_generic_type, concrete, heap, error_set));
  TypeConstraintSolution {
    solved_substitution,
    solved_generic_type,
    solved_contextually_typed_concrete_type,
  }
}
