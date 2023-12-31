use super::{
  type_::{
    EnumVariantDefinitionSignature, FunctionType, GlobalSignature, InterfaceSignature,
    MemberSignature, ModuleSignature, NominalType, StructItemDefinitionSignature, Type,
    TypeDefinitionSignature, TypeParameterSignature,
  },
  type_system,
};
use itertools::Itertools;
use samlang_ast::{
  source::{Module, Toplevel, TypeDefinition},
  Reason,
};
use samlang_heap::{ModuleReference, PStr};
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

pub fn build_module_signature(
  module_reference: ModuleReference,
  module: &Module<()>,
) -> ModuleSignature {
  let mut interfaces = HashMap::new();
  for toplevel in &module.toplevels {
    let is_class = toplevel.is_class();
    let private = toplevel.is_private();
    let name = toplevel.name().name;
    let mut functions = HashMap::new();
    let mut methods = HashMap::new();
    for member in toplevel.members_iter() {
      let type_info = MemberSignature {
        is_public: member.is_public,
        type_parameters: TypeParameterSignature::from_list(member.type_parameters.as_ref()),
        type_: FunctionType::from_function(member),
      };
      if member.is_method {
        methods.insert(member.name.name, type_info);
      } else if is_class {
        functions.insert(member.name.name, type_info);
      }
    }
    let toplevel_tparams_sig = TypeParameterSignature::from_list(toplevel.type_parameters());
    let type_definition = if let Toplevel::Class(class) = toplevel {
      let class_type = Rc::new(Type::Nominal(NominalType {
        reason: Reason::new(class.name.loc, Some(class.name.loc)),
        is_class_statics: false,
        module_reference,
        id: class.name.name,
        type_arguments: class
          .type_parameters
          .iter()
          .flat_map(|it| &it.parameters)
          .map(|it| Rc::new(Type::Generic(Reason::new(it.loc, Some(it.loc)), it.name.name)))
          .collect_vec(),
      }));
      match &class.type_definition {
        TypeDefinition::Struct { loc, fields } => {
          let type_def_reason = Reason::new(*loc, Some(*loc));
          let ctor_fn = MemberSignature {
            is_public: true,
            type_parameters: toplevel_tparams_sig.clone(),
            type_: FunctionType {
              reason: type_def_reason,
              argument_types: fields
                .iter()
                .map(|it| Rc::new(Type::from_annotation(&it.annotation)))
                .collect_vec(),
              return_type: class_type,
            },
          };
          functions.insert(
            // init string should be pre-allocated during builtin_cx init
            PStr::INIT,
            ctor_fn,
          );
          Some(TypeDefinitionSignature::Struct(
            fields
              .iter()
              .map(|field| StructItemDefinitionSignature {
                name: field.name.name,
                type_: Rc::new(Type::from_annotation(&field.annotation)),
                is_public: field.is_public,
              })
              .collect(),
          ))
        }
        TypeDefinition::Enum { loc, variants } => {
          let type_def_reason = Reason::new(*loc, Some(*loc));
          for variant in variants {
            let ctor_fn = MemberSignature {
              is_public: true,
              type_parameters: toplevel_tparams_sig.clone(),
              type_: FunctionType {
                reason: type_def_reason,
                argument_types: variant
                  .associated_data_types
                  .iter()
                  .map(|annot| Rc::new(Type::from_annotation(annot)))
                  .collect(),
                return_type: class_type.clone(),
              },
            };
            functions.insert(variant.name.name, ctor_fn);
          }
          Some(TypeDefinitionSignature::Enum(
            variants
              .iter()
              .map(|variant| EnumVariantDefinitionSignature {
                name: variant.name.name,
                types: variant
                  .associated_data_types
                  .iter()
                  .map(|it| Rc::new(Type::from_annotation(it)))
                  .collect(),
              })
              .collect(),
          ))
        }
      }
    } else {
      None
    };
    interfaces.insert(
      name,
      InterfaceSignature {
        private,
        type_definition,
        functions,
        methods,
        type_parameters: toplevel_tparams_sig,
        super_types: toplevel
          .extends_or_implements_nodes()
          .iter()
          .map(NominalType::from_annotation)
          .collect(),
      },
    );
  }
  ModuleSignature { interfaces }
}

#[cfg(test)]
pub(super) fn create_std_signatures_for_test(
  heap: &mut samlang_heap::Heap,
) -> HashMap<ModuleReference, ModuleSignature> {
  samlang_parser::builtin_parsed_std_sources_for_tests(heap)
    .into_iter()
    .map(|(mod_ref, parsed)| (mod_ref, build_module_signature(mod_ref, &parsed)))
    .collect()
}

pub fn build_global_signature(
  sources: &HashMap<ModuleReference, Module<()>>,
  builtin_module_types: ModuleSignature,
) -> GlobalSignature {
  let mut global_cx = HashMap::new();
  global_cx.insert(ModuleReference::ROOT, builtin_module_types);
  for (module_reference, module) in sources {
    global_cx.insert(*module_reference, build_module_signature(*module_reference, module));
  }
  global_cx
}

pub(super) fn resolve_interface_cx(
  global_cx: &GlobalSignature,
  module_reference: ModuleReference,
  toplevel_name: PStr,
) -> Option<&InterfaceSignature> {
  global_cx.get(&module_reference)?.interfaces.get(&toplevel_name)
}

pub(super) struct SuperTypesResolutionResult {
  pub(super) types: Vec<NominalType>,
  pub(super) is_cyclic: bool,
}

impl SuperTypesResolutionResult {
  #[cfg(test)]
  fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    use super::type_::ISourceType;

    format!(
      "resolved: [{}], is_cyclic: {}",
      self.types.iter().map(|it| it.pretty_print(heap)).join(", "),
      self.is_cyclic
    )
  }
}

pub(super) fn resolve_all_member_names(
  global_cx: &GlobalSignature,
  interface_types: &[NominalType],
  method: bool,
) -> HashSet<PStr> {
  let mut collector = HashSet::new();
  let mut lookup_candidates =
    interface_types.iter().map(|t| (t.module_reference, t.id)).collect_vec();
  let mut visited = HashSet::new();
  loop {
    if let Some((mod_ref, toplevel_name)) = lookup_candidates.pop() {
      if !visited.insert((mod_ref, toplevel_name)) {
        // We don't need to worry about popping off keys, because repeated visits will resolve to the
        // exact same names.
        continue;
      }
      if let Some(interface_cx) = resolve_interface_cx(global_cx, mod_ref, toplevel_name) {
        for n in if method { interface_cx.methods.keys() } else { interface_cx.functions.keys() } {
          collector.insert(*n);
        }
        for super_type in interface_cx.super_types.iter() {
          lookup_candidates.push((super_type.module_reference, super_type.id));
        }
      }
    } else {
      return collector;
    }
  }
}

fn resolve_all_transitive_super_types_recursive(
  global_cx: &GlobalSignature,
  interface_type: &NominalType,
  collector: &mut SuperTypesResolutionResult,
  visited: &mut HashSet<(ModuleReference, PStr)>,
) {
  if !visited.insert((interface_type.module_reference, interface_type.id)) {
    collector.is_cyclic = true;
    return;
  }
  if let Some(interface_cx) =
    resolve_interface_cx(global_cx, interface_type.module_reference, interface_type.id)
  {
    let mut subst_mapping = HashMap::new();
    for (tparam, targ) in interface_cx.type_parameters.iter().zip(&interface_type.type_arguments) {
      subst_mapping.insert(tparam.name, targ.clone());
    }
    for super_type in &interface_cx.super_types {
      let instantiated_super_type = type_system::subst_nominal_type(super_type, &subst_mapping);
      resolve_all_transitive_super_types_recursive(
        global_cx,
        &instantiated_super_type,
        collector,
        visited,
      );
      collector.types.push(instantiated_super_type);
    }
  }
  visited.remove(&(interface_type.module_reference, interface_type.id));
}

pub(super) fn resolve_all_transitive_super_types(
  global_cx: &GlobalSignature,
  interface_type: &NominalType,
) -> SuperTypesResolutionResult {
  let mut collector = SuperTypesResolutionResult { types: vec![], is_cyclic: false };
  resolve_all_transitive_super_types_recursive(
    global_cx,
    interface_type,
    &mut collector,
    &mut HashSet::new(),
  );
  collector
}

fn resolve_function_signature_internal<'a>(
  global_cx: &'a GlobalSignature,
  fn_name: PStr,
  all: bool,
  mut lookup_candidates: Vec<(ModuleReference, PStr)>,
  collector: &mut Vec<&'a MemberSignature>,
  visited: &mut HashSet<(ModuleReference, PStr)>,
) {
  loop {
    if !collector.is_empty() && !all {
      return;
    }
    if let Some((mod_ref, toplevel_name)) = lookup_candidates.pop() {
      if !visited.insert((mod_ref, toplevel_name)) {
        // We don't need to worry about popping off keys, because repeated visits will resolve to the
        // exact same function.
        continue; // Cyclic type definitions will be validated by super type resolver.
      }
      if let Some(interface_cx) = resolve_interface_cx(global_cx, mod_ref, toplevel_name) {
        if let Some(info) = interface_cx.functions.get(&fn_name) {
          collector.push(info);
        }
        for super_type in interface_cx.super_types.iter().rev() {
          lookup_candidates.push((super_type.module_reference, super_type.id));
        }
      }
    } else {
      return;
    }
  }
}

pub(super) fn resolve_function_signature(
  global_cx: &GlobalSignature,
  (module_reference, toplevel_name): (ModuleReference, PStr),
  fn_name: PStr,
) -> Vec<&MemberSignature> {
  let mut collector = vec![];
  resolve_function_signature_internal(
    global_cx,
    fn_name,
    false,
    vec![(module_reference, toplevel_name)],
    &mut collector,
    &mut HashSet::new(),
  );
  collector
}

fn resolve_method_signature_recursive(
  global_cx: &GlobalSignature,
  interface_type: &NominalType,
  method_name: PStr,
  all: bool,
  collector: &mut Vec<MemberSignature>,
  visited: &mut HashSet<(ModuleReference, PStr)>,
) {
  if !visited.insert((interface_type.module_reference, interface_type.id)) {
    return; // Cyclic type definitions will be validated by super type resolver.
  }
  if let Some(interface_cx) =
    resolve_interface_cx(global_cx, interface_type.module_reference, interface_type.id)
  {
    let mut subst_mapping = HashMap::new();
    for (tparam, targ) in interface_cx.type_parameters.iter().zip(&interface_type.type_arguments) {
      subst_mapping.insert(tparam.name, targ.clone());
    }
    if let Some(info) = interface_cx.methods.get(&method_name) {
      collector.push(MemberSignature {
        is_public: info.is_public,
        type_parameters: info
          .type_parameters
          .iter()
          .map(|tparam| {
            let bound =
              tparam.bound.as_ref().map(|t| type_system::subst_nominal_type(t, &subst_mapping));
            TypeParameterSignature { name: tparam.name, bound }
          })
          .collect(),
        type_: type_system::subst_fn_type(&info.type_, &subst_mapping),
      });
    }
    for super_type in &interface_cx.super_types {
      if collector.is_empty() || all {
        resolve_method_signature_recursive(
          global_cx,
          &type_system::subst_nominal_type(super_type, &subst_mapping),
          method_name,
          all,
          collector,
          visited,
        );
      }
    }
  }
  visited.remove(&(interface_type.module_reference, interface_type.id));
}

pub(super) fn resolve_method_signature(
  global_cx: &GlobalSignature,
  interface_type: &NominalType,
  method_name: PStr,
) -> Vec<MemberSignature> {
  let mut collector = vec![];
  resolve_method_signature_recursive(
    global_cx,
    interface_type,
    method_name,
    false,
    &mut collector,
    &mut HashSet::new(),
  );
  collector
}

pub(super) fn resolve_all_method_signatures(
  global_cx: &GlobalSignature,
  interface_types: &[NominalType],
  method_name: PStr,
) -> Vec<MemberSignature> {
  let mut collector = vec![];
  for interface_type in interface_types {
    resolve_method_signature_recursive(
      global_cx,
      interface_type,
      method_name,
      true,
      &mut collector,
      &mut HashSet::new(),
    )
  }
  collector
}

#[cfg(test)]
mod tests {
  use super::super::type_::{
    create_builtin_module_signature, test_type_builder, GlobalSignature, NominalType,
  };
  use super::{
    resolve_all_member_names, resolve_all_method_signatures, resolve_all_transitive_super_types,
    resolve_function_signature, resolve_method_signature,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::Reason;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::collections::HashMap;

  #[test]
  fn builder_tests() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();

    let source_code = r#"
import {Bar} from Baz

class Foo1<R>(val a: int, val b: R): Bar {
  function foo1(c: int): int = 3
  method <T> foo2(c: int): int = 3
}

class Foo2(A(Str), B(int)): Bar {
  function foo1(c: int): int = 3
  method <T> foo2(c: int): int = 3
}

interface Hiya {}
"#;
    let module = samlang_parser::parse_source_module_from_text(
      source_code,
      ModuleReference::DUMMY,
      heap,
      &mut error_set,
    );
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
    let builtin_cx = create_builtin_module_signature();
    let global_cx =
      super::build_global_signature(&HashMap::from([(ModuleReference::DUMMY, module)]), builtin_cx);
    assert_eq!(2, global_cx.len());
    let module_cx = global_cx.get(&ModuleReference::DUMMY).unwrap();
    assert_eq!(
      r#"
interfaces:
Foo1: class(a:int, b:R) <R> : [Bar]
functions:
foo1: public (int) -> int
init: public <R>(int, R) -> Foo1<R>
methods:
foo2: public <T>(int) -> int
Foo2: class(A(Str), B(int))  : [Bar]
functions:
A: public (Str) -> Foo2
B: public (int) -> Foo2
foo1: public (int) -> int
methods:
foo2: public <T>(int) -> int
Hiya: interface  : []
functions:
methods:"#,
      module_cx.to_string(heap)
    );
  }

  fn build_global_cx_for_resolution_tests(heap: &mut Heap) -> GlobalSignature {
    let mut error_set = ErrorSet::new();

    let source_code = r#"
class C(val a: int) {}

interface IUseNonExistent<A, B> : NotExist, C {}

interface IBase<A, B> {
  method <C: A> m1(a: A, b: B): C
}

interface ILevel1<A, B> : IBase<int, B> {
  function <C> f1(a: A, b: B): C
  method <C: A> m1(a: A, b: B): C
}

interface ILevel2<A, B> : ILevel1<A, int> {
  method <C> m2(a: A, b: B): C
}

interface ICyclic1 : ICyclic2 {}
interface ICyclic2 : ICyclic1 {}

interface ConflictExtends1 {
  function f(): int
  method m(): int
}
interface ConflictExtends2 {
  function f(): int
  method m(): bool
}

interface UsingConflictingExtends : ConflictExtends1, ConflictExtends2 {}
"#;
    let module = samlang_parser::parse_source_module_from_text(
      source_code,
      ModuleReference::DUMMY,
      heap,
      &mut error_set,
    );
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
    let builtin_cx = create_builtin_module_signature();
    super::build_global_signature(&HashMap::from([(ModuleReference::DUMMY, module)]), builtin_cx)
  }

  #[test]
  fn super_type_resolution_tests() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();
    let global_cx = build_global_cx_for_resolution_tests(heap);

    assert_eq!(
      "resolved: [], is_cyclic: false",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_C,
          type_arguments: vec![]
        },
      )
      .debug_print(heap)
    );
    assert_eq!(
      "resolved: [NotExist, C], is_cyclic: false",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("IUseNonExistent"),
          type_arguments: vec![]
        },
      )
      .debug_print(heap)
    );
    assert_eq!(
      "resolved: [IBase<int, int>, ILevel1<bool, int>], is_cyclic: false",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ILevel2"),
          type_arguments: vec![builder.bool_type(), builder.int_type()]
        },
      )
      .debug_print(heap)
    );
    assert_eq!(
      "resolved: [ICyclic1, ICyclic2], is_cyclic: true",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ICyclic1"),
          type_arguments: vec![]
        },
      )
      .debug_print(heap)
    );
    assert_eq!(
      "resolved: [ICyclic2, ICyclic1], is_cyclic: true",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ICyclic2"),
          type_arguments: vec![]
        },
      )
      .debug_print(heap)
    );
    assert_eq!(
      "resolved: [ConflictExtends1, ConflictExtends2], is_cyclic: false",
      resolve_all_transitive_super_types(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("UsingConflictingExtends"),
          type_arguments: vec![]
        },
      )
      .debug_print(heap)
    );

    assert_eq!(
      vec!["m1", "m2"],
      resolve_all_member_names(
        &global_cx,
        &[NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ILevel2"),
          type_arguments: vec![builder.bool_type(), builder.int_type()],
        }],
        true,
      )
      .into_iter()
      .map(|p| p.as_str(heap).to_string())
      .sorted()
      .collect_vec()
    );
  }

  #[test]
  fn function_resolution_tests() {
    let heap = &mut Heap::new();
    let global_cx = build_global_cx_for_resolution_tests(heap);

    assert!(resolve_function_signature(
      &global_cx,
      (heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]), PStr::UPPER_C),
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_function_signature(
      &global_cx,
      (ModuleReference::ROOT, PStr::UPPER_C),
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_function_signature(
      &global_cx,
      (ModuleReference::DUMMY, PStr::UPPER_C),
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_function_signature(
      &global_cx,
      (ModuleReference::DUMMY, heap.alloc_str_for_test("IUseNonExistent")),
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_function_signature(
      &global_cx,
      (ModuleReference::DUMMY, heap.alloc_str_for_test("ICyclic1")),
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_function_signature(
      &global_cx,
      (ModuleReference::DUMMY, heap.alloc_str_for_test("ICyclic2")),
      PStr::LOWER_A,
    )
    .is_empty());
  }

  #[test]
  fn method_resolution_tests() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();
    let global_cx = build_global_cx_for_resolution_tests(heap);

    assert!(resolve_method_signature(
      &global_cx,
      &NominalType {
        reason: Reason::dummy(),
        is_class_statics: false,
        module_reference: ModuleReference::DUMMY,
        id: PStr::UPPER_C,
        type_arguments: vec![]
      },
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_method_signature(
      &global_cx,
      &NominalType {
        reason: Reason::dummy(),
        is_class_statics: false,
        module_reference: ModuleReference::DUMMY,
        id: heap.alloc_str_for_test("IUseNonExistent"),
        type_arguments: vec![]
      },
      PStr::LOWER_A,
    )
    .is_empty());
    assert_eq!(
      r#"
public <C : A>(A, int) -> C
public <C : A>(int, int) -> C
"#
      .trim(),
      resolve_all_method_signatures(
        &global_cx,
        &[NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ILevel2"),
          type_arguments: vec![]
        }],
        heap.alloc_str_for_test("m1"),
      )
      .iter()
      .map(|it| it.to_string(heap))
      .join("\n")
    );
    assert_eq!(
      "public <C>(bool, int) -> C",
      resolve_method_signature(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("ILevel2"),
          type_arguments: vec![builder.bool_type(), builder.int_type()]
        },
        heap.alloc_str_for_test("m2"),
      )
      .iter()
      .map(|it| it.to_string(heap))
      .join("\n")
    );
    assert!(resolve_method_signature(
      &global_cx,
      &NominalType {
        reason: Reason::dummy(),
        is_class_statics: false,
        module_reference: ModuleReference::DUMMY,
        id: heap.alloc_str_for_test("ICyclic1"),
        type_arguments: vec![]
      },
      PStr::LOWER_A,
    )
    .is_empty());
    assert!(resolve_method_signature(
      &global_cx,
      &NominalType {
        reason: Reason::dummy(),
        is_class_statics: false,
        module_reference: ModuleReference::DUMMY,
        id: heap.alloc_str_for_test("ICyclic2"),
        type_arguments: vec![]
      },
      PStr::LOWER_A,
    )
    .is_empty());
    assert_eq!(
      r#"
public () -> int
public () -> bool"#
        .trim(),
      resolve_all_method_signatures(
        &global_cx,
        &[NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("UsingConflictingExtends"),
          type_arguments: vec![]
        }],
        heap.alloc_str_for_test("m"),
      )
      .iter()
      .map(|it| it.to_string(heap))
      .join("\n")
    );
    assert_eq!(
      "public () -> int",
      resolve_method_signature(
        &global_cx,
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("UsingConflictingExtends"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m"),
      )
      .iter()
      .map(|it| it.to_string(heap))
      .join("\n")
    );
  }
}
