use crate::{
  ast::{
    common_names::encode_samlang_type,
    hir::{ClosureTypeDefinition, FunctionType, IdType, PrimitiveType, Type, TypeDefinition},
    source, ModuleReference,
  },
  common::{rc_string, Str},
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
  pub(super) synthesized_closure_types: BTreeMap<Str, ClosureTypeDefinition>,
  pub(super) synthesized_tuple_types: BTreeMap<Str, TypeDefinition>,
  reverse_function_map: BTreeMap<String, Str>,
  reverse_tuple_map: BTreeMap<String, Str>,
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
    function_type: FunctionType,
    type_parameters: Vec<Str>,
  ) -> ClosureTypeDefinition {
    let key = format!(
      "{}_{}",
      function_type.pretty_print(),
      type_parameters.iter().map(|it| it.to_string()).join(",")
    );
    if let Some(existing_identifier) = self.reverse_function_map.get(&key) {
      return self
        .synthesized_closure_types
        .get(existing_identifier)
        .expect(&format!("Missing {}", existing_identifier))
        .clone();
    }
    let identifier = rc_string(format!("$SyntheticIDType{}", self.next_id));
    self.next_id += 1;
    self.reverse_function_map.insert(key, identifier.clone());
    let definition =
      ClosureTypeDefinition { identifier: identifier.clone(), type_parameters, function_type };
    self.synthesized_closure_types.insert(identifier, definition.clone());
    definition
  }

  pub(super) fn synthesize_tuple_type(
    &mut self,
    mappings: Vec<Type>,
    type_parameters: Vec<Str>,
  ) -> TypeDefinition {
    let key = format!(
      "{}_{}",
      mappings.iter().map(|it| it.pretty_print()).join(","),
      type_parameters.iter().map(|it| it.to_string()).join(",")
    );
    if let Some(existing_identifier) = self.reverse_tuple_map.get(&key) {
      return self
        .synthesized_tuple_types
        .get(existing_identifier)
        .expect(&format!("Missing {}", existing_identifier))
        .clone();
    }
    let identifier = rc_string(format!("$SyntheticIDType{}", self.next_id));
    self.next_id += 1;
    self.reverse_tuple_map.insert(key, identifier.clone());
    let definition = TypeDefinition {
      identifier: identifier.clone(),
      is_object: true,
      type_parameters,
      names: mappings.iter().enumerate().map(|(i, _)| rc_string(format!("_n{}", i))).collect_vec(),
      mappings,
    };
    self.synthesized_tuple_types.insert(identifier, definition.clone());
    definition
  }
}

fn collect_used_generic_types_visitor(
  type_: &Type,
  generic_types: &HashSet<Str>,
  collector: &mut HashSet<Str>,
) {
  match type_ {
    Type::Primitive(_) => {}
    Type::Id(id) => {
      if generic_types.contains(&id.name) && id.type_arguments.is_empty() {
        collector.insert(id.name.clone());
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
  generic_types: &HashSet<Str>,
) -> HashSet<Str> {
  let mut collector = HashSet::new();
  for t in &function_type.argument_types {
    collect_used_generic_types_visitor(t, &generic_types, &mut collector);
  }
  collect_used_generic_types_visitor(&function_type.return_type, &generic_types, &mut collector);
  collector
}

fn solve_type_arguments_visit(
  generic_type_parameter_set: &HashSet<Str>,
  solved: &mut HashMap<Str, Type>,
  t1: &Type,
  t2: &Type,
) {
  match (t1, t2) {
    (Type::Primitive(k1), Type::Primitive(k2)) => assert_eq!(k1, k2),
    (Type::Id(id1), _)
      if id1.type_arguments.is_empty() && generic_type_parameter_set.contains(&id1.name) =>
    {
      solved.insert(id1.name.clone(), t2.clone());
      return;
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
  generic_type_parameter_set: &HashSet<Str>,
  solved: &mut HashMap<Str, Type>,
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
  generic_type_parameters: &Vec<Str>,
  specialized_type: &IdType,
  parameterized_type_definition: &IdType,
) -> Vec<Type> {
  let mut generic_type_parameter_set = HashSet::new();
  for tparam in generic_type_parameters {
    generic_type_parameter_set.insert(tparam.clone());
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
    .map(|it| solved.remove(it).expect(&format!("Unsolved parameter <{}>", it)))
    .collect_vec()
}

pub(super) fn type_application(type_: &Type, replacement_map: &HashMap<Str, Type>) -> Type {
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
          name: id.name.clone(),
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

fn encode_type_for_generics_specialization(type_: &Type) -> String {
  match type_ {
    Type::Primitive(kind) => kind.to_string(),
    Type::Id(id) => {
      assert!(
        id.type_arguments.is_empty(),
        "The identifier type argument should already be specialized."
      );
      id.name.to_string()
    }
    Type::Fn(_) => {
      panic!("Function type should never appear in generics specialization positions.")
    }
  }
}

pub(super) fn encode_name_after_generics_specialization(
  name: &str,
  type_arguments: &Vec<Type>,
) -> String {
  if type_arguments.is_empty() {
    name.to_string()
  } else {
    format!(
      "{}_{}",
      name,
      type_arguments.iter().map(encode_type_for_generics_specialization).join("_")
    )
  }
}

pub(super) struct TypeLoweringManager {
  pub(super) generic_types: HashSet<Str>,
  pub(super) type_synthesizer: TypeSynthesizer,
}

impl TypeLoweringManager {
  pub(super) fn lower_source_type(&mut self, type_: &source::Type) -> Type {
    match type_ {
      source::Type::Unknown(_) => panic!(),
      source::Type::Primitive(_, kind) => Type::Primitive(match kind {
        source::PrimitiveTypeKind::Bool => PrimitiveType::Bool,
        source::PrimitiveTypeKind::Unit => PrimitiveType::Int,
        source::PrimitiveTypeKind::Int => PrimitiveType::Int,
        source::PrimitiveTypeKind::String => PrimitiveType::String,
      }),
      source::Type::Id(id) => {
        if self.generic_types.contains(&id.id) {
          Type::new_id_str_no_targs(id.id.clone())
        } else {
          Type::new_id_str(
            rc_string(encode_samlang_type(&id.module_reference, &id.id)),
            id.type_arguments.iter().map(|it| self.lower_source_type(it)).collect_vec(),
          )
        }
      }
      source::Type::Fn(f) => {
        let rewritten_function_type = Type::new_fn_unwrapped(
          f.argument_types.iter().map(|it| self.lower_source_type(it)).collect_vec(),
          self.lower_source_type(&f.return_type),
        );
        let type_parameters = Vec::from_iter(
          collect_used_generic_types(&rewritten_function_type, &self.generic_types)
            .into_iter()
            .sorted(),
        );
        let type_args =
          type_parameters.iter().map(|it| Type::new_id_str_no_targs(it.clone())).collect_vec();
        let closure_type_definition =
          self.type_synthesizer.synthesize_closure_type(rewritten_function_type, type_parameters);
        Type::new_id_str(closure_type_definition.identifier.clone(), type_args)
      }
    }
  }

  pub(super) fn lower_source_types(&mut self, source_types: &Vec<Rc<source::Type>>) -> Vec<Type> {
    let mut types = vec![];
    for t in source_types {
      types.push(self.lower_source_type(t));
    }
    return types;
  }

  pub(super) fn lower_source_type_definition(
    &mut self,
    module_reference: &ModuleReference,
    identifier: &str,
    source_type_def: &source::TypeDefinition,
  ) -> TypeDefinition {
    let type_parameters = Vec::from_iter(self.generic_types.iter().cloned().sorted());
    let mut names = vec![];
    let mut mappings = vec![];
    for n in &source_type_def.names {
      names.push(n.name.clone());
      mappings.push(self.lower_source_type(&source_type_def.mappings.get(&n.name).unwrap().type_));
    }
    TypeDefinition {
      identifier: rc_string(encode_samlang_type(module_reference, identifier)),
      is_object: source_type_def.is_object,
      type_parameters,
      names,
      mappings,
    }
  }

  pub(super) fn lower_source_function_type_for_toplevel(
    &mut self,
    argument_types: &Vec<Rc<source::Type>>,
    return_type: &source::Type,
  ) -> (Vec<Str>, FunctionType) {
    let function_type = Type::new_fn_unwrapped(
      argument_types.iter().map(|it| self.lower_source_type(&it)).collect_vec(),
      self.lower_source_type(return_type),
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
    ast::{
      hir::{BOOL_TYPE, INT_TYPE, STRING_TYPE},
      Location, Reason,
    },
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn synthesizer_tests() {
    let mut synthesizer = TypeSynthesizer::new();

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(vec![BOOL_TYPE, Type::new_fn(vec![INT_TYPE], BOOL_TYPE)], vec![])
        .identifier
        .to_string(),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)], vec![])
        .identifier
        .to_string(),
    );

    assert_eq!(
      "$SyntheticIDType0",
      synthesizer
        .synthesize_tuple_type(vec![BOOL_TYPE, Type::new_fn(vec![INT_TYPE], BOOL_TYPE)], vec![])
        .identifier
        .to_string(),
    );
    assert_eq!(
      "$SyntheticIDType1",
      synthesizer
        .synthesize_tuple_type(vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)], vec![])
        .identifier
        .to_string(),
    );

    assert_eq!(
      "$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .identifier
        .to_string(),
    );
    assert_eq!(
      "$SyntheticIDType2",
      synthesizer
        .synthesize_closure_type(Type::new_fn_unwrapped(vec![], INT_TYPE), vec![])
        .identifier
        .to_string(),
    );
    assert_eq!(
      "$SyntheticIDType3",
      synthesizer
        .synthesize_closure_type(Type::new_fn_unwrapped(vec![], BOOL_TYPE), vec![])
        .identifier
        .to_string(),
    );
    assert_eq!(
      "$SyntheticIDType3",
      synthesizer
        .synthesize_closure_type(Type::new_fn_unwrapped(vec![], BOOL_TYPE), vec![])
        .identifier
        .to_string(),
    );

    assert_eq!(
      "$SyntheticIDType4",
      synthesizer
        .synthesize_tuple_type(
          vec![INT_TYPE, Type::new_fn(vec![BOOL_TYPE], BOOL_TYPE)],
          vec![rcs("A")]
        )
        .identifier
        .to_string(),
    );

    let SynthesizedTypes { closure_types, tuple_types } = synthesizer.synthesized_types();

    assert_eq!(
      vec![
        "object type $SyntheticIDType0 = [bool, (int) -> bool]",
        "object type $SyntheticIDType1 = [int, (bool) -> bool]",
        "object type $SyntheticIDType4<A> = [int, (bool) -> bool]"
      ],
      tuple_types.iter().map(|it| it.pretty_print()).collect_vec()
    );
    assert_eq!(
      vec![
        "closure type $SyntheticIDType2 = () -> int",
        "closure type $SyntheticIDType3 = () -> bool",
      ],
      closure_types.iter().map(|it| it.pretty_print()).collect_vec()
    );
  }

  #[test]
  fn collect_used_generic_types_works() {
    let generic_types: HashSet<Str> = vec![rcs("A"), rcs("B")].into_iter().collect();

    assert!(collect_used_generic_types(
      &Type::new_fn_unwrapped(
        vec![BOOL_TYPE, Type::new_fn(vec![BOOL_TYPE], INT_TYPE)],
        Type::new_id_no_targs("C"),
      ),
      &generic_types,
    )
    .is_empty());

    assert_eq!(
      vec![rcs("A")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs("A")),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![rcs("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id_no_targs("B")),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![rcs("A"), rcs("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![Type::new_id_no_targs("B")], Type::new_id_no_targs("A")),
        &generic_types,
      )
      .into_iter()
      .sorted()
      .collect_vec()
    );
    assert_eq!(
      vec![rcs("B")],
      collect_used_generic_types(
        &Type::new_fn_unwrapped(vec![], Type::new_id("A", vec![Type::new_id_no_targs("B")])),
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
    solve_type_arguments(
      &vec![],
      &Type::new_id_unwrapped("A", vec![Type::new_fn(vec![INT_TYPE, BOOL_TYPE], STRING_TYPE)]),
      &Type::new_id_unwrapped(
        "A",
        vec![Type::new_fn(vec![INT_TYPE, BOOL_TYPE], Type::new_fn(vec![], STRING_TYPE))],
      ),
    );
  }

  #[test]
  fn solve_type_arguments_tests() {
    let actual = solve_type_arguments(
      &vec![rcs("A")],
      &Type::new_id_unwrapped(
        "FF",
        vec![Type::new_fn(
          vec![INT_TYPE, BOOL_TYPE],
          Type::new_fn(
            vec![
              Type::new_id("Foo", vec![STRING_TYPE]),
              Type::new_fn(vec![], INT_TYPE),
              Type::new_id_no_targs("B"),
            ],
            STRING_TYPE,
          ),
        )],
      ),
      &Type::new_id_unwrapped(
        "FF",
        vec![Type::new_fn(
          vec![INT_TYPE, BOOL_TYPE],
          Type::new_fn(
            vec![
              Type::new_id("Foo", vec![STRING_TYPE]),
              Type::new_id_no_targs("A"),
              Type::new_id_no_targs("B"),
            ],
            STRING_TYPE,
          ),
        )],
      ),
    );
    assert_eq!("() -> int", actual.iter().map(|it| it.pretty_print()).join(", "));
  }

  #[test]
  fn type_application_tests() {
    assert_eq!("bool", type_application(&BOOL_TYPE, &HashMap::new()).pretty_print());
    assert_eq!("int", type_application(&INT_TYPE, &HashMap::new()).pretty_print());
    assert_eq!("string", type_application(&STRING_TYPE, &HashMap::new()).pretty_print());

    assert_eq!(
      "A<int>",
      type_application(&Type::new_id("A", vec![INT_TYPE]), &HashMap::from([(rcs("A"), INT_TYPE)]))
        .pretty_print()
    );
    assert_eq!(
      "A",
      type_application(&Type::new_id_no_targs("A"), &HashMap::from([(rcs("B"), INT_TYPE)]))
        .pretty_print()
    );
    assert_eq!(
      "int",
      type_application(&Type::new_id_no_targs("A"), &HashMap::from([(rcs("A"), INT_TYPE)]))
        .pretty_print()
    );

    assert_eq!(
      "(int) -> bool",
      type_application(
        &Type::new_fn(vec![Type::new_id_no_targs("A")], Type::new_id_no_targs("B")),
        &HashMap::from([(rcs("A"), INT_TYPE), (rcs("B"), BOOL_TYPE)])
      )
      .pretty_print()
    );
  }

  #[should_panic]
  #[test]
  fn encode_name_after_generics_specialization_panic_test1() {
    encode_name_after_generics_specialization("", &vec![Type::new_fn(vec![], INT_TYPE)]);
  }

  #[should_panic]
  #[test]
  fn encode_name_after_generics_specialization_panic_test2() {
    encode_name_after_generics_specialization("", &vec![Type::new_id("A", vec![INT_TYPE])]);
  }

  #[test]
  fn encode_name_after_generics_specialization_tests() {
    assert_eq!("A", encode_name_after_generics_specialization("A", &vec![]));
    assert_eq!(
      "A_int_B",
      encode_name_after_generics_specialization("A", &vec![INT_TYPE, Type::new_id_no_targs("B")])
    );
  }

  #[should_panic]
  #[test]
  fn type_lowering_manager_lower_source_type_panic_test() {
    TypeLoweringManager { generic_types: HashSet::new(), type_synthesizer: TypeSynthesizer::new() }
      .lower_source_type(&source::Type::Unknown(Reason::dummy()));
  }

  #[test]
  fn type_lowering_manager_lower_source_type_tests() {
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::new(),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    assert_eq!("bool", manager.lower_source_type(&builder.bool_type()).pretty_print());
    assert_eq!("int", manager.lower_source_type(&builder.unit_type()).pretty_print());
    assert_eq!("int", manager.lower_source_type(&builder.int_type()).pretty_print());
    assert_eq!("string", manager.lower_source_type(&builder.string_type()).pretty_print());
    assert_eq!(
      "string",
      manager
        .lower_source_types(&vec![builder.string_type()])
        .iter()
        .map(|it| it.pretty_print())
        .join("")
    );

    assert_eq!(
      "__DUMMY___A<int>",
      manager
        .lower_source_type(&builder.general_id_type("A", vec![builder.int_type()]))
        .pretty_print()
    );

    let mut manager2 = TypeLoweringManager {
      generic_types: HashSet::from([rcs("T")]),
      type_synthesizer: manager.type_synthesizer,
    };
    assert_eq!(
      "$SyntheticIDType0<T>",
      manager2
        .lower_source_type(
          &builder
            .fun_type(vec![builder.simple_id_type("T"), builder.bool_type()], builder.int_type())
        )
        .pretty_print()
    );

    let SynthesizedTypes { closure_types, tuple_types } =
      manager2.type_synthesizer.synthesized_types();
    assert!(tuple_types.is_empty());
    assert_eq!(
      vec!["closure type $SyntheticIDType0<T> = (T, bool) -> int"],
      closure_types.iter().map(|it| it.pretty_print()).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_type_definition_tests() {
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([rcs("A")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    let type_def = manager.lower_source_type_definition(
      &ModuleReference::root(),
      "Foo",
      &source::TypeDefinition {
        loc: Location::dummy(),
        is_object: true,
        names: vec![source::Id::from("a"), source::Id::from("b")],
        mappings: HashMap::from([
          (
            rcs("a"),
            source::FieldType {
              is_public: true,
              type_: builder.fun_type(
                vec![builder.fun_type(vec![builder.simple_id_type("A")], builder.bool_type())],
                builder.bool_type(),
              ),
            },
          ),
          (
            rcs("b"),
            source::FieldType {
              is_public: false,
              type_: builder.fun_type(
                vec![builder.fun_type(vec![builder.simple_id_type("A")], builder.bool_type())],
                builder.bool_type(),
              ),
            },
          ),
        ]),
      },
    );
    let SynthesizedTypes { closure_types, mut tuple_types } =
      manager.type_synthesizer.synthesized_types();
    assert_eq!(
      vec![
        "closure type $SyntheticIDType0<A> = (A) -> bool",
        "closure type $SyntheticIDType1<A> = ($SyntheticIDType0<A>) -> bool",
      ],
      closure_types.iter().map(|it| it.pretty_print()).collect_vec()
    );

    tuple_types.push(type_def);
    assert_eq!(
      vec!["object type _Foo<A> = [$SyntheticIDType1<A>, $SyntheticIDType1<A>]"],
      tuple_types.iter().map(|it| it.pretty_print()).collect_vec()
    );
  }

  #[test]
  fn type_lowering_manager_lower_toplevel_functions_tests() {
    let mut manager = TypeLoweringManager {
      generic_types: HashSet::from([rcs("A")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let builder = source::test_builder::create();

    let (tparams1, f1) = manager
      .lower_source_function_type_for_toplevel(&vec![builder.int_type()], &builder.bool_type());
    assert!(tparams1.is_empty());
    assert_eq!("(int) -> bool", f1.pretty_print());

    let (tparams2, f2) = manager.lower_source_function_type_for_toplevel(
      &vec![builder.fun_type(vec![builder.int_type()], builder.bool_type())],
      &builder.bool_type(),
    );
    assert!(tparams2.is_empty());
    assert_eq!("($SyntheticIDType0) -> bool", f2.pretty_print());
  }
}
