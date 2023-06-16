use crate::{
  ast::{
    common_names::{encode_samlang_type, encode_samlang_variant_subtype},
    hir::{
      ClosureTypeDefinition, FunctionType, IdType, Type, TypeDefinition, TypeDefinitionMappings,
      INT_TYPE,
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
  reverse_function_map: BTreeMap<String, PStr>,
  reverse_tuple_map: BTreeMap<String, PStr>,
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
    let key = format!(
      "{}_{}",
      function_type.pretty_print(heap),
      type_parameters.iter().map(|it| it.as_str(heap)).join(",")
    );
    if let Some(existing_identifier) = self.reverse_function_map.get(&key) {
      return self
        .synthesized_closure_types
        .get(existing_identifier)
        .expect(&format!("Missing {}", existing_identifier.as_str(heap)))
        .clone();
    }
    let identifier = heap.alloc_string(format!("$SyntheticIDType{}", self.next_id));
    self.next_id += 1;
    self.reverse_function_map.insert(key, identifier);
    let definition = ClosureTypeDefinition { identifier, type_parameters, function_type };
    self.synthesized_closure_types.insert(identifier, definition.clone());
    definition
  }

  pub(super) fn synthesize_tuple_type(
    &mut self,
    heap: &mut Heap,
    mappings: Vec<Type>,
    type_parameters: Vec<PStr>,
  ) -> TypeDefinition {
    let key = format!(
      "{}_{}",
      mappings.iter().map(|it| it.pretty_print(heap)).join(","),
      type_parameters.iter().map(|it| it.as_str(heap)).join(",")
    );
    if let Some(existing_identifier) = self.reverse_tuple_map.get(&key) {
      return self
        .synthesized_tuple_types
        .get(existing_identifier)
        .expect(&format!("Missing {}", existing_identifier.as_str(heap)))
        .clone();
    }
    let identifier = heap.alloc_string(format!("$SyntheticIDType{}", self.next_id));
    self.next_id += 1;
    self.reverse_tuple_map.insert(key, identifier);
    let definition = TypeDefinition {
      identifier,
      type_parameters,
      names: mappings
        .iter()
        .enumerate()
        .map(|(i, _)| heap.alloc_string(format!("_n{i}")))
        .collect_vec(),
      mappings: TypeDefinitionMappings::Struct(mappings),
    };
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
    Type::Id(id) => {
      if generic_types.contains(&id.name) && id.type_arguments.is_empty() {
        collector.insert(id.name);
      }
      for t in &id.type_arguments {
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

fn solve_type_arguments_visit(
  generic_type_parameter_set: &HashSet<PStr>,
  solved: &mut HashMap<PStr, Type>,
  t1: &Type,
  t2: &Type,
) {
  match (t1, t2) {
    (Type::Int, Type::Int) => {}
    (Type::Id(id1), _)
      if id1.type_arguments.is_empty() && generic_type_parameter_set.contains(&id1.name) =>
    {
      solved.insert(id1.name, t2.clone());
    }
    (Type::Id(id1), Type::Id(id2)) => {
      solve_type_arguments_visit_id(generic_type_parameter_set, solved, id1, id2)
    }
    _ => panic!(),
  }
}

fn solve_type_arguments_visit_id(
  generic_type_parameter_set: &HashSet<PStr>,
  solved: &mut HashMap<PStr, Type>,
  id1: &IdType,
  id2: &IdType,
) {
  assert_eq!(id1.name, id2.name);
  assert_eq!(id1.type_arguments.len(), id2.type_arguments.len());
  for (a1, a2) in id1.type_arguments.iter().zip(&id2.type_arguments) {
    solve_type_arguments_visit(generic_type_parameter_set, solved, a1, a2);
  }
}

pub(super) fn solve_type_arguments(
  generic_type_parameters: &Vec<PStr>,
  specialized_type: &IdType,
  parameterized_type_definition: &IdType,
) -> Vec<Type> {
  let mut generic_type_parameter_set = HashSet::new();
  for tparam in generic_type_parameters {
    generic_type_parameter_set.insert(*tparam);
  }
  let mut solved = HashMap::new();
  solve_type_arguments_visit_id(
    &generic_type_parameter_set,
    &mut solved,
    parameterized_type_definition,
    specialized_type,
  );
  generic_type_parameters
    .iter()
    .map(|it| solved.remove(it).expect(&format!("Unsolved parameter <{}>", it.debug_string())))
    .collect_vec()
}

pub(super) fn type_application(type_: &Type, replacement_map: &HashMap<PStr, Type>) -> Type {
  match type_ {
    Type::Int => Type::Int,
    Type::Id(id) => {
      if id.type_arguments.is_empty() {
        if let Some(t) = replacement_map.get(&id.name) {
          t.clone()
        } else {
          Type::Id(id.clone())
        }
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

fn encode_type_for_generics_specialization<'a>(heap: &'a Heap, type_: &'a Type) -> &'a str {
  match type_ {
    Type::Int => "int",
    Type::Id(id) => {
      assert!(
        id.type_arguments.is_empty(),
        "The identifier type argument should already be specialized."
      );
      id.name.as_str(heap)
    }
  }
}

pub(super) fn encode_name_after_generics_specialization(
  heap: &Heap,
  name: PStr,
  type_arguments: &Vec<Type>,
) -> String {
  if type_arguments.is_empty() {
    name.as_str(heap).to_string()
  } else {
    format!(
      "{}_{}",
      name.as_str(heap),
      type_arguments.iter().map(|n| encode_type_for_generics_specialization(heap, n)).join("_")
    )
  }
}

pub(super) struct TypeLoweringManager {
  pub(super) generic_types: HashSet<PStr>,
  pub(super) type_synthesizer: TypeSynthesizer,
}

impl TypeLoweringManager {
  pub(super) fn lower_source_type(&mut self, heap: &mut Heap, type_: &type_::Type) -> Type {
    match type_ {
      type_::Type::Any(_, _) => panic!(),
      type_::Type::Primitive(_, _) => Type::Int,
      type_::Type::Nominal(id) => {
        let id_string = id.id;
        if self.generic_types.contains(&id_string) {
          Type::new_id_no_targs(id_string)
        } else {
          Type::new_id(
            heap.alloc_string(encode_samlang_type(heap, &id.module_reference, id_string)),
            id.type_arguments.iter().map(|it| self.lower_source_type(heap, it)).collect_vec(),
          )
        }
      }
      type_::Type::Generic(_, id) => {
        debug_assert!(self.generic_types.contains(id));
        Type::new_id_no_targs(*id)
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
        let type_args = type_parameters.iter().map(|it| Type::new_id_no_targs(*it)).collect_vec();
        let closure_type_definition = self.type_synthesizer.synthesize_closure_type(
          heap,
          rewritten_function_type,
          type_parameters,
        );
        Type::new_id(closure_type_definition.identifier, type_args)
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
  ) -> Vec<TypeDefinition> {
    let type_parameters = Vec::from_iter(
      self.generic_types.iter().cloned().sorted_by(|x, y| x.as_str(heap).cmp(y.as_str(heap))),
    );
    match source_type_def {
      source::TypeDefinition::Struct { loc: _, fields } => {
        let mut names = vec![];
        let mut mappings = vec![];
        for field in fields {
          names.push(field.name.name);
          mappings
            .push(self.lower_source_type(heap, &type_::Type::from_annotation(&field.annotation)));
        }
        vec![TypeDefinition {
          identifier: heap.alloc_string(encode_samlang_type(heap, module_reference, identifier)),
          type_parameters,
          names,
          mappings: TypeDefinitionMappings::Struct(mappings),
        }]
      }
      source::TypeDefinition::Enum { loc: _, variants } => {
        let mut names = vec![];
        let mut type_defs = vec![];
        for variant in variants {
          names.push(variant.name.name);
          type_defs.push(TypeDefinition {
            identifier: heap.alloc_string(encode_samlang_variant_subtype(
              heap,
              module_reference,
              identifier,
              variant.name.name,
            )),
            type_parameters: type_parameters.clone(),
            names: vec![],
            mappings: TypeDefinitionMappings::Struct(
              vec![INT_TYPE]
                .into_iter()
                .chain(
                  variant
                    .associated_data_types
                    .iter()
                    .map(|t| self.lower_source_type(heap, &type_::Type::from_annotation(t))),
                )
                .collect(),
            ),
          });
        }
        type_defs.push(TypeDefinition {
          identifier: heap.alloc_string(encode_samlang_type(heap, module_reference, identifier)),
          type_parameters,
          names,
          mappings: TypeDefinitionMappings::Enum,
        });
        type_defs
      }
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
    ast::{hir::STRING_TYPE, source::test_builder, Location, Reason},
    checker::type_::test_type_builder,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn synthesizer_tests() {
    let heap = &mut Heap::new();
    let mut synthesizer = TypeSynthesizer::new();
    let a = heap.alloc_str_for_test("A");
    let b = heap.alloc_str_for_test("B");
    let c = heap.alloc_str_for_test("C");

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(a, vec![INT_TYPE])], vec![])
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(b, vec![INT_TYPE])], vec![])
        .identifier
        .as_str(heap),
    );

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(a, vec![INT_TYPE])], vec![])
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(b, vec![INT_TYPE])], vec![])
        .identifier
        .as_str(heap),
    );

    assert_eq!(
      "$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .identifier
        .as_str(heap),
    );

    assert_eq!(
      "$SyntheticIDType3",
      synthesizer
        .synthesize_tuple_type(heap, vec![INT_TYPE, Type::new_id(c, vec![INT_TYPE])], vec![a])
        .identifier
        .as_str(heap),
    );

    let SynthesizedTypes { closure_types, tuple_types } = synthesizer.synthesized_types();

    assert_eq!(
      vec![
        "object type $SyntheticIDType0 = [int, A<int>]",
        "object type $SyntheticIDType1 = [int, B<int>]",
        "object type $SyntheticIDType3<A> = [int, C<int>]"
      ],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
    assert_eq!(
      vec!["closure type $SyntheticIDType2 = () -> int"],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn collect_used_generic_types_works() {
    let heap = &mut Heap::new();
    let generic_types: HashSet<PStr> =
      vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")].into_iter().collect();

    assert!(collect_used_generic_types(
      &Type::new_fn_unwrapped(
        vec![INT_TYPE, Type::new_id(heap.alloc_str_for_test("C"), vec![INT_TYPE])],
        Type::new_id_no_targs(heap.alloc_str_for_test("C")),
      ),
      &generic_types,
    )
    .is_empty());

    assert_eq!(
      vec![heap.alloc_str_for_test("A")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs(heap.alloc_str_for_test("A"))),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str_for_test("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs(heap.alloc_str_for_test("B"))),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![Type::new_id_no_targs(heap.alloc_str_for_test("B"))],
          Type::new_id_no_targs(heap.alloc_str_for_test("A"))
        ),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str_for_test("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![],
          Type::new_id(
            heap.alloc_str_for_test("A"),
            vec![Type::new_id_no_targs(heap.alloc_str_for_test("B"))]
          )
        ),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
  }

  #[should_panic]
  #[test]
  fn solve_type_arguments_panic_tests() {
    let heap = &mut Heap::new();

    solve_type_arguments(
      &vec![],
      &Type::new_id_unwrapped(heap.alloc_str_for_test("A"), vec![INT_TYPE]),
      &Type::new_id_unwrapped(
        heap.alloc_str_for_test("A"),
        vec![Type::new_id_no_targs(heap.alloc_str_for_test("B"))],
      ),
    );
  }

  #[test]
  fn solve_type_arguments_tests() {
    let heap = &mut Heap::new();

    let actual = solve_type_arguments(
      &vec![heap.alloc_str_for_test("A")],
      &Type::new_id_unwrapped(
        heap.alloc_str_for_test("FF"),
        vec![
          INT_TYPE,
          INT_TYPE,
          Type::new_id(heap.alloc_str_for_test("Foo"), vec![STRING_TYPE]),
          INT_TYPE,
          Type::new_id_no_targs(heap.alloc_str_for_test("B")),
          STRING_TYPE,
        ],
      ),
      &Type::new_id_unwrapped(
        heap.alloc_str_for_test("FF"),
        vec![
          INT_TYPE,
          INT_TYPE,
          Type::new_id(heap.alloc_str_for_test("Foo"), vec![STRING_TYPE]),
          Type::new_id_no_targs(heap.alloc_str_for_test("A")),
          Type::new_id_no_targs(heap.alloc_str_for_test("B")),
          STRING_TYPE,
        ],
      ),
    );
    assert_eq!("int", actual.iter().map(|it| it.pretty_print(heap)).join(", "));
  }

  #[test]
  fn type_application_tests() {
    let heap = &mut Heap::new();

    assert_eq!("int", type_application(&INT_TYPE, &HashMap::new()).pretty_print(heap));

    assert_eq!(
      "A<int>",
      type_application(
        &Type::new_id(heap.alloc_str_for_test("A"), vec![INT_TYPE]),
        &HashMap::from([(heap.alloc_str_for_test("A"), INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "A",
      type_application(
        &Type::new_id_no_targs(heap.alloc_str_for_test("A")),
        &HashMap::from([(heap.alloc_str_for_test("B"), INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "int",
      type_application(
        &Type::new_id_no_targs(heap.alloc_str_for_test("A")),
        &HashMap::from([(heap.alloc_str_for_test("A"), INT_TYPE)])
      )
      .pretty_print(heap)
    );

    assert_eq!(
      "(int) -> int",
      fn_type_application(
        &Type::new_fn_unwrapped(
          vec![Type::new_id_no_targs(heap.alloc_str_for_test("A"))],
          Type::new_id_no_targs(heap.alloc_str_for_test("B"))
        ),
        &HashMap::from([
          (heap.alloc_str_for_test("A"), INT_TYPE),
          (heap.alloc_str_for_test("B"), INT_TYPE)
        ])
      )
      .pretty_print(heap)
    );
  }

  #[should_panic]
  #[test]
  fn encode_name_after_generics_specialization_panic_test() {
    let heap = &mut Heap::new();
    let s = heap.alloc_str_for_test("");
    let a = heap.alloc_str_for_test("A");

    encode_name_after_generics_specialization(heap, s, &vec![Type::new_id(a, vec![INT_TYPE])]);
  }

  #[test]
  fn encode_name_after_generics_specialization_tests() {
    let heap = &mut Heap::new();
    let a = heap.alloc_str_for_test("A");
    let b = heap.alloc_str_for_test("B");

    assert_eq!("A", encode_name_after_generics_specialization(heap, a, &vec![]));
    assert_eq!(
      "A_int_B",
      encode_name_after_generics_specialization(heap, a, &vec![INT_TYPE, Type::new_id_no_targs(b)])
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
      let t = builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.int_type()]);
      manager.lower_source_type(heap, &t).pretty_print(heap)
    });

    let mut manager2 = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str_for_test("T")]),
      type_synthesizer: manager.type_synthesizer,
    };
    assert_eq!("$SyntheticIDType0<T>", {
      let t = builder.fun_type(
        vec![builder.simple_nominal_type(heap.alloc_str_for_test("T")), builder.bool_type()],
        builder.int_type(),
      );
      manager2.lower_source_type(heap, &t).pretty_print(heap)
    });

    let SynthesizedTypes { closure_types, tuple_types } =
      manager2.type_synthesizer.synthesized_types();
    assert!(tuple_types.is_empty());
    assert_eq!(
      vec!["closure type $SyntheticIDType0<T> = (T, int) -> int"],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_type_definition_tests() {
    let heap = &mut Heap::new();
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str_for_test("A")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let annot_builder = test_builder::create();

    let type_def = source::TypeDefinition::Struct {
      loc: Location::dummy(),
      fields: vec![
        source::FieldDefinition {
          name: source::Id::from(heap.alloc_str_for_test("a")),
          annotation: annot_builder.fn_annot(
            vec![annot_builder.fn_annot(
              vec![annot_builder.simple_id_annot(heap.alloc_str_for_test("A"))],
              annot_builder.bool_annot(),
            )],
            annot_builder.bool_annot(),
          ),
          is_public: true,
        },
        source::FieldDefinition {
          name: source::Id::from(heap.alloc_str_for_test("b")),
          annotation: annot_builder.fn_annot(
            vec![annot_builder.fn_annot(
              vec![annot_builder.simple_id_annot(heap.alloc_str_for_test("A"))],
              annot_builder.bool_annot(),
            )],
            annot_builder.bool_annot(),
          ),
          is_public: false,
        },
      ],
    };
    let foo_str = heap.alloc_str_for_test("Foo");
    let mut type_defs =
      manager.lower_source_type_definition(heap, &ModuleReference::root(), foo_str, &type_def);
    let SynthesizedTypes { closure_types, mut tuple_types } =
      manager.type_synthesizer.synthesized_types();
    assert_eq!(
      vec![
        "closure type $SyntheticIDType0<A> = (A) -> int",
        "closure type $SyntheticIDType1<A> = ($SyntheticIDType0<A>) -> int",
      ],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );

    tuple_types.append(&mut type_defs);
    assert_eq!(
      vec!["object type _Foo<A> = [$SyntheticIDType1<A>, $SyntheticIDType1<A>]"],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_toplevel_functions_tests() {
    let heap = &mut Heap::new();

    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str_for_test("A")]),
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
    assert_eq!("($SyntheticIDType0) -> int", f2.pretty_print(heap));
  }
}
