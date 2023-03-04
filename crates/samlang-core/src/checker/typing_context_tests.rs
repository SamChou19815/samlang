#[cfg(test)]
mod tests {
  use crate::{
    ast::{Location, Position, Reason},
    checker::{
      ssa_analysis::SsaAnalysisResult,
      type_::{
        test_type_builder, ISourceType, InterfaceSignature, MemberSignature, ModuleSignature, Type,
        TypeDefinitionSignature, TypeParameterSignature,
      },
      typing_context::{LocalTypingContext, TypingContext},
    },
    common::{Heap, ModuleReference},
    errors::ErrorSet,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::{
    collections::{HashMap, HashSet},
    rc::Rc,
  };

  fn empty_local_typing_context() -> LocalTypingContext {
    LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::new(),
      lambda_captures: HashMap::new(),
    })
  }

  #[test]
  fn local_typing_cx_no_crash() {
    empty_local_typing_context().read(&Location::dummy());

    LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::from([(Location::dummy(), Location::dummy())]),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::new(),
      lambda_captures: HashMap::new(),
    })
    .read(&Location::dummy());
  }

  #[test]
  fn possibly_in_scope_local_variables_test() {
    assert!(empty_local_typing_context()
      .possibly_in_scope_local_variables(Position(0, 0))
      .is_empty());

    let mut heap = Heap::new();
    let builder = test_type_builder::create();
    let mut cx = LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::from([(Location::dummy(), Location::dummy())]),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::from([
        (
          Location::from_pos(1, 1, 100, 100),
          HashMap::from([(heap.alloc_str("a"), Location::from_pos(1, 2, 3, 4))]),
        ),
        (Location::from_pos(300, 1, 1000, 1000), HashMap::new()),
        (
          Location::from_pos(10, 10, 50, 50),
          HashMap::from([
            (heap.alloc_str("b"), Location::from_pos(5, 6, 7, 8)),
            (heap.alloc_str("c"), Location::from_pos(9, 10, 11, 12)),
          ]),
        ),
      ]),
      lambda_captures: HashMap::new(),
    });
    cx.write(Location::from_pos(1, 2, 3, 4), builder.int_type());
    cx.write(Location::from_pos(5, 6, 7, 8), builder.bool_type());

    let actual = cx
      .possibly_in_scope_local_variables(Position(20, 20))
      .into_iter()
      .map(|(n, t)| format!("{}: {}", n.as_str(&heap), t.pretty_print(&heap)))
      .join(", ");
    assert_eq!("a: int, b: bool", actual);
  }

  #[test]
  fn is_subtype_tests() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleSignature {
        interfaces: HashMap::from([(
          heap.alloc_str("A"),
          InterfaceSignature {
            type_definition: Some(TypeDefinitionSignature {
              is_object: false,
              names: vec![],
              mappings: HashMap::new(),
            }),
            type_parameters: vec![TypeParameterSignature {
              name: heap.alloc_str("T"),
              bound: None,
            }],
            super_types: vec![builder.general_id_type_unwrapped(
              heap.alloc_str("B"),
              vec![builder.simple_id_type(heap.alloc_str("T")), builder.int_type()],
            )],
            functions: HashMap::new(),
            methods: HashMap::new(),
          },
        )]),
      },
    )]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      heap.alloc_str("A"),
      vec![],
    );

    // Non-id lower type
    assert!(!cx.is_subtype(&builder.int_type(), &builder.simple_id_type(heap.alloc_str("B"))));
    // Non-existent type
    assert!(!cx.is_subtype(
      &builder.simple_id_type(heap.alloc_str("B")),
      &builder.simple_id_type(heap.alloc_str("C"))
    ));
    // Type-args length mismatch
    assert!(!cx.is_subtype(
      &builder.simple_id_type(heap.alloc_str("A")),
      &builder.simple_id_type(heap.alloc_str("B"))
    ));
    // Type-args mismatch
    assert!(!cx.is_subtype(
      &builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type()]),
      &builder
        .general_id_type(heap.alloc_str("B"), vec![builder.string_type(), builder.int_type()])
    ));
    assert!(!cx.is_subtype(
      &builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type()]),
      &builder
        .general_id_type(heap.alloc_str("B"), vec![builder.string_type(), builder.string_type()])
    ));
    // Good
    assert!(cx.is_subtype(
      &builder.general_id_type(heap.alloc_str("A"), vec![builder.string_type()]),
      &builder
        .general_id_type(heap.alloc_str("B"), vec![builder.string_type(), builder.int_type()])
    ));
  }

  #[test]
  fn validate_type_instantiation_tests() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleSignature {
        interfaces: HashMap::from([
          (
            heap.alloc_str("A"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature {
                is_object: false,
                names: vec![],
                mappings: HashMap::new(),
              }),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("T1"), bound: None },
                TypeParameterSignature {
                  name: heap.alloc_str("T2"),
                  bound: Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("B")))),
                },
              ],
              super_types: vec![],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
          (
            heap.alloc_str("B"),
            InterfaceSignature {
              type_definition: None,
              type_parameters: vec![],
              super_types: vec![builder.simple_id_type_unwrapped(heap.alloc_str("B"))],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
        ]),
      },
    )]);
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      heap.alloc_str("A"),
      vec![
        TypeParameterSignature { name: heap.alloc_str("TPARAM"), bound: None },
        TypeParameterSignature {
          name: heap.alloc_str("T2"),
          bound: Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("A")))),
        },
      ],
    );

    let str_tparam = heap.alloc_str("TPARAM");
    let str_t = heap.alloc_str("T");
    let str_a = heap.alloc_str("A");
    let str_b = heap.alloc_str("B");
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.int_type());
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    cx.validate_type_instantiation_allow_abstract_types(&heap, &Type::Unknown(Reason::dummy()));
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.simple_id_type(str_tparam));
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.general_id_type(str_tparam, vec![builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.simple_id_type(str_t));
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.simple_id_type(str_a));
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.general_id_type(str_a, vec![builder.int_type(), builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.general_id_type(str_a, vec![builder.int_type(), builder.simple_id_type(str_b)]),
    );
    cx.validate_type_instantiation_strictly(&heap, &builder.simple_id_type(str_b));

    let expected_errors = r#"
__DUMMY__.sam:0:0-0:0: [incompatible-type]: Expected: subtype of `B`, actual: `int`.
__DUMMY__.sam:0:0-0:0: [incompatible-type]: Expected: `non-abstract type`, actual: `B`.
__DUMMY__.sam:0:0-0:0: [invalid-arity]: Incorrect type arguments size. Expected: 0, actual: 1.
__DUMMY__.sam:0:0-0:0: [invalid-arity]: Incorrect type arguments size. Expected: 2, actual: 0."#
      .trim();
    let actual_errors = cx.error_set.error_messages(&heap).join("\n");
    assert_eq!(expected_errors, actual_errors);
  }

  #[test]
  fn get_members_test() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let str_a = heap.alloc_str("A");
    let str_b = heap.alloc_str("B");
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleSignature {
        interfaces: HashMap::from([
          (
            heap.alloc_str("A"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature {
                is_object: false,
                names: vec![],
                mappings: HashMap::new(),
              }),
              type_parameters: vec![
                TypeParameterSignature { name: str_a, bound: None },
                TypeParameterSignature { name: str_b, bound: None },
              ],
              super_types: vec![],
              functions: HashMap::from([
                MemberSignature::create_builtin_function(
                  &mut heap,
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberSignature::create_private_builtin_function(
                  &mut heap,
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ]),
              methods: HashMap::from([
                MemberSignature::create_builtin_function(
                  &mut heap,
                  "m1",
                  vec![builder.simple_id_type(str_a), builder.simple_id_type(str_b)],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberSignature::create_builtin_function(
                  &mut heap,
                  "m2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ]),
            },
          ),
          (
            heap.alloc_str("B"),
            InterfaceSignature {
              type_definition: None,
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("E"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("F"), bound: None },
              ],
              super_types: vec![],
              functions: HashMap::from([
                MemberSignature::create_builtin_function(
                  &mut heap,
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberSignature::create_private_builtin_function(
                  &mut heap,
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ]),
              methods: HashMap::from([
                MemberSignature::create_builtin_function(
                  &mut heap,
                  "m1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberSignature::create_private_builtin_function(
                  &mut heap,
                  "m2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ]),
            },
          ),
        ]),
      },
    )]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      heap.alloc_str("A"),
      vec![
        TypeParameterSignature {
          name: heap.alloc_str("TT1"),
          bound: Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("A")))),
        },
        TypeParameterSignature { name: heap.alloc_str("TT2"), bound: None },
        TypeParameterSignature {
          name: heap.alloc_str("TT3"),
          bound: Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("sdfasdfasfs")))),
        },
      ],
    );

    assert!(cx
      .get_function_type(
        heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
        heap.alloc_str("A"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("f2"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("f2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("m2"),
        vec![],
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        ModuleReference::dummy(),
        heap.alloc_str("B"),
        heap.alloc_str("m3"),
        vec![],
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        ModuleReference::dummy(),
        heap.alloc_str("C"),
        heap.alloc_str("m3"),
        vec![],
        Location::dummy(),
      )
      .is_none());

    assert_eq!(
      "public <C>(int, int) -> int",
      cx.get_method_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("m1"),
        vec![builder.int_type(), builder.int_type()],
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );
    assert_eq!(
      "private <C>() -> int",
      cx.get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("A"),
        heap.alloc_str("f2"),
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );
    assert_eq!(
      "public <C>() -> int",
      cx.get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("TT1"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .unwrap()
      .to_string(&heap)
    );

    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("TT2"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        ModuleReference::dummy(),
        heap.alloc_str("TT3"),
        heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
  }

  #[test]
  fn resolve_type_definitions_test() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleSignature {
        interfaces: HashMap::from([
          (
            heap.alloc_str("A"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature {
                is_object: false,
                names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
                mappings: HashMap::from([
                  (heap.alloc_str("a"), (builder.simple_id_type(heap.alloc_str("A")), true)),
                  (heap.alloc_str("b"), (builder.simple_id_type(heap.alloc_str("B")), false)),
                ]),
              }),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("A"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("B"), bound: None },
              ],
              super_types: vec![],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
          (
            heap.alloc_str("B"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature {
                is_object: true,
                names: vec![],
                mappings: HashMap::new(),
              }),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("E"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("F"), bound: None },
              ],
              super_types: vec![],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
        ]),
      },
    )]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      heap.alloc_str("A"),
      vec![],
    );

    assert!(cx.resolve_type_definition(&builder.bool_type(), true).names.is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .names
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .names
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type(heap.alloc_str("C"), vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .names
      .is_empty());

    let resolved = cx
      .resolve_type_definition(
        &builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type(), builder.int_type()]),
        false,
      )
      .mappings;
    assert_eq!(2, resolved.len());
    let resolved_a = resolved.get(&heap.alloc_str("a")).unwrap();
    let resolved_b = resolved.get(&heap.alloc_str("b")).unwrap();
    assert_eq!(true, resolved_a.1);
    assert_eq!(false, resolved_b.1);
    assert_eq!("int", resolved_a.0.pretty_print(&heap));
    assert_eq!("int", resolved_b.0.pretty_print(&heap));
  }
}
