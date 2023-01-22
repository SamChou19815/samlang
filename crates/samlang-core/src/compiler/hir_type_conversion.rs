use crate::{
  ast::{
    common_names::encode_samlang_type,
    hir::{ClosureTypeDefinition, FunctionType, IdType, PrimitiveType, Type, TypeDefinition},
    source,
  },
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
      is_object: true,
      type_parameters,
      names: mappings
        .iter()
        .enumerate()
        .map(|(i, _)| heap.alloc_string(format!("_n{}", i)))
        .collect_vec(),
      mappings,
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
    Type::Primitive(_) => {}
    Type::Id(id) => {
      if generic_types.contains(&id.name) && id.type_arguments.is_empty() {
        collector.insert(id.name);
      }
      for t in &id.type_arguments {
        collect_used_generic_types_visitor(t, generic_types, collector);
      }
    }
    Type::Fn(f) => {
      for t in &f.argument_types {
        collect_used_generic_types_visitor(t, generic_types, collector);
      }
      collect_used_generic_types_visitor(&f.return_type, generic_types, collector);
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
    (Type::Primitive(k1), Type::Primitive(k2)) => assert_eq!(k1, k2),
    (Type::Id(id1), _)
      if id1.type_arguments.is_empty() && generic_type_parameter_set.contains(&id1.name) =>
    {
      solved.insert(id1.name, t2.clone());
    }
    (Type::Id(id1), Type::Id(id2)) => {
      solve_type_arguments_visit_id(generic_type_parameter_set, solved, id1, id2)
    }
    (Type::Fn(f1), Type::Fn(f2)) => {
      assert_eq!(f1.argument_types.len(), f2.argument_types.len());
      for (a1, a2) in f1.argument_types.iter().zip(&f2.argument_types) {
        solve_type_arguments_visit(generic_type_parameter_set, solved, a1, a2);
      }
      solve_type_arguments_visit(
        generic_type_parameter_set,
        solved,
        &f1.return_type,
        &f2.return_type,
      );
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
    .map(|it| solved.remove(it).expect(&format!("Unsolved parameter <{}>", it.opaque_id())))
    .collect_vec()
}

pub(super) fn type_application(type_: &Type, replacement_map: &HashMap<PStr, Type>) -> Type {
  match type_ {
    Type::Primitive(kind) => Type::Primitive(*kind),
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
    Type::Fn(f) => Type::new_fn(
      f.argument_types.iter().map(|it| type_application(it, replacement_map)).collect_vec(),
      type_application(&f.return_type, replacement_map),
    ),
  }
}

fn encode_type_for_generics_specialization(heap: &Heap, type_: &Type) -> String {
  match type_ {
    Type::Primitive(kind) => kind.to_string(),
    Type::Id(id) => {
      assert!(
        id.type_arguments.is_empty(),
        "The identifier type argument should already be specialized."
      );
      id.name.as_str(heap).to_string()
    }
    Type::Fn(_) => {
      panic!("Function type should never appear in generics specialization positions.")
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
  pub(super) fn lower_source_type(&mut self, heap: &mut Heap, type_: &source::Type) -> Type {
    match type_ {
      source::Type::Unknown(_) => panic!(),
      source::Type::Primitive(_, kind) => Type::Primitive(match kind {
        source::PrimitiveTypeKind::Bool => PrimitiveType::Bool,
        source::PrimitiveTypeKind::Unit => PrimitiveType::Int,
        source::PrimitiveTypeKind::Int => PrimitiveType::Int,
        source::PrimitiveTypeKind::String => PrimitiveType::String,
      }),
      source::Type::Id(id) => {
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
      source::Type::Fn(f) => {
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
    source_types: &Vec<Rc<source::Type>>,
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
    let type_parameters =
      Vec::from_iter(self.generic_types.iter().cloned().sorted_by_key(|ps| ps.as_str(heap)));
    let mut names = vec![];
    let mut mappings = vec![];
    for n in &source_type_def.names {
      names.push(n.name);
      mappings
        .push(self.lower_source_type(heap, &source_type_def.mappings.get(&n.name).unwrap().type_));
    }
    TypeDefinition {
      identifier: heap.alloc_string(encode_samlang_type(heap, module_reference, identifier)),
      is_object: source_type_def.is_object,
      type_parameters,
      names,
      mappings,
    }
  }

  pub(super) fn lower_source_function_type_for_toplevel(
    &mut self,
    heap: &mut Heap,
    argument_types: &[Rc<source::Type>],
    return_type: &source::Type,
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
  use crate::ast::{
    hir::{BOOL_TYPE, INT_TYPE, STRING_TYPE},
    Location, Reason,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn synthesizer_tests() {
    let heap = &mut Heap::new();
    let mut synthesizer = TypeSynthesizer::new();

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(
          heap,
          vec![BOOL_TYPE, Type::new_fn(vec![INT_TYPE], BOOL_TYPE)],
          vec![]
        )
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(
          heap,
          vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)],
          vec![]
        )
        .identifier
        .as_str(heap),
    );

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(
          heap,
          vec![BOOL_TYPE, Type::new_fn(vec![INT_TYPE], BOOL_TYPE)],
          vec![]
        )
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(
          heap,
          vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)],
          vec![]
        )
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
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], BOOL_TYPE), vec![])
        .identifier
        .as_str(heap),
    );
    assert_eq!(
      "$SyntheticIDType3",
      synthesizer
        .synthesize_closure_type(heap, Type::new_fn_unwrapped(vec![], BOOL_TYPE), vec![])
        .identifier
        .as_str(heap),
    );

    let a = heap.alloc_str("A");
    assert_eq!(
      "$SyntheticIDType4",
      synthesizer
        .synthesize_tuple_type(
          heap,
          vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)],
          vec![a]
        )
        .identifier
        .as_str(heap),
    );

    let SynthesizedTypes { closure_types, tuple_types } = synthesizer.synthesized_types();

    assert_eq!(
      vec![
        "object type $SyntheticIDType0 = [bool, (int) -> bool]",
        "object type $SyntheticIDType1 = [int, (bool) -> bool]",
        "object type $SyntheticIDType4<A> = [int, (bool) -> bool]"
      ],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
    assert_eq!(
      vec![
        "closure type $SyntheticIDType2 = () -> int",
        "closure type $SyntheticIDType3 = () -> bool",
      ],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn collect_used_generic_types_works() {
    let heap = &mut Heap::new();
    let generic_types: HashSet<PStr> =
      vec![heap.alloc_str("A"), heap.alloc_str("B")].into_iter().collect();

    assert!(collect_used_generic_types(
      &Type::new_fn_unwrapped(
        vec![BOOL_TYPE, Type::new_fn(vec![BOOL_TYPE], INT_TYPE)],
        Type::new_id_no_targs(heap.alloc_str("C")),
      ),
      &generic_types,
    )
    .is_empty());

    assert_eq!(
      vec![heap.alloc_str("A")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs(heap.alloc_str("A"))),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs(heap.alloc_str("B"))),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str("A"), heap.alloc_str("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![Type::new_id_no_targs(heap.alloc_str("B"))],
          Type::new_id_no_targs(heap.alloc_str("A"))
        ),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![heap.alloc_str("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(
          vec![],
          Type::new_id(heap.alloc_str("A"), vec![Type::new_id_no_targs(heap.alloc_str("B"))])
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
      &Type::new_id_unwrapped(
        heap.alloc_str("A"),
        vec![Type::new_fn(vec![INT_TYPE, BOOL_TYPE], STRING_TYPE)],
      ),
      &Type::new_id_unwrapped(
        heap.alloc_str("A"),
        vec![Type::new_fn(vec![INT_TYPE, BOOL_TYPE], Type::new_fn(vec![], STRING_TYPE))],
      ),
    );
  }

  #[test]
  fn solve_type_arguments_tests() {
    let heap = &mut Heap::new();

    let actual = solve_type_arguments(
      &vec![heap.alloc_str("A")],
      &Type::new_id_unwrapped(
        heap.alloc_str("FF"),
        vec![Type::new_fn(
          vec![INT_TYPE, BOOL_TYPE],
          Type::new_fn(
            vec![
              Type::new_id(heap.alloc_str("Foo"), vec![STRING_TYPE]),
              Type::new_fn(vec![], INT_TYPE),
              Type::new_id_no_targs(heap.alloc_str("B")),
            ],
            STRING_TYPE,
          ),
        )],
      ),
      &Type::new_id_unwrapped(
        heap.alloc_str("FF"),
        vec![Type::new_fn(
          vec![INT_TYPE, BOOL_TYPE],
          Type::new_fn(
            vec![
              Type::new_id(heap.alloc_str("Foo"), vec![STRING_TYPE]),
              Type::new_id_no_targs(heap.alloc_str("A")),
              Type::new_id_no_targs(heap.alloc_str("B")),
            ],
            STRING_TYPE,
          ),
        )],
      ),
    );
    assert_eq!("() -> int", actual.iter().map(|it| it.pretty_print(heap)).join(", "));
  }

  #[test]
  fn type_application_tests() {
    let heap = &mut Heap::new();

    assert_eq!("bool", type_application(&BOOL_TYPE, &HashMap::new()).pretty_print(heap));
    assert_eq!("int", type_application(&INT_TYPE, &HashMap::new()).pretty_print(heap));
    assert_eq!("string", type_application(&STRING_TYPE, &HashMap::new()).pretty_print(heap));

    assert_eq!(
      "A<int>",
      type_application(
        &Type::new_id(heap.alloc_str("A"), vec![INT_TYPE]),
        &HashMap::from([(heap.alloc_str("A"), INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "A",
      type_application(
        &Type::new_id_no_targs(heap.alloc_str("A")),
        &HashMap::from([(heap.alloc_str("B"), INT_TYPE)])
      )
      .pretty_print(heap)
    );
    assert_eq!(
      "int",
      type_application(
        &Type::new_id_no_targs(heap.alloc_str("A")),
        &HashMap::from([(heap.alloc_str("A"), INT_TYPE)])
      )
      .pretty_print(heap)
    );

    assert_eq!(
      "(int) -> bool",
      type_application(
        &Type::new_fn(
          vec![Type::new_id_no_targs(heap.alloc_str("A"))],
          Type::new_id_no_targs(heap.alloc_str("B"))
        ),
        &HashMap::from([(heap.alloc_str("A"), INT_TYPE), (heap.alloc_str("B"), BOOL_TYPE)])
      )
      .pretty_print(heap)
    );
  }

  #[should_panic]
  #[test]
  fn encode_name_after_generics_specialization_panic_test1() {
    let heap = &mut Heap::new();
    let s = heap.alloc_str("");

    encode_name_after_generics_specialization(heap, s, &vec![Type::new_fn(vec![], INT_TYPE)]);
  }

  #[should_panic]
  #[test]
  fn encode_name_after_generics_specialization_panic_test2() {
    let heap = &mut Heap::new();
    let s = heap.alloc_str("");
    let a = heap.alloc_str("A");

    encode_name_after_generics_specialization(heap, s, &vec![Type::new_id(a, vec![INT_TYPE])]);
  }

  #[test]
  fn encode_name_after_generics_specialization_tests() {
    let heap = &mut Heap::new();
    let a = heap.alloc_str("A");
    let b = heap.alloc_str("B");

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
      .lower_source_type(heap, &source::Type::Unknown(Reason::dummy()));
  }

  #[test]
  fn type_lowering_manager_lower_source_type_tests() {
    let heap = &mut Heap::new();
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::new(),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    assert_eq!("bool", manager.lower_source_type(heap, &builder.bool_type()).pretty_print(heap));
    assert_eq!("int", manager.lower_source_type(heap, &builder.unit_type()).pretty_print(heap));
    assert_eq!("int", manager.lower_source_type(heap, &builder.int_type()).pretty_print(heap));
    assert_eq!(
      "string",
      manager.lower_source_type(heap, &builder.string_type()).pretty_print(heap)
    );
    assert_eq!(
      "string",
      manager
        .lower_source_types(heap, &vec![builder.string_type()])
        .iter()
        .map(|it| it.pretty_print(heap))
        .join("")
    );

    assert_eq!("__DUMMY___A<int>", {
      let t = builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type()]);
      manager.lower_source_type(heap, &t).pretty_print(heap)
    });

    let mut manager2 = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str("T")]),
      type_synthesizer: manager.type_synthesizer,
    };
    assert_eq!("$SyntheticIDType0<T>", {
      let t = builder.fun_type(
        vec![builder.simple_id_type(heap.alloc_str("T")), builder.bool_type()],
        builder.int_type(),
      );
      manager2.lower_source_type(heap, &t).pretty_print(heap)
    });

    let SynthesizedTypes { closure_types, tuple_types } =
      manager2.type_synthesizer.synthesized_types();
    assert!(tuple_types.is_empty());
    assert_eq!(
      vec!["closure type $SyntheticIDType0<T> = (T, bool) -> int"],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_type_definition_tests() {
    let heap = &mut Heap::new();
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str("A")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    let type_def = source::TypeDefinition {
      loc: Location::dummy(),
      is_object: true,
      names: vec![source::Id::from(heap.alloc_str("a")), source::Id::from(heap.alloc_str("b"))],
      mappings: HashMap::from([
        (
          heap.alloc_str("a"),
          source::FieldType {
            is_public: true,
            type_: builder.fun_type(
              vec![builder
                .fun_type(vec![builder.simple_id_type(heap.alloc_str("A"))], builder.bool_type())],
              builder.bool_type(),
            ),
          },
        ),
        (
          heap.alloc_str("b"),
          source::FieldType {
            is_public: false,
            type_: builder.fun_type(
              vec![builder
                .fun_type(vec![builder.simple_id_type(heap.alloc_str("A"))], builder.bool_type())],
              builder.bool_type(),
            ),
          },
        ),
      ]),
    };
    let foo_str = heap.alloc_str("Foo");
    let type_def =
      manager.lower_source_type_definition(heap, &ModuleReference::root(), foo_str, &type_def);
    let SynthesizedTypes { closure_types, mut tuple_types } =
      manager.type_synthesizer.synthesized_types();
    assert_eq!(
      vec![
        "closure type $SyntheticIDType0<A> = (A) -> bool",
        "closure type $SyntheticIDType1<A> = ($SyntheticIDType0<A>) -> bool",
      ],
      closure_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );

    tuple_types.push(type_def);
    assert_eq!(
      vec!["object type _Foo<A> = [$SyntheticIDType1<A>, $SyntheticIDType1<A>]"],
      tuple_types.iter().map(|it| it.pretty_print(heap)).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_toplevel_functions_tests() {
    let heap = &mut Heap::new();

    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([heap.alloc_str("A")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    let (tparams1, f1) = manager.lower_source_function_type_for_toplevel(
      heap,
      &[builder.int_type()],
      &builder.bool_type(),
    );
    assert!(tparams1.is_empty());
    assert_eq!("(int) -> bool", f1.pretty_print(heap));

    let (tparams2, f2) = manager.lower_source_function_type_for_toplevel(
      heap,
      &[builder.fun_type(vec![builder.int_type()], builder.bool_type())],
      &builder.bool_type(),
    );
    assert!(tparams2.is_empty());
    assert_eq!("($SyntheticIDType0) -> bool", f2.pretty_print(heap));
  }
}
