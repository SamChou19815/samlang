#[cfg(test)]
mod tests {
  use crate::{
    ast::{Location, Position, Reason},
    checker::{
      ssa_analysis::SsaAnalysisResult,
      type_::{
        test_type_builder, EnumVariantDefinitionSignature, ISourceType, InterfaceSignature,
        MemberSignature, ModuleSignature, NominalType, Type, TypeDefinitionSignature,
        TypeParameterSignature,
      },
      typing_context::{LocalTypingContext, TypingContext},
    },
    common::{well_known_pstrs, Heap, ModuleReference},
    errors::ErrorSet,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::collections::{HashMap, HashSet};

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
          HashMap::from([(heap.alloc_str_for_test("a"), Location::from_pos(1, 2, 3, 4))]),
        ),
        (Location::from_pos(300, 1, 1000, 1000), HashMap::new()),
        (
          Location::from_pos(10, 10, 50, 50),
          HashMap::from([
            (heap.alloc_str_for_test("b"), Location::from_pos(5, 6, 7, 8)),
            (heap.alloc_str_for_test("c"), Location::from_pos(9, 10, 11, 12)),
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
  fn run_in_synthesis_mode_tests() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::new();
    let mut local_cx = empty_local_typing_context();
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      heap.alloc_str_for_test("A"),
      vec![],
    );

    let (a, b) = cx.run_in_synthesis_mode(|cx| cx.in_synthesis_mode());
    assert!(a);
    assert!(!b);

    let (_, c) = cx.run_in_synthesis_mode(|cx| cx.mk_underconstrained_any_type(Reason::dummy()));
    assert!(c);
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
          heap.alloc_str_for_test("A"),
          InterfaceSignature {
            type_definition: Some(TypeDefinitionSignature::Enum(vec![])),
            type_parameters: vec![TypeParameterSignature {
              name: heap.alloc_str_for_test("T"),
              bound: None,
            }],
            super_types: vec![builder.general_nominal_type_unwrapped(
              heap.alloc_str_for_test("B"),
              vec![builder.generic_type(heap.alloc_str_for_test("T")), builder.int_type()],
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
      heap.alloc_str_for_test("A"),
      vec![],
    );

    // Non-id lower type
    assert!(!cx
      .is_subtype(&builder.int_type(), &builder.simple_nominal_type(heap.alloc_str_for_test("B"))));
    // Non-existent type
    assert!(!cx.is_subtype(
      &builder.simple_nominal_type(heap.alloc_str_for_test("B")),
      &builder.simple_nominal_type(heap.alloc_str_for_test("C"))
    ));
    // Type-args length mismatch
    assert!(!cx.is_subtype(
      &builder.simple_nominal_type(heap.alloc_str_for_test("A")),
      &builder.simple_nominal_type(heap.alloc_str_for_test("B"))
    ));
    // Type-args mismatch
    assert!(!cx.is_subtype(
      &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.int_type()]),
      &builder.general_nominal_type(
        heap.alloc_str_for_test("B"),
        vec![builder.string_type(), builder.int_type()]
      )
    ));
    assert!(!cx.is_subtype(
      &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.int_type()]),
      &builder.general_nominal_type(
        heap.alloc_str_for_test("B"),
        vec![builder.string_type(), builder.string_type()]
      )
    ));
    // Good
    assert!(cx.is_subtype(
      &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.string_type()]),
      &builder.general_nominal_type(
        heap.alloc_str_for_test("B"),
        vec![builder.string_type(), builder.int_type()]
      )
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
            heap.alloc_str_for_test("A"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature::Enum(vec![])),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str_for_test("T1"), bound: None },
                TypeParameterSignature {
                  name: heap.alloc_str_for_test("T2"),
                  bound: Some(builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("B"))),
                },
              ],
              super_types: vec![],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
          (
            heap.alloc_str_for_test("B"),
            InterfaceSignature {
              type_definition: None,
              type_parameters: vec![],
              super_types: vec![builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("B"))],
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
      heap.alloc_str_for_test("A"),
      vec![
        TypeParameterSignature { name: heap.alloc_str_for_test("TPARAM"), bound: None },
        TypeParameterSignature {
          name: heap.alloc_str_for_test("T2"),
          bound: Some(builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("A"))),
        },
      ],
    );

    let str_tparam = heap.alloc_str_for_test("TPARAM");
    let str_t = heap.alloc_str_for_test("T");
    let str_a = heap.alloc_str_for_test("A");
    let str_b = heap.alloc_str_for_test("B");
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.int_type());
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    cx.validate_type_instantiation_allow_abstract_types(&heap, &Type::Any(Reason::dummy(), false));
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.simple_nominal_type(str_tparam),
    );
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.general_nominal_type(str_tparam, vec![builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.generic_type(str_t));
    cx.validate_type_instantiation_allow_abstract_types(&heap, &builder.simple_nominal_type(str_a));
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder.general_nominal_type(str_a, vec![builder.int_type(), builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(
      &heap,
      &builder
        .general_nominal_type(str_a, vec![builder.int_type(), builder.simple_nominal_type(str_b)]),
    );
    cx.validate_type_instantiation_strictly(&heap, &builder.simple_nominal_type(str_b));

    let expected_errors = r#"
DUMMY.sam:0:0-0:0: [incompatible-type]: Expected: subtype of `B`, actual: `int`.
DUMMY.sam:0:0-0:0: [incompatible-type]: Expected: `non-abstract type`, actual: `B`.
DUMMY.sam:0:0-0:0: [invalid-arity]: Incorrect type arguments size. Expected: 2, actual: 0."#
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
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleSignature {
        interfaces: HashMap::from([
          (
            well_known_pstrs::UPPER_A,
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature::Enum(vec![])),
              type_parameters: vec![
                TypeParameterSignature { name: well_known_pstrs::UPPER_A, bound: None },
                TypeParameterSignature { name: well_known_pstrs::UPPER_B, bound: None },
              ],
              super_types: vec![],
              functions: HashMap::from([
                MemberSignature::create_builtin_function(
                  heap.alloc_str_for_test("f1"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
                MemberSignature::create_private_builtin_function(
                  heap.alloc_str_for_test("f2"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
              ]),
              methods: HashMap::from([
                MemberSignature::create_builtin_function(
                  heap.alloc_str_for_test("m1"),
                  vec![
                    builder.generic_type(well_known_pstrs::UPPER_A),
                    builder.generic_type(well_known_pstrs::UPPER_B),
                  ],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
                MemberSignature::create_builtin_function(
                  heap.alloc_str_for_test("m2"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
              ]),
            },
          ),
          (
            heap.alloc_str_for_test("B"),
            InterfaceSignature {
              type_definition: None,
              type_parameters: vec![
                TypeParameterSignature { name: well_known_pstrs::UPPER_E, bound: None },
                TypeParameterSignature { name: well_known_pstrs::UPPER_F, bound: None },
              ],
              super_types: vec![],
              functions: HashMap::from([
                MemberSignature::create_builtin_function(
                  heap.alloc_str_for_test("f1"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
                MemberSignature::create_private_builtin_function(
                  heap.alloc_str_for_test("f2"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
              ]),
              methods: HashMap::from([
                MemberSignature::create_builtin_function(
                  heap.alloc_str_for_test("m1"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
                ),
                MemberSignature::create_private_builtin_function(
                  heap.alloc_str_for_test("m2"),
                  vec![],
                  builder.int_type(),
                  vec![well_known_pstrs::UPPER_C],
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
      heap.alloc_str_for_test("A"),
      vec![
        TypeParameterSignature {
          name: heap.alloc_str_for_test("TT1"),
          bound: Some(builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("A"))),
        },
        TypeParameterSignature { name: heap.alloc_str_for_test("TT2"), bound: None },
        TypeParameterSignature {
          name: heap.alloc_str_for_test("TT3"),
          bound: Some(
            builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("sdfasdfasfs")),
          ),
        },
      ],
    );

    assert!(!cx.class_exists(ModuleReference::dummy(), heap.alloc_str_for_test("s")));
    assert!(!cx.class_exists(
      heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
      heap.alloc_str_for_test("A")
    ));
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("B"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("C"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy(),
      )
      .is_none());

    assert_eq!(
      "public <C>(int, int) -> int",
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![builder.int_type(), builder.int_type()]
        },
        heap.alloc_str_for_test("m1"),
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );
    assert_eq!(
      "private <C>() -> int",
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("A"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );

    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("TT2"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::dummy(),
          id: heap.alloc_str_for_test("TT3"),
          type_arguments: vec![]
        },
        heap.alloc_str_for_test("f1"),
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
            heap.alloc_str_for_test("A"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature::Enum(vec![
                EnumVariantDefinitionSignature {
                  name: heap.alloc_str_for_test("a"),
                  types: vec![builder.generic_type(heap.alloc_str_for_test("A"))],
                },
                EnumVariantDefinitionSignature {
                  name: heap.alloc_str_for_test("b"),
                  types: vec![builder.generic_type(heap.alloc_str_for_test("B"))],
                },
              ])),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
                TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
              ],
              super_types: vec![],
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
          (
            heap.alloc_str_for_test("B"),
            InterfaceSignature {
              type_definition: Some(TypeDefinitionSignature::Struct(vec![])),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str_for_test("E"), bound: None },
                TypeParameterSignature { name: heap.alloc_str_for_test("F"), bound: None },
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
      heap.alloc_str_for_test("A"),
      vec![],
    );

    assert!(cx.resolve_struct_definitions(&builder.bool_type()).is_empty());
    assert!(cx
      .resolve_struct_definitions(&builder.general_nominal_type(
        heap.alloc_str_for_test("A"),
        vec![builder.int_type(), builder.int_type()]
      ))
      .is_empty());
    assert!(cx
      .resolve_struct_definitions(&builder.general_nominal_type(
        heap.alloc_str_for_test("A"),
        vec![builder.int_type(), builder.int_type()]
      ))
      .is_empty());
    assert!(cx
      .resolve_struct_definitions(&builder.general_nominal_type(
        heap.alloc_str_for_test("C"),
        vec![builder.int_type(), builder.int_type()]
      ))
      .is_empty());

    let resolved = cx.resolve_enum_definitions(&builder.general_nominal_type(
      heap.alloc_str_for_test("A"),
      vec![builder.int_type(), builder.int_type()],
    ));
    assert_eq!(2, resolved.len());
    let resolved_a = &resolved[0];
    let resolved_b = &resolved[1];
    assert_eq!("int", resolved_a.types[0].pretty_print(&heap));
    assert_eq!("int", resolved_b.types[0].pretty_print(&heap));
  }
}
