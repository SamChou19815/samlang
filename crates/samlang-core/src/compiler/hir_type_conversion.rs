use crate::{
  ast::{
    hir::{
      ClosureTypeDefinition, FunctionType, IdType, Type, TypeDefinition, TypeDefinitionMappings,
      TypeName,
    },
    source,
  },
  checker::type_,
  common::{Heap, ModuleReference, PStr},
};
use itertools::Itertools;
use std::{
  collections::{BTreeMap, HashMap, HashSet},
  rc::Rc,
};

pub(crate) struct SynthesizedTypes {
  pub(crate) closure_types: Vec<ClosureTypeDefinition>,
  pub(crate) tuple_types: Vec<TypeDefinition>,
}

pub(super) struct TypeSynthesizer {
  pub(super) synthesized_closure_types: BTreeMap<PStr, ClosureTypeDefinition>,
  pub(super) synthesized_tuple_types: BTreeMap<PStr, TypeDefinition>,
  reverse_function_map: BTreeMap<(FunctionType, Vec<PStr>), PStr>,
  reverse_tuple_map: BTreeMap<(Vec<Type>, Vec<PStr>), PStr>,
  next_id: i32,
}

impl TypeSynthesizer {
  pub(super) fn new() -> TypeSynthesizer {
    TypeSynthesizer {
      synthesized_closure_types: BTreeMap::new(),
      synthesized_tuple_types: BTreeMap::new(),
      reverse_function_map: BTreeMap::new(),
      reverse_tuple_map: BTreeMap::new(),
      next_id: 0,
    }
  }

  pub(super) fn synthesized_types(self) -> SynthesizedTypes {
    let TypeSynthesizer { synthesized_closure_types, synthesized_tuple_types, .. } = self;
    SynthesizedTypes {
      closure_types: synthesized_closure_types.into_values().collect_vec(),
      tuple_types: synthesized_tuple_types.into_values().collect_vec(),
    }
  }

  pub(super) fn synthesize_closure_type(
    &mut self,
    heap: &mut Heap,
    function_type: FunctionType,
    type_parameters: Vec<PStr>,
  ) -> ClosureTypeDefinition {
    let key = (function_type.clone(), type_parameters.clone());
    if let Some(existing_identifier) = self.reverse_function_map.get(&key) {
      return self.synthesized_closure_types.get(existing_identifier).unwrap().clone();
    }
    let identifier = heap.alloc_string(format!("$SyntheticIDType{}", self.next_id));
    let name = TypeName { module_reference: Some(ModuleReference::root()), type_name: identifier };
    self.next_id += 1;
    self.reverse_function_map.insert(key, identifier);
    let definition = ClosureTypeDefinition { name, type_parameters, function_type };
    self.synthesized_closure_types.insert(identifier, definition.clone());
    definition
  }

  pub(super) fn synthesize_tuple_type(
    &mut self,
    heap: &mut Heap,
    mappings: Vec<Type>,
    type_parameters: Vec<PStr>,
  ) -> TypeDefinition {
    let key = (mappings.clone(), type_parameters.clone());
    if let Some(existing_identifier) = self.reverse_tuple_map.get(&key) {
      return self.synthesized_tuple_types.get(existing_identifier).unwrap().clone();
    }
    let identifier = heap.alloc_string(format!("$SyntheticIDType{}", self.next_id));
    let name = TypeName { module_reference: Some(ModuleReference::root()), type_name: identifier };
    self.next_id += 1;
    self.reverse_tuple_map.insert(key, identifier);
    let definition =
      TypeDefinition { name, type_parameters, mappings: TypeDefinitionMappings::Struct(mappings) };
    self.synthesized_tuple_types.insert(identifier, definition.clone());
    definition
  }
}

fn collect_used_generic_types_visitor(
  type_: &Type,
  generic_types: &HashSet<PStr>,
  collector: &mut HashSet<PStr>,
) {
  match type_ {
    Type::Int => {}
    Type::Id(IdType { name, type_arguments }) => {
      if name.module_reference.is_none() && generic_types.contains(&name.type_name) {
        collector.insert(name.type_name);
      }
      for t in type_arguments {
        collect_used_generic_types_visitor(t, generic_types, collector);
      }
    }
  }
}

pub(super) fn collect_used_generic_types(
  function_type: &FunctionType,
  generic_types: &HashSet<PStr>,
) -> HashSet<PStr> {
  let mut collector = HashSet::new();
  for t in &function_type.argument_types {
    collect_used_generic_types_visitor(t, generic_types, &mut collector);
  }
  collect_used_generic_types_visitor(&function_type.return_type, generic_types, &mut collector);
  collector
}

pub(super) fn type_application(type_: &Type, replacement_map: &HashMap<PStr, Type>) -> Type {
  match type_ {
    Type::Int => Type::Int,
    Type::Id(id) => {
      if id.name.module_reference.is_none() {
        replacement_map.get(&id.name.type_name).cloned().unwrap()
      } else {
        Type::Id(IdType {
          name: id.name,
          type_arguments: id
            .type_arguments
            .iter()
            .map(|it| type_application(it, replacement_map))
            .collect_vec(),
        })
      }
    }
  }
}

pub(super) fn fn_type_application(
  fn_type: &FunctionType,
  replacement_map: &HashMap<PStr, Type>,
) -> FunctionType {
  FunctionType {
    argument_types: fn_type
      .argument_types
      .iter()
      .map(|it| type_application(it, replacement_map))
      .collect_vec(),
    return_type: Box::new(type_application(&fn_type.return_type, replacement_map)),
  }
}

pub(super) struct TypeLoweringManager {
  pub(super) generic_types: HashSet<PStr>,
  pub(super) type_synthesizer: TypeSynthesizer,
}

impl TypeLoweringManager {
  pub(super) fn lower_source_type(&mut self, heap: &mut Heap, type_: &type_::Type) -> Type {
    match type_ {
      type_::Type::Any(reason, placeholder) => {
        panic!("any(placeholder={}) at {:?}", placeholder, reason)
      }
      type_::Type::Primitive(_, _) => Type::Int,
      type_::Type::Nominal(id) => {
        let id_string = id.id;
        Type::Id(IdType {
          name: TypeName { module_reference: Some(id.module_reference), type_name: id_string },
          type_arguments: id
            .type_arguments
            .iter()
            .map(|it| self.lower_source_type(heap, it))
            .collect(),
        })
      }
      type_::Type::Generic(_, id) => {
        debug_assert!(self.generic_types.contains(id));
        Type::new_generic_type(*id)
      }
      type_::Type::Fn(f) => {
        let rewritten_function_type = Type::new_fn_unwrapped(
          f.argument_types.iter().map(|it| self.lower_source_type(heap, it)).collect_vec(),
          self.lower_source_type(heap, &f.return_type),
        );
        let type_parameters = Vec::from_iter(
          collect_used_generic_types(&rewritten_function_type, &self.generic_types)
            .into_iter()
            .sorted(),
        );
        let type_args = type_parameters.iter().map(|it| Type::new_generic_type(*it)).collect_vec();
        let closure_type_definition = self.type_synthesizer.synthesize_closure_type(
          heap,
          rewritten_function_type,
          type_parameters,
        );
        Type::Id(IdType { name: closure_type_definition.name, type_arguments: type_args })
      }
    }
  }

  pub(super) fn lower_source_types(
    &mut self,
    heap: &mut Heap,
    source_types: &Vec<Rc<type_::Type>>,
  ) -> Vec<Type> {
    let mut types = vec![];
    for t in source_types {
      types.push(self.lower_source_type(heap, t));
    }
    types
  }

  pub(super) fn lower_source_type_definition(
    &mut self,
    heap: &mut Heap,
    module_reference: &ModuleReference,
    identifier: PStr,
    source_type_def: &source::TypeDefinition,
  ) -> TypeDefinition {
    let type_parameters = Vec::from_iter(
      self.generic_types.iter().cloned().sorted_by(|x, y| x.as_str(heap).cmp(y.as_str(heap))),
    );
    match source_type_def {
      source::TypeDefinition::Struct { loc: _, fields } => TypeDefinition {
        name: TypeName { module_reference: Some(*module_reference), type_name: identifier },
        type_parameters,
        mappings: TypeDefinitionMappings::Struct(
          fields
            .iter()
            .map(|field| {
              self.lower_source_type(heap, &type_::Type::from_annotation(&field.annotation))
            })
            .collect(),
        ),
      },
      source::TypeDefinition::Enum { loc: _, variants } => TypeDefinition {
        name: TypeName { module_reference: Some(*module_reference), type_name: identifier },
        type_parameters,
        mappings: TypeDefinitionMappings::Enum(
          variants
            .iter()
            .map(|variant| {
              (
                variant.name.name,
                variant
                  .associated_data_types
                  .iter()
                  .map(|t| self.lower_source_type(heap, &type_::Type::from_annotation(t)))
                  .collect_vec(),
              )
            })
            .collect(),
        ),
      },
    }
  }

  pub(super) fn lower_source_function_type_for_toplevel(
    &mut self,
    heap: &mut Heap,
    argument_types: &[Rc<type_::Type>],
    return_type: &type_::Type,
  ) -> (Vec<PStr>, FunctionType) {
    let function_type = Type::new_fn_unwrapped(
      argument_types.iter().map(|it| self.lower_source_type(heap, it)).collect_vec(),
      self.lower_source_type(heap, return_type),
    );
    let type_parameters = Vec::from_iter(
      collect_used_generic_types(&function_type, &self.generic_types).into_iter().sorted(),
    );
    (type_parameters, function_type)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::{hir::INT_TYPE, source::test_builder, Location, Reason},
    checker::type_::test_type_builder,
    common::well_known_pstrs,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn synthesizer_tests() {
    let heap = &mut Heap::new();
    let mut synthesizer = TypeSynthesizer::new();
    let a = well_known_pstrs::UPPER_A;
    let b = well_known_pstrs::UPPER_B;
    let c = well_known_pstrs::UPPER_C;

    assert_eq!(
      "_$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(a, vec![INT_TYPE])], vec![])
        .name
        .pretty_print(heap),
    );
    assert_eq!(
      "_$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(b, vec![INT_TYPE])], vec![])
        .name
        .pretty_print(heap),
    );

    assert_eq!(
      "_$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(a, vec![INT_TYPE])], vec![])
        .name
        .pretty_print(heap),
    );
    assert_eq!(
      "_$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(b, vec![INT_TYPE])], vec![])
        .name
        .pretty_print(heap),
    );

    assert_eq!(
      "_$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .name
        .pretty_print(heap),
    );
    assert_eq!(
      "_$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .name
        .pretty_print(heap),
    );

    assert_eq!(
      "_$SyntheticIDType3",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(c, vec![INT_TYPE])], vec![a])
        .name
        .pretty_print(heap),
    );

    let SynthesizedTypes { closure_types, tuple_types } = synthesizer.synthesized_types();

    assert_eq!(
      vec![
        "object type _$SyntheticIDType0 = [int, DUMMY_A<int>]",
        "object type _$SyntheticIDType1 = [int, DUMMY_B<int>]",
        "object type _$SyntheticIDType3<A> = [int, DUMMY_C<int>]"
      ],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
    assert_eq!(
      vec!["closure type _$SyntheticIDType2 = () -> int"],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn collect_used_generic_types_works() {
    let generic_types: HashSet<PStr> =
      vec![well_known_pstrs::UPPER_A, well_known_pstrs::UPPER_B].into_iter().collect();

    assert!(collect_used_generic_types(
      &Type::new_fn_unwrapped(
        vec![INT_TYPE, Type::new_id(well_known_pstrs::UPPER_C, vec![INT_TYPE])],
        Type::new_id_no_targs(well_known_pstrs::UPPER_C),
      ),
      &generic_types,
    )
    .is_empty());

    assert_eq!(
      vec![well_known_pstrs::UPPER_A],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_generic_type(well_known_pstrs::UPPER_A)),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![well_known_pstrs::UPPER_B],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_generic_type(well_known_pstrs::UPPER_B)),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![well_known_pstrs::UPPER_A, well_known_pstrs::UPPER_B],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![Type::new_generic_type(well_known_pstrs::UPPER_B)],
          Type::new_generic_type(well_known_pstrs::UPPER_A)
        ),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![well_known_pstrs::UPPER_B],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![],
          Type::new_id(
            well_known_pstrs::UPPER_A,
            vec![Type::new_generic_type(well_known_pstrs::UPPER_B)]
          )
        ),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
  }

  #[test]
  fn type_application_tests() {
    let heap = &mut Heap::new();

    assert_eq!("int", type_application(&INT_TYPE, &HashMap::new()).pretty_print(heap));

    assert_eq!(
      "DUMMY_A<int>",
      type_application(
        &Type::new_id(well_known_pstrs::UPPER_A, vec![INT_TYPE]),
        &HashMap::from([(well_known_pstrs::UPPER_A, INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "DUMMY_A",
      type_application(
        &Type::new_id_no_targs(well_known_pstrs::UPPER_A),
        &HashMap::from([(well_known_pstrs::UPPER_B, INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "int",
      type_application(
        &Type::new_generic_type(well_known_pstrs::UPPER_A),
        &HashMap::from([(well_known_pstrs::UPPER_A, INT_TYPE)])
      )
      .pretty_print(heap)
    );

    assert_eq!(
      "(int) -> int",
      fn_type_application(
        &Type::new_fn_unwrapped(
          vec![Type::new_generic_type(well_known_pstrs::UPPER_A)],
          Type::new_generic_type(well_known_pstrs::UPPER_B)
        ),
        &HashMap::from([
          (well_known_pstrs::UPPER_A, INT_TYPE),
          (well_known_pstrs::UPPER_B, INT_TYPE)
        ])
      )
      .pretty_print(heap)
    );
  }

  #[should_panic]
  #[test]
  fn type_lowering_manager_lower_source_type_panic_test() {
    let heap = &mut Heap::new();
    TypeLoweringManager { generic_types: HashSet::new(), type_synthesizer: TypeSynthesizer::new() }
      .lower_source_type(heap, &type_::Type::Any(Reason::dummy(), true));
  }

  #[test]
  fn type_lowering_manager_lower_source_type_tests() {
    let heap = &mut Heap::new();
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::new(),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = test_type_builder::create();

    assert_eq!("int", manager.lower_source_type(heap, &builder.bool_type()).pretty_print(heap));
    assert_eq!("int", manager.lower_source_type(heap, &builder.unit_type()).pretty_print(heap));
    assert_eq!("int", manager.lower_source_type(heap, &builder.int_type()).pretty_print(heap));
    assert_eq!("_Str", manager.lower_source_type(heap, &builder.string_type()).pretty_print(heap));
    assert_eq!(
      "_Str",
      manager
        .lower_source_types(heap, &vec![builder.string_type()])
        .iter()
        .map(|it| it.pretty_print(heap))
        .join("")
    );

    assert_eq!("DUMMY_A<int>", {
      let t = builder.general_nominal_type(well_known_pstrs::UPPER_A, vec![builder.int_type()]);
      manager.lower_source_type(heap, &t).pretty_print(heap)
    });

    let mut manager2 = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str_for_test("T")]),
      type_synthesizer: manager.type_synthesizer,
    };
    assert_eq!("_$SyntheticIDType0<T>", {
      let t = builder.fun_type(
        vec![builder.generic_type(heap.alloc_str_for_test("T")), builder.bool_type()],
        builder.int_type(),
      );
      manager2.lower_source_type(heap, &t).pretty_print(heap)
    });

    let SynthesizedTypes { closure_types, tuple_types } =
      manager2.type_synthesizer.synthesized_types();
    assert!(tuple_types.is_empty());
    assert_eq!(
      vec!["closure type _$SyntheticIDType0<T> = (T, int) -> int"],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_type_definition_tests() {
    let heap = &mut Heap::new();
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([well_known_pstrs::UPPER_A]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let annot_builder = test_builder::create();

    let type_def = source::TypeDefinition::Struct {
      loc: Location::dummy(),
      fields: vec![
        source::FieldDefinition {
          name: source::Id::from(well_known_pstrs::LOWER_A),
          annotation: annot_builder.fn_annot(
            vec![annot_builder.fn_annot(
              vec![annot_builder.generic_annot(well_known_pstrs::UPPER_A)],
              annot_builder.bool_annot(),
            )],
            annot_builder.bool_annot(),
          ),
          is_public: true,
        },
        source::FieldDefinition {
          name: source::Id::from(well_known_pstrs::LOWER_B),
          annotation: annot_builder.fn_annot(
            vec![annot_builder.fn_annot(
              vec![annot_builder.generic_annot(well_known_pstrs::UPPER_A)],
              annot_builder.bool_annot(),
            )],
            annot_builder.bool_annot(),
          ),
          is_public: false,
        },
      ],
    };
    let foo_str = heap.alloc_str_for_test("Foo");
    let type_def =
      manager.lower_source_type_definition(heap, &ModuleReference::root(), foo_str, &type_def);
    let SynthesizedTypes { closure_types, mut tuple_types } =
      manager.type_synthesizer.synthesized_types();
    assert_eq!(
      vec![
        "closure type _$SyntheticIDType0<A> = (A) -> int",
        "closure type _$SyntheticIDType1<A> = (_$SyntheticIDType0<A>) -> int",
      ],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );

    tuple_types.push(type_def);
    assert_eq!(
      vec!["object type _Foo<A> = [_$SyntheticIDType1<A>, _$SyntheticIDType1<A>]"],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_toplevel_functions_tests() {
    let heap = &mut Heap::new();

    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([well_known_pstrs::UPPER_A]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = test_type_builder::create();

    let (tparams1, f1) = manager.lower_source_function_type_for_toplevel(
      heap,
      &[builder.int_type()],
      &builder.bool_type(),
    );
    assert!(tparams1.is_empty());
    assert_eq!("(int) -> int", f1.pretty_print(heap));

    let (tparams2, f2) = manager.lower_source_function_type_for_toplevel(
      heap,
      &[builder.fun_type(vec![builder.int_type()], builder.bool_type())],
      &builder.bool_type(),
    );
    assert!(tparams2.is_empty());
    assert_eq!("(_$SyntheticIDType0) -> int", f2.pretty_print(heap));
  }
}
