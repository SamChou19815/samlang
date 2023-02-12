use crate::{
  ast::Reason,
  checker::type_::{FunctionType, ISourceType, IdType, Type, TypeParameterSignature},
  common::{Heap, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  ops::Deref,
  rc::Rc,
};

fn contextual_type_meet_opt(general: &Type, specific: &Type) -> Option<Type> {
  if let Type::Unknown(_) = specific {
    return Some(general.reposition(specific.get_reason().use_loc));
  }
  match general {
    Type::Unknown(_) => Some(specific.clone()),
    Type::Primitive(_, _) => {
      if general.is_the_same_type(specific) {
        Some(specific.clone())
      } else {
        None
      }
    }
    Type::Id(IdType { reason: _, module_reference: mod_ref1, id: id1, type_arguments: targs1 }) => {
      if let Some(IdType { reason, module_reference: mod_ref2, id: id2, type_arguments: targs2 }) =
        specific.as_id()
      {
        if mod_ref1 == mod_ref2 && id1 == id2 && targs1.len() == targs2.len() {
          let mut type_arguments = vec![];
          for (g, s) in targs1.iter().zip(targs2) {
            if let Some(targ) = contextual_type_meet_opt(g, s) {
              type_arguments.push(Rc::new(targ));
            } else {
              return None;
            }
          }
          return Some(Type::Id(IdType {
            reason: *reason,
            module_reference: *mod_ref2,
            id: *id2,
            type_arguments,
          }));
        }
      }
      None
    }
    Type::Fn(FunctionType { reason: _, argument_types: args1, return_type: r1 }) => {
      if let Type::Fn(FunctionType { reason, argument_types: args2, return_type: r2 }) = specific {
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
    error_set.report_unexpected_type_error(
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
    Type::Unknown(_) | Type::Primitive(_, _) => Rc::new((*t).clone()),
    Type::Id(id_type) => perform_id_type_substitution(id_type, mapping),
    Type::Fn(f) => Rc::new(Type::Fn(perform_fn_type_substitution(f, mapping))),
  }
}

pub(super) fn perform_id_type_substitution(
  id_type: &IdType,
  mapping: &HashMap<PStr, Rc<Type>>,
) -> Rc<Type> {
  if id_type.type_arguments.is_empty() {
    if let Some(replaced) = mapping.get(&id_type.id) {
      return replaced.clone();
    }
  }
  Rc::new(Type::Id(IdType {
    reason: id_type.reason,
    module_reference: id_type.module_reference,
    id: id_type.id,
    type_arguments: id_type
      .type_arguments
      .iter()
      .map(|it| perform_type_substitution(it, mapping))
      .collect_vec(),
  }))
}

pub(super) fn perform_id_type_substitution_asserting_id_type_return(
  id_type: &IdType,
  mapping: &HashMap<PStr, Rc<Type>>,
) -> IdType {
  let t = perform_type_substitution(&Type::Id(id_type.clone()), mapping);
  if let Type::Id(new_id_type) = t.deref() {
    new_id_type.clone()
  } else {
    // panic!("{} => subst => {}", id_type.pretty_print(), t.pretty_print());
    id_type.clone()
  }
}

fn solve_type_constraints_internal(
  concrete: &Type,
  generic: &Type,
  type_parameters: &HashSet<PStr>,
  partially_solved: &mut HashMap<PStr, Rc<Type>>,
) {
  // Unknown types, which might come from expressions that need to be contextually typed (e.g. lambda),
  // do not participate in constraint solving.
  if let Type::Unknown(_) = concrete {
    return;
  }
  match generic {
    Type::Unknown(_) | Type::Primitive(_, _) => {}
    Type::Id(g) => {
      if type_parameters.contains(&g.id) && !partially_solved.contains_key(&g.id) {
        partially_solved.insert(g.id, Rc::new((*concrete).clone()));
        return;
      }
      if let Type::Id(c) = concrete {
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
      // Fill in unknown for unsolved types.
      Rc::new(Type::Unknown(Reason::new(concrete.get_reason().use_loc, None)))
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
