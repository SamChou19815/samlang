use super::{
  checker_utils::{
    perform_fn_type_substitution, perform_id_type_substitution_asserting_id_type_return,
  },
  typing_context::{
    GlobalTypingContext, InterfaceTypingContext, MemberTypeInformation, ModuleTypingContext,
    TypeDefinitionTypingContext,
  },
};
use crate::{
  ast::{
    source::{
      ClassMemberDeclaration, FieldType, FunctionType, ISourceType, IdType, Module, Toplevel, Type,
      TypeParameter, TypeParameterSignature,
    },
    ModuleReference, Reason,
  },
  common::{rcs, Str},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{BTreeMap, HashMap, HashSet},
  ops::Deref,
  rc::Rc,
};

struct UnoptimizedInterfaceTypingContext {
  functions: Rc<BTreeMap<Str, Rc<MemberTypeInformation>>>,
  methods: Rc<BTreeMap<Str, Rc<MemberTypeInformation>>>,
  type_parameters: Vec<TypeParameterSignature>,
  extends_or_implements: Vec<IdType>,
}

struct UnoptimizedModuleTypingContext {
  type_definitions: BTreeMap<Str, TypeDefinitionTypingContext>,
  interfaces: BTreeMap<Str, UnoptimizedInterfaceTypingContext>,
  classes: BTreeMap<Str, UnoptimizedInterfaceTypingContext>,
}

struct InterfaceInliningCollector {
  functions: Rc<BTreeMap<Str, Rc<MemberTypeInformation>>>,
  methods: Rc<BTreeMap<Str, Rc<MemberTypeInformation>>>,
  super_types: Vec<IdType>,
}

fn recursive_compute_interface_members_chain(
  interface_type: &IdType,
  unoptimized_global_typing_context: &HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  collector: &mut Vec<InterfaceInliningCollector>,
  visited: &mut HashMap<ModuleReference, HashSet<Str>>,
  error_set: &mut ErrorSet,
) {
  match visited.get_mut(&interface_type.module_reference) {
    Some(visited_types) if visited_types.contains(&interface_type.id) => {
      error_set.report_cyclic_type_definition_error(&Type::Id(interface_type.clone()));
      return;
    }
    Some(visited_types) => {
      visited_types.insert(interface_type.id.clone());
    }
    None => {
      visited.insert(
        interface_type.module_reference.clone(),
        HashSet::from([interface_type.id.clone()]),
      );
    }
  }
  if let Some(interface_context) = unoptimized_global_typing_context
    .get(&interface_type.module_reference)
    .and_then(|module_context| module_context.interfaces.get(&interface_type.id))
  {
    let mut subst_mapping = HashMap::new();
    for (tparam, targ) in
      interface_context.type_parameters.iter().zip(&interface_type.type_arguments)
    {
      subst_mapping.insert(tparam.name.clone(), targ.clone());
    }
    let mut inlined_methods = BTreeMap::new();
    for (name, method) in interface_context.methods.iter() {
      let type_parameters = method
        .type_parameters
        .iter()
        .map(|tparam| {
          let bound = tparam.bound.as_ref().map(|t| {
            Rc::new(perform_id_type_substitution_asserting_id_type_return(t, &subst_mapping))
          });
          TypeParameterSignature { name: tparam.name.clone(), bound }
        })
        .collect_vec();
      let type_ = perform_fn_type_substitution(&method.type_, &subst_mapping);
      inlined_methods.insert(
        name.clone(),
        Rc::new(MemberTypeInformation { is_public: method.is_public, type_parameters, type_ }),
      );
    }
    let base_interface_types = interface_context
      .extends_or_implements
      .iter()
      .map(|id_type| perform_id_type_substitution_asserting_id_type_return(id_type, &subst_mapping))
      .collect_vec();
    for base in &base_interface_types {
      recursive_compute_interface_members_chain(
        base,
        unoptimized_global_typing_context,
        collector,
        visited,
        error_set,
      );
    }
    collector.push(InterfaceInliningCollector {
      functions: interface_context.functions.clone(),
      methods: Rc::new(inlined_methods),
      super_types: base_interface_types,
    });
  }
}

fn get_fully_inlined_interface_context(
  instantiated_interface_type: &IdType,
  unoptimized_global_typing_context: &HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  error_set: &mut ErrorSet,
) -> InterfaceInliningCollector {
  let mut collector = vec![];
  let mut visited = HashMap::new();
  recursive_compute_interface_members_chain(
    instantiated_interface_type,
    unoptimized_global_typing_context,
    &mut collector,
    &mut visited,
    error_set,
  );
  let mut functions = BTreeMap::new();
  let mut methods = BTreeMap::new();
  let mut super_types = vec![];
  for one_collector in collector {
    // Shadowing is allowed, as long as type matches.
    functions.extend(one_collector.functions.deref().clone().into_iter());
    methods.extend(one_collector.methods.deref().clone().into_iter());
    super_types.extend(one_collector.super_types.into_iter());
  }
  super_types.push(instantiated_interface_type.clone());
  InterfaceInliningCollector {
    functions: Rc::new(functions),
    methods: Rc::new(methods),
    super_types,
  }
}

fn check_class_member_conformance_with_signature(
  expected: &MemberTypeInformation,
  actual: &MemberTypeInformation,
  error_set: &mut ErrorSet,
) {
  if expected.type_parameters.len() != actual.type_parameters.len() {
    error_set.report_arity_mismatch_error(
      &actual.type_.reason.use_loc,
      "type parameters",
      expected.type_parameters.len(),
      actual.type_parameters.len(),
    );
  }
  let mut has_type_parameter_conformance_errors = false;
  for (e, a) in expected.type_parameters.iter().zip(&actual.type_parameters) {
    if e.name != a.name {
      has_type_parameter_conformance_errors = true;
    }
    match (&e.bound, &a.bound) {
      (None, Some(_)) | (Some(_), None) => {
        has_type_parameter_conformance_errors = true;
      }
      (None, None) => { /* Great! */ }
      (Some(e_bound), Some(a_bound)) => {
        if !e_bound.is_the_same_type(a_bound) {
          has_type_parameter_conformance_errors = true;
        }
      }
    }
  }
  if has_type_parameter_conformance_errors {
    error_set.report_type_parameter_mismatch_error(
      &actual.type_.reason.use_loc,
      &expected.type_parameters,
    );
  } else if !expected.type_.is_the_same_type(&actual.type_) {
    error_set.report_unexpected_type_error(
      &actual.type_.reason.use_loc,
      &expected.type_,
      &actual.type_,
    );
  }
}

fn validate_and_patch_member_map(
  existing_map: &mut BTreeMap<Str, Rc<MemberTypeInformation>>,
  newly_inlined_map: &BTreeMap<Str, Rc<MemberTypeInformation>>,
  error_set: &mut ErrorSet,
) {
  for (name, info) in newly_inlined_map {
    if let Some(existing) = existing_map.get(name) {
      check_class_member_conformance_with_signature(existing, info, error_set);
    }
    existing_map.insert(name.clone(), info.clone());
  }
}

fn get_fully_inlined_multiple_interface_context(
  instantiated_interface_types: &Vec<IdType>,
  unoptimized_global_typing_context: &HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  error_set: &mut ErrorSet,
) -> InterfaceInliningCollector {
  let mut functions_acc = BTreeMap::new();
  let mut methods_acc = BTreeMap::new();
  let mut super_types_acc = vec![];

  for instantiated_interface_type in instantiated_interface_types {
    if let Some(module_cx) =
      unoptimized_global_typing_context.get(&instantiated_interface_type.module_reference)
    {
      if module_cx.classes.contains_key(&instantiated_interface_type.id) {
        error_set.report_unexpected_type_kind_error(
          &instantiated_interface_type.reason.use_loc,
          "interface type",
          "class type",
        );
      } else if !module_cx.interfaces.contains_key(&instantiated_interface_type.id) {
        error_set.report_unresolved_name_error(
          &instantiated_interface_type.reason.use_loc,
          &instantiated_interface_type.id,
        );
      }
    } else {
      error_set.report_unresolved_name_error(
        &instantiated_interface_type.reason.use_loc,
        &instantiated_interface_type.id,
      );
    }

    let inlined = get_fully_inlined_interface_context(
      instantiated_interface_type,
      unoptimized_global_typing_context,
      error_set,
    );
    validate_and_patch_member_map(&mut functions_acc, &inlined.functions, error_set);
    validate_and_patch_member_map(&mut methods_acc, &inlined.methods, error_set);
    super_types_acc.extend(inlined.super_types.into_iter());
  }

  InterfaceInliningCollector {
    functions: Rc::new(functions_acc),
    methods: Rc::new(methods_acc),
    super_types: super_types_acc,
  }
}

fn ast_type_params_to_sig_type_params(
  type_parameters: &[TypeParameter],
) -> Vec<TypeParameterSignature> {
  type_parameters
    .iter()
    .map(|it| TypeParameterSignature { name: it.name.name.clone(), bound: it.bound.clone() })
    .collect_vec()
}

fn check_class_member_conformance_with_ast(
  expect_is_method: bool,
  expected: &MemberTypeInformation,
  actual: &ClassMemberDeclaration,
  error_set: &mut ErrorSet,
) {
  // We first filter out incompatible kind
  if expect_is_method && !actual.is_method {
    error_set.report_unexpected_type_kind_error(&actual.loc, "method", "function");
    return;
  }
  if !expect_is_method && actual.is_method {
    error_set.report_unexpected_type_kind_error(&actual.loc, "function", "method");
    return;
  }
  if !actual.is_public {
    error_set.report_unexpected_type_kind_error(
      &actual.loc,
      "public class member",
      "private class member",
    );
  }

  let actual_sig = MemberTypeInformation {
    is_public: actual.is_public,
    type_parameters: ast_type_params_to_sig_type_params(&actual.type_parameters),
    type_: actual.type_.clone(),
  };
  check_class_member_conformance_with_signature(expected, &actual_sig, error_set);
}

fn check_module_member_interface_conformance(
  unoptimized_global_typing_context: &HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  actual_interface: &Toplevel,
  error_set: &mut ErrorSet,
) -> InterfaceInliningCollector {
  let fully_inlined_interface_context = get_fully_inlined_multiple_interface_context(
    actual_interface.extends_or_implements_nodes(),
    unoptimized_global_typing_context,
    error_set,
  );

  let mut actual_members_map = HashMap::new();
  for member in actual_interface.members_iter() {
    actual_members_map.insert(member.name.name.clone(), member);
  }
  let mut missing_members = vec![];
  for (name, expected_member) in fully_inlined_interface_context.functions.iter() {
    if let Some(actual_member) = actual_members_map.get(name) {
      check_class_member_conformance_with_ast(false, expected_member, actual_member, error_set);
    } else {
      missing_members.push(name.to_string());
    }
  }
  for (name, expected_member) in fully_inlined_interface_context.methods.iter() {
    if let Some(actual_member) = actual_members_map.get(name) {
      check_class_member_conformance_with_ast(true, expected_member, actual_member, error_set);
    } else {
      missing_members.push(name.to_string());
    }
  }
  if actual_interface.is_class() && !missing_members.is_empty() {
    error_set.report_missing_definition_error(actual_interface.loc(), missing_members);
  }

  fully_inlined_interface_context
}

fn optimize_global_typing_context_with_interface_conformance_checking(
  sources: &HashMap<ModuleReference, Module>,
  unoptimized_global_typing_context: HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
  builtin_module_types: ModuleTypingContext,
  error_set: &mut ErrorSet,
) -> GlobalTypingContext {
  let mut optimized_global_typing_context = HashMap::new();
  optimized_global_typing_context.insert(ModuleReference::root(), builtin_module_types);

  for (module_reference, module) in sources {
    let module_typing_context = unoptimized_global_typing_context.get(module_reference).unwrap();
    let mut optimized_interfaces = BTreeMap::new();
    for toplevel in &module.toplevels {
      let collector = check_module_member_interface_conformance(
        &unoptimized_global_typing_context,
        toplevel,
        error_set,
      );
      let unoptimized_class_typing_context = if toplevel.is_class() {
        module_typing_context.classes.get(&toplevel.name().name).unwrap()
      } else {
        module_typing_context.interfaces.get(&toplevel.name().name).unwrap()
      };
      let mut functions = collector.functions.deref().clone();
      for (name, info) in unoptimized_class_typing_context.functions.iter() {
        functions.insert(name.clone(), info.clone());
      }
      let mut methods = collector.methods.deref().clone();
      for (name, info) in unoptimized_class_typing_context.methods.iter() {
        methods.insert(name.clone(), info.clone());
      }
      optimized_interfaces.insert(
        toplevel.name().name.clone(),
        Rc::new(InterfaceTypingContext {
          is_concrete: toplevel.is_class(),
          functions: Rc::new(functions),
          methods: Rc::new(methods),
          type_parameters: unoptimized_class_typing_context.type_parameters.clone(),
          super_types: collector.super_types,
        }),
      );
    }
    optimized_global_typing_context.insert(
      module_reference.clone(),
      ModuleTypingContext {
        type_definitions: module_typing_context.type_definitions.clone(),
        interfaces: optimized_interfaces,
      },
    );
  }

  optimized_global_typing_context
}

fn build_unoptimized_interface_typing_context(
  toplevel: &Toplevel,
) -> UnoptimizedInterfaceTypingContext {
  let mut functions = BTreeMap::new();
  let mut methods = BTreeMap::new();
  for member in toplevel.members_iter() {
    let type_info = Rc::new(MemberTypeInformation {
      is_public: member.is_public,
      type_parameters: ast_type_params_to_sig_type_params(&member.type_parameters),
      type_: member.type_.clone(),
    });
    if member.is_method {
      methods.insert(member.name.name.clone(), type_info);
    } else {
      functions.insert(member.name.name.clone(), type_info);
    }
  }
  UnoptimizedInterfaceTypingContext {
    functions: Rc::new(functions),
    methods: Rc::new(methods),
    type_parameters: ast_type_params_to_sig_type_params(toplevel.type_parameters()),
    extends_or_implements: toplevel.extends_or_implements_nodes().clone(),
  }
}

pub(super) fn build_global_typing_context(
  sources: &HashMap<ModuleReference, Module>,
  error_set: &mut ErrorSet,
  builtin_module_types: ModuleTypingContext,
) -> GlobalTypingContext {
  let mut unoptimized_global_typing_context = HashMap::new();

  for (module_reference, Module { imports: _, toplevels }) in sources {
    let mut interfaces = BTreeMap::new();
    let mut classes = BTreeMap::new();
    let mut type_definitions = BTreeMap::new();

    for toplevel in toplevels {
      match toplevel {
        Toplevel::Interface(interface) => {
          interfaces.insert(
            interface.name.name.clone(),
            build_unoptimized_interface_typing_context(toplevel),
          );
        }
        Toplevel::Class(class) => {
          let UnoptimizedInterfaceTypingContext {
            functions,
            methods,
            type_parameters,
            extends_or_implements,
          } = build_unoptimized_interface_typing_context(toplevel);
          let class_type = Rc::new(Type::Id(IdType {
            reason: Reason::new(class.name.loc.clone(), Some(class.name.loc.clone())),
            module_reference: module_reference.clone(),
            id: class.name.name.clone(),
            type_arguments: class
              .type_parameters
              .iter()
              .map(|it| {
                Rc::new(Type::Id(IdType {
                  reason: Reason::new(it.loc.clone(), Some(it.loc.clone())),
                  module_reference: module_reference.clone(),
                  id: it.name.name.clone(),
                  type_arguments: vec![],
                }))
              })
              .collect_vec(),
          }));
          let type_def = &class.type_definition;
          let type_def_reason = Reason::new(type_def.loc.clone(), Some(type_def.loc.clone()));
          let mut functions_with_ctors = functions.deref().clone();
          if type_def.is_object {
            functions_with_ctors.insert(
              rcs("init"),
              Rc::new(MemberTypeInformation {
                is_public: true,
                type_parameters: ast_type_params_to_sig_type_params(&class.type_parameters),
                type_: FunctionType {
                  reason: type_def_reason,
                  argument_types: type_def
                    .names
                    .iter()
                    .map(|it| type_def.mappings.get(&it.name).unwrap().type_.clone())
                    .collect_vec(),
                  return_type: class_type,
                },
              }),
            );
          } else {
            let type_def_reason = Reason::new(type_def.loc.clone(), Some(type_def.loc.clone()));
            for (tag, FieldType { type_, is_public: _ }) in &type_def.mappings {
              functions_with_ctors.insert(
                tag.clone(),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: ast_type_params_to_sig_type_params(&class.type_parameters),
                  type_: FunctionType {
                    reason: type_def_reason.clone(),
                    argument_types: vec![type_.clone()],
                    return_type: class_type.clone(),
                  },
                }),
              );
            }
          }
          classes.insert(
            class.name.name.clone(),
            UnoptimizedInterfaceTypingContext {
              functions: Rc::new(functions_with_ctors),
              methods,
              type_parameters,
              extends_or_implements,
            },
          );
          type_definitions.insert(
            class.name.name.clone(),
            TypeDefinitionTypingContext {
              is_object: type_def.is_object,
              names: type_def.names.iter().map(|it| it.name.clone()).collect_vec(),
              mappings: type_def.mappings.clone(),
            },
          );
        }
      }
    }
    unoptimized_global_typing_context.insert(
      module_reference.clone(),
      UnoptimizedModuleTypingContext { type_definitions, interfaces, classes },
    );
  }

  optimize_global_typing_context_with_interface_conformance_checking(
    sources,
    unoptimized_global_typing_context,
    builtin_module_types,
    error_set,
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::{
      source::{
        test_builder, ClassMemberDefinition, Id, InterfaceDeclarationCommon, ModuleMembersImport,
        TypeDefinition,
      },
      Location,
    },
    checker::typing_context::create_builtin_module_typing_context,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn check_class_member_conformance_with_ast_tests() {
    let mut error_set = ErrorSet::new();
    let builder = test_builder::create();

    check_class_member_conformance_with_ast(
      false,
      &MemberTypeInformation {
        is_public: true,
        type_parameters: vec![],
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
      },
      &ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: true,
        is_method: true,
        name: Id::from(""),
        type_parameters: Rc::new(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
        parameters: Rc::new(vec![]),
      },
      &mut error_set,
    );
    check_class_member_conformance_with_ast(
      true,
      &MemberTypeInformation {
        is_public: true,
        type_parameters: vec![],
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
      },
      &ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: true,
        is_method: false,
        name: Id::from(""),
        type_parameters: Rc::new(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
        parameters: Rc::new(vec![]),
      },
      &mut error_set,
    );
    check_class_member_conformance_with_ast(
      true,
      &MemberTypeInformation {
        is_public: true,
        type_parameters: vec![TypeParameterSignature { name: rcs("A"), bound: None }],
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
      },
      &ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: false,
        is_method: true,
        name: Id::from(""),
        type_parameters: Rc::new(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.bool_type(),
        },
        parameters: Rc::new(vec![]),
      },
      &mut error_set,
    );
    check_class_member_conformance_with_ast(
      true,
      &MemberTypeInformation {
        is_public: true,
        type_parameters: vec![TypeParameterSignature {
          name: rcs("A"),
          bound: Some(Rc::new(builder.simple_id_type_unwrapped("B"))),
        }],
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
      },
      &ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: false,
        is_method: true,
        name: Id::from(""),
        type_parameters: Rc::new(vec![TypeParameter {
          loc: Location::dummy(),
          associated_comments: Rc::new(vec![]),
          name: Id::from("A"),
          bound: Some(Rc::new(builder.simple_id_type_unwrapped("B"))),
        }]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
        parameters: Rc::new(vec![]),
      },
      &mut error_set,
    );

    check_class_member_conformance_with_ast(
      true,
      &MemberTypeInformation {
        is_public: true,
        type_parameters: vec![
          TypeParameterSignature { name: rcs("A"), bound: None },
          TypeParameterSignature {
            name: rcs("C"),
            bound: Some(Rc::new(builder.simple_id_type_unwrapped("A"))),
          },
          TypeParameterSignature {
            name: rcs("D"),
            bound: Some(Rc::new(builder.simple_id_type_unwrapped("A"))),
          },
        ],
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
      },
      &ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: false,
        is_method: true,
        name: Id::from(""),
        type_parameters: Rc::new(vec![
          TypeParameter {
            loc: Location::dummy(),
            associated_comments: Rc::new(vec![]),
            name: Id::from("B"),
            bound: None,
          },
          TypeParameter {
            loc: Location::dummy(),
            associated_comments: Rc::new(vec![]),
            name: Id::from("C"),
            bound: None,
          },
          TypeParameter {
            loc: Location::dummy(),
            associated_comments: Rc::new(vec![]),
            name: Id::from("D"),
            bound: Some(Rc::new(builder.simple_id_type_unwrapped("B"))),
          },
        ]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.bool_type(),
        },
        parameters: Rc::new(vec![]),
      },
      &mut error_set,
    );

    assert_eq!(
      vec![
        "__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type parameters size. Expected: 1, actual: 0.",
        "__DUMMY__.sam:0:0-0:0: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of `<A, C : A, D : A>`.",
        "__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `function`, actual: `method`.",
        "__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `method`, actual: `function`.",
        "__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `public class member`, actual: `private class member`.",
        "__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `() -> int`, actual: `() -> bool`.",
      ],
      error_set.error_messages()
    );
  }

  fn inlined_cx_from_type(
    unoptimized_global_typing_context: &HashMap<ModuleReference, UnoptimizedModuleTypingContext>,
    id_types: Vec<IdType>,
  ) -> String {
    let mut error_set = ErrorSet::new();
    let collector = get_fully_inlined_multiple_interface_context(
      &id_types,
      unoptimized_global_typing_context,
      &mut error_set,
    );
    let mut fun_strs = vec![];
    let mut met_strs = vec![];
    for (name, info) in collector.functions.iter() {
      fun_strs.push(info.pretty_print(name));
    }
    for (name, info) in collector.methods.iter() {
      met_strs.push(info.pretty_print(name));
    }
    fun_strs.sort();
    met_strs.sort();
    format!(
      "functions:\n{}\nmethods:\n{}\nsuper_types: {}",
      fun_strs.join("\n"),
      met_strs.join("\n"),
      collector.super_types.iter().map(|it| it.pretty_print()).join(", ")
    )
  }

  #[test]
  fn get_fully_inlined_multiple_interface_context_tests() {
    let builder = test_builder::create();
    let unoptimized_global_cx = HashMap::from([(
      ModuleReference::dummy(),
      UnoptimizedModuleTypingContext {
        type_definitions: BTreeMap::new(),
        classes: BTreeMap::from([(
          rcs("C"),
          UnoptimizedInterfaceTypingContext {
            functions: Rc::new(BTreeMap::new()),
            methods: Rc::new(BTreeMap::new()),
            type_parameters: vec![],
            extends_or_implements: vec![],
          },
        )]),
        interfaces: BTreeMap::from([
          (
            rcs("IUseNonExistent"),
            UnoptimizedInterfaceTypingContext {
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              extends_or_implements: vec![
                builder.simple_id_type_unwrapped("not_exist"),
                builder.simple_id_type_unwrapped("C"),
              ],
            },
          ),
          (
            rcs("IBase"),
            UnoptimizedInterfaceTypingContext {
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              extends_or_implements: vec![],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::from([(
                rcs("m1"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![TypeParameterSignature {
                    name: rcs("C"),
                    bound: Some(Rc::new(builder.simple_id_type_unwrapped("A"))),
                  }],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![builder.simple_id_type("A"), builder.simple_id_type("B")],
                    return_type: builder.simple_id_type("C"),
                  },
                }),
              )])),
            },
          ),
          (
            rcs("ILevel1"),
            UnoptimizedInterfaceTypingContext {
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              extends_or_implements: vec![builder.general_id_type_unwrapped(
                "IBase",
                vec![builder.int_type(), builder.simple_id_type("B")],
              )],
              functions: Rc::new(BTreeMap::from([(
                rcs("f1"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![TypeParameterSignature { name: rcs("C"), bound: None }],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![builder.simple_id_type("A"), builder.simple_id_type("B")],
                    return_type: builder.simple_id_type("C"),
                  },
                }),
              )])),
              methods: Rc::new(BTreeMap::from([(
                rcs("m1"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![TypeParameterSignature {
                    name: rcs("C"),
                    bound: Some(Rc::new(builder.simple_id_type_unwrapped("A"))),
                  }],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![builder.simple_id_type("A"), builder.simple_id_type("B")],
                    return_type: builder.simple_id_type("C"),
                  },
                }),
              )])),
            },
          ),
          (
            rcs("ILevel2"),
            UnoptimizedInterfaceTypingContext {
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              extends_or_implements: vec![builder.general_id_type_unwrapped(
                "ILevel1",
                vec![builder.simple_id_type("A"), builder.int_type()],
              )],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::from([(
                rcs("m2"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![TypeParameterSignature { name: rcs("C"), bound: None }],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![builder.simple_id_type("A"), builder.simple_id_type("B")],
                    return_type: builder.simple_id_type("C"),
                  },
                }),
              )])),
            },
          ),
          (
            rcs("ICyclic1"),
            UnoptimizedInterfaceTypingContext {
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
              type_parameters: vec![],
              extends_or_implements: vec![builder.simple_id_type_unwrapped("ICyclic2")],
            },
          ),
          (
            rcs("ICyclic2"),
            UnoptimizedInterfaceTypingContext {
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
              type_parameters: vec![],
              extends_or_implements: vec![builder.simple_id_type_unwrapped("ICyclic1")],
            },
          ),
          (
            rcs("ConflictExtends1"),
            UnoptimizedInterfaceTypingContext {
              type_parameters: vec![],
              extends_or_implements: vec![],
              functions: Rc::new(BTreeMap::from([(
                rcs("f"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              )])),
              methods: Rc::new(BTreeMap::from([(
                rcs("m"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              )])),
            },
          ),
          (
            rcs("ConflictExtends2"),
            UnoptimizedInterfaceTypingContext {
              type_parameters: vec![],
              extends_or_implements: vec![],
              functions: Rc::new(BTreeMap::from([(
                rcs("f"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              )])),
              methods: Rc::new(BTreeMap::from([(
                rcs("m"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.bool_type(),
                  },
                }),
              )])),
            },
          ),
        ]),
      },
    )]);

    assert_eq!(
      "functions:\n\nmethods:\n\nsuper_types: C",
      inlined_cx_from_type(&unoptimized_global_cx, vec![builder.simple_id_type_unwrapped("C")])
    );
    assert_eq!(
      "functions:\n\nmethods:\n\nsuper_types: I_not_exist",
      inlined_cx_from_type(
        &unoptimized_global_cx,
        vec![builder.simple_id_type_unwrapped("I_not_exist")]
      )
    );
    assert_eq!(
      "functions:\n\nmethods:\n\nsuper_types: not_exist, C, IUseNonExistent",
      inlined_cx_from_type(
        &unoptimized_global_cx,
        vec![builder.simple_id_type_unwrapped("IUseNonExistent")]
      )
    );
    assert_eq!(
      "functions:\n\nmethods:\n\nsuper_types: I",
      inlined_cx_from_type(&unoptimized_global_cx, vec![builder.simple_id_type_unwrapped("I")])
    );
    assert_eq!(
      r#"
functions:
public f1<C>(A, B) -> C
methods:
public m1<C : A>(A, int) -> C
public m2<C>(A, B) -> C
super_types: IBase<int, int>, ILevel1<A, int>, ILevel2
"#
      .trim(),
      inlined_cx_from_type(
        &unoptimized_global_cx,
        vec![builder.simple_id_type_unwrapped("ILevel2")]
      )
    );

    let mut error_set = ErrorSet::new();
    get_fully_inlined_multiple_interface_context(
      &vec![builder.simple_id_type_unwrapped("ICyclic1")],
      &unoptimized_global_cx,
      &mut error_set,
    );
    get_fully_inlined_multiple_interface_context(
      &vec![builder.simple_id_type_unwrapped("ICyclic1")],
      &unoptimized_global_cx,
      &mut error_set,
    );
    get_fully_inlined_multiple_interface_context(
      &vec![builder.simple_id_type_unwrapped("ICyclic2")],
      &unoptimized_global_cx,
      &mut error_set,
    );
    get_fully_inlined_multiple_interface_context(
      &vec![
        builder.simple_id_type_unwrapped("ConflictExtends1"),
        builder.simple_id_type_unwrapped("ConflictExtends2"),
      ],
      &unoptimized_global_cx,
      &mut error_set,
    );

    assert_eq!(
      vec![
        "__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic1` has a cyclic definition.",
        "__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic2` has a cyclic definition.",
        "__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `() -> int`, actual: `() -> bool`.",
      ],
      error_set.error_messages()
    );
  }

  #[test]
  fn check_module_member_interface_conformance_tests() {
    let builder = test_builder::create();
    let unoptimized_global_cx = HashMap::from([(
      ModuleReference::dummy(),
      UnoptimizedModuleTypingContext {
        type_definitions: BTreeMap::new(),
        classes: BTreeMap::new(),
        interfaces: BTreeMap::from([(
          rcs("IBase"),
          UnoptimizedInterfaceTypingContext {
            type_parameters: vec![],
            extends_or_implements: vec![],
            functions: Rc::new(BTreeMap::from([
              (
                rcs("f1"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              ),
              (
                rcs("f2"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              ),
            ])),
            methods: Rc::new(BTreeMap::from([
              (
                rcs("m1"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              ),
              (
                rcs("m2"),
                Rc::new(MemberTypeInformation {
                  is_public: true,
                  type_parameters: vec![],
                  type_: FunctionType {
                    reason: Reason::dummy(),
                    argument_types: vec![],
                    return_type: builder.int_type(),
                  },
                }),
              ),
            ])),
          },
        )]),
      },
    )]);

    let mut error_set = ErrorSet::new();
    check_module_member_interface_conformance(
      &unoptimized_global_cx,
      &Toplevel::Class(InterfaceDeclarationCommon {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        name: Id::from("A"),
        type_parameters: vec![],
        extends_or_implements_nodes: vec![builder.simple_id_type_unwrapped("IBase")],
        type_definition: TypeDefinition {
          loc: Location::dummy(),
          is_object: true,
          names: vec![],
          mappings: HashMap::new(),
        },
        members: vec![
          ClassMemberDefinition {
            decl: ClassMemberDeclaration {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              is_public: true,
              is_method: false,
              name: Id::from("f1"),
              type_parameters: Rc::new(vec![]),
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: builder.int_type(),
              },
              parameters: Rc::new(vec![]),
            },
            body: builder.false_expr(),
          },
          ClassMemberDefinition {
            decl: ClassMemberDeclaration {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              is_public: true,
              is_method: true,
              name: Id::from("m1"),
              type_parameters: Rc::new(vec![]),
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: builder.int_type(),
              },
              parameters: Rc::new(vec![]),
            },
            body: builder.false_expr(),
          },
        ],
      }),
      &mut error_set,
    );
  }

  #[test]
  fn builder_tests() {
    let m0_ref = ModuleReference::ordinary(vec![rcs("Module0")]);
    let m1_ref = ModuleReference::ordinary(vec![rcs("Module1")]);
    let builder = test_builder::create();

    let test_sources = HashMap::from([
      (
        m0_ref.clone(),
        Module {
          imports: vec![],
          toplevels: vec![Toplevel::Class(InterfaceDeclarationCommon {
            loc: Location::dummy(),
            associated_comments: Rc::new(vec![]),
            name: Id::from("Class0"),
            type_parameters: vec![TypeParameter {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              name: Id::from("T"),
              bound: None,
            }],
            extends_or_implements_nodes: vec![],
            type_definition: TypeDefinition {
              loc: Location::dummy(),
              is_object: false,
              names: vec![Id::from("A")],
              mappings: HashMap::from([(
                rcs("A"),
                FieldType { is_public: true, type_: builder.int_type() },
              )]),
            },
            members: vec![],
          })],
        },
      ),
      (
        m1_ref.clone(),
        Module {
          imports: vec![ModuleMembersImport {
            loc: Location::dummy(),
            imported_members: vec![Id::from("Class0"), Id::from("BAD_CLASS_THAT_DOESNT_EXIST")],
            imported_module: m0_ref.clone(),
            imported_module_loc: Location::dummy(),
          }],
          toplevels: vec![
            Toplevel::Class(InterfaceDeclarationCommon {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              name: Id::from("Class1"),
              type_parameters: vec![],
              extends_or_implements_nodes: vec![],
              type_definition: TypeDefinition {
                loc: Location::dummy(),
                is_object: true,
                names: vec![Id::from("a")],
                mappings: HashMap::from([(
                  rcs("a"),
                  FieldType { is_public: true, type_: builder.int_type() },
                )]),
              },
              members: vec![
                ClassMemberDefinition {
                  decl: ClassMemberDeclaration {
                    loc: Location::dummy(),
                    associated_comments: Rc::new(vec![]),
                    is_public: true,
                    is_method: true,
                    name: Id::from("m1"),
                    type_parameters: Rc::new(vec![]),
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.int_type(),
                    },
                    parameters: Rc::new(vec![]),
                  },
                  body: builder.false_expr(),
                },
                ClassMemberDefinition {
                  decl: ClassMemberDeclaration {
                    loc: Location::dummy(),
                    associated_comments: Rc::new(vec![]),
                    is_public: false,
                    is_method: false,
                    name: Id::from("f1"),
                    type_parameters: Rc::new(vec![]),
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.int_type(),
                    },
                    parameters: Rc::new(vec![]),
                  },
                  body: builder.false_expr(),
                },
              ],
            }),
            Toplevel::Interface(InterfaceDeclarationCommon {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              name: Id::from("Interface2"),
              type_parameters: vec![],
              extends_or_implements_nodes: vec![],
              type_definition: (),
              members: vec![],
            }),
            Toplevel::Interface(InterfaceDeclarationCommon {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              name: Id::from("Interface3"),
              type_parameters: vec![],
              extends_or_implements_nodes: vec![],
              type_definition: (),
              members: vec![ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: Rc::new(vec![]),
                is_public: true,
                is_method: false,
                name: Id::from("m1"),
                type_parameters: Rc::new(vec![]),
                type_: FunctionType {
                  reason: Reason::dummy(),
                  argument_types: vec![],
                  return_type: builder.int_type(),
                },
                parameters: Rc::new(vec![]),
              }],
            }),
            Toplevel::Class(InterfaceDeclarationCommon {
              loc: Location::dummy(),
              associated_comments: Rc::new(vec![]),
              name: Id::from("Class2"),
              type_parameters: vec![],
              extends_or_implements_nodes: vec![builder.simple_id_type_unwrapped("Interface3")],
              type_definition: TypeDefinition {
                loc: Location::dummy(),
                is_object: true,
                names: vec![],
                mappings: HashMap::new(),
              },
              members: vec![],
            }),
          ],
        },
      ),
    ]);

    let mut error_set = ErrorSet::new();
    let actual_global_cx = build_global_typing_context(
      &test_sources,
      &mut error_set,
      create_builtin_module_typing_context(),
    );
    assert_eq!(3, actual_global_cx.len());

    assert_eq!(
      r#"type_definitions:
Class0:[A(int)]

interfaces:
Class0: class <T> : []
functions:
A: public <T>(int) -> Class0<T>
methods:"#,
      actual_global_cx.get(&m0_ref).unwrap().to_string()
    );
    assert_eq!(
      r#"type_definitions:
Class1:[a:int]
Class2:[]

interfaces:
Class1: class  : []
functions:
f1: private () -> int
init: public (int) -> Class1
methods:
m1: public () -> int
Class2: class  : [Interface3]
functions:
init: public () -> Class2
methods:
Interface2: interface  : []
functions:
methods:
Interface3: interface  : []
functions:
m1: public () -> int
methods:"#,
      actual_global_cx.get(&m1_ref).unwrap().to_string()
    );
  }
}
