#[cfg(test)]
mod tests {
  use super::super::{
    ssa_analysis::SsaAnalysisResult,
    type_::{
      EnumVariantDefinitionSignature, ISourceType, InterfaceSignature, MemberSignature,
      ModuleSignature, NominalType, Type, TypeDefinitionSignature, TypeParameterSignature,
      test_type_builder,
    },
    typing_context::{LocalTypingContext, TypingContext},
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{Location, Position, Reason};
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::{
    collections::{HashMap, HashSet},
    vec,
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
    assert!(
      empty_local_typing_context().possibly_in_scope_local_variables(Position(0, 0)).is_empty()
    );

    let heap = Heap::new();
    let builder = test_type_builder::create();
    let mut cx = LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::from([(Location::dummy(), Location::dummy())]),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::from([
        (
          Location::from_pos(1, 1, 100, 100),
          HashMap::from([(PStr::LOWER_A, Location::from_pos(1, 2, 3, 4))]),
        ),
        (Location::from_pos(300, 1, 1000, 1000), HashMap::new()),
        (
          Location::from_pos(10, 10, 50, 50),
          HashMap::from([
            (PStr::LOWER_B, Location::from_pos(5, 6, 7, 8)),
            (PStr::LOWER_C, Location::from_pos(9, 10, 11, 12)),
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
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::new();
    let mut local_cx = empty_local_typing_context();
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      PStr::UPPER_A,
      Vec::new(),
    );

    let (a, b) = cx.run_in_synthesis_mode(|cx| cx.in_synthesis_mode());
    assert_eq!(true, a);
    assert_eq!(false, b);

    let (_, c) = cx.run_in_synthesis_mode(|cx| cx.mk_underconstrained_any_type(Reason::dummy()));
    assert_eq!(true, c);
  }

  #[test]
  fn is_subtype_tests() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::DUMMY,
      ModuleSignature {
        interfaces: HashMap::from([(
          PStr::UPPER_A,
          InterfaceSignature {
            private: false,
            type_definition: Some(TypeDefinitionSignature::Enum(Vec::new())),
            type_parameters: vec![TypeParameterSignature {
              name: heap.alloc_str_for_test("T"),
              bound: None,
            }],
            super_types: vec![builder.general_nominal_type_unwrapped(
              PStr::UPPER_B,
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
      ModuleReference::DUMMY,
      PStr::UPPER_A,
      Vec::new(),
    );

    // Non-id lower type
    assert_eq!(
      false,
      cx.is_subtype(&builder.int_type(), &builder.simple_nominal_type(PStr::UPPER_B))
    );
    // Non-existent type
    assert_eq!(
      false,
      cx.is_subtype(
        &builder.simple_nominal_type(PStr::UPPER_B),
        &builder.simple_nominal_type(PStr::UPPER_C)
      )
    );
    // Type-args length mismatch
    assert_eq!(
      false,
      cx.is_subtype(
        &builder.simple_nominal_type(PStr::UPPER_A),
        &builder.simple_nominal_type(PStr::UPPER_B)
      )
    );
    // Type-args mismatch
    assert_eq!(
      false,
      cx.is_subtype(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
        &builder
          .general_nominal_type(PStr::UPPER_B, vec![builder.string_type(), builder.int_type()])
      )
    );
    assert_eq!(
      false,
      cx.is_subtype(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]),
        &builder
          .general_nominal_type(PStr::UPPER_B, vec![builder.string_type(), builder.string_type()])
      )
    );
    // Good
    assert_eq!(
      true,
      cx.is_subtype(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.string_type()]),
        &builder
          .general_nominal_type(PStr::UPPER_B, vec![builder.string_type(), builder.int_type()])
      )
    );
  }

  #[test]
  fn validate_type_instantiation_tests() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::DUMMY,
      ModuleSignature {
        interfaces: HashMap::from([
          (
            PStr::UPPER_A,
            InterfaceSignature {
              private: false,
              type_definition: Some(TypeDefinitionSignature::Enum(Vec::new())),
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str_for_test("T1"), bound: None },
                TypeParameterSignature {
                  name: heap.alloc_str_for_test("T2"),
                  bound: Some(builder.simple_nominal_type_unwrapped(PStr::UPPER_B)),
                },
              ],
              super_types: Vec::new(),
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          ),
          (
            PStr::UPPER_B,
            InterfaceSignature {
              private: false,
              type_definition: None,
              type_parameters: Vec::new(),
              super_types: vec![builder.simple_nominal_type_unwrapped(PStr::UPPER_B)],
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
      ModuleReference::DUMMY,
      PStr::UPPER_A,
      vec![
        TypeParameterSignature { name: heap.alloc_str_for_test("TPARAM"), bound: None },
        TypeParameterSignature {
          name: heap.alloc_str_for_test("T2"),
          bound: Some(builder.simple_nominal_type_unwrapped(PStr::UPPER_A)),
        },
      ],
    );

    let str_tparam = heap.alloc_str_for_test("TPARAM");
    let str_t = heap.alloc_str_for_test("T");
    let str_a = PStr::UPPER_A;
    let str_b = PStr::UPPER_B;
    cx.validate_type_instantiation_allow_abstract_types(&builder.int_type());
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    cx.validate_type_instantiation_allow_abstract_types(&Type::Any(Reason::dummy(), false));
    cx.validate_type_instantiation_allow_abstract_types(&builder.simple_nominal_type(str_tparam));
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.general_nominal_type(str_tparam, vec![builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(&builder.generic_type(str_t));
    cx.validate_type_instantiation_allow_abstract_types(&builder.simple_nominal_type(str_a));
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.general_nominal_type(str_a, vec![builder.int_type(), builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(
      &builder
        .general_nominal_type(str_a, vec![builder.int_type(), builder.simple_nominal_type(str_b)]),
    );
    cx.validate_type_instantiation_strictly(&builder.simple_nominal_type(str_b));

    let expected_errors = r#"
Error -------------------------------------- DUMMY.sam:DUMMY

`int` is not a subtype of `B`.


Error -------------------------------------- DUMMY.sam:DUMMY

`B` is incompatible with `non-abstract type`.


Error -------------------------------------- DUMMY.sam:DUMMY

Type argument arity of 0 is incompatible with type argument arity of 2.


Found 3 errors.
"#;
    assert_eq!(
      expected_errors.trim(),
      cx.error_set.pretty_print_error_messages_no_frame_for_test(&heap).trim()
    );
  }

  #[test]
  fn get_members_test() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mod_ref_w = heap.alloc_module_reference(vec![PStr::UPPER_W]);
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([
      (
        mod_ref_w,
        ModuleSignature {
          interfaces: HashMap::from([(
            PStr::UPPER_A,
            InterfaceSignature {
              private: true,
              type_definition: Some(TypeDefinitionSignature::Enum(Vec::new())),
              type_parameters: Vec::new(),
              super_types: Vec::new(),
              functions: HashMap::from([MemberSignature::create_builtin_function(
                heap.alloc_str_for_test("f1"),
                Vec::new(),
                builder.int_type(),
                vec![PStr::UPPER_C],
              )]),
              methods: HashMap::new(),
            },
          )]),
        },
      ),
      (
        ModuleReference::DUMMY,
        ModuleSignature {
          interfaces: HashMap::from([
            (
              PStr::UPPER_A,
              InterfaceSignature {
                private: false,
                type_definition: Some(TypeDefinitionSignature::Enum(Vec::new())),
                type_parameters: vec![
                  TypeParameterSignature { name: PStr::UPPER_A, bound: None },
                  TypeParameterSignature { name: PStr::UPPER_B, bound: None },
                ],
                super_types: Vec::new(),
                functions: HashMap::from([
                  MemberSignature::create_builtin_function(
                    heap.alloc_str_for_test("f1"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                  MemberSignature::create_private_builtin_function(
                    heap.alloc_str_for_test("f2"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                ]),
                methods: HashMap::from([
                  MemberSignature::create_builtin_function(
                    heap.alloc_str_for_test("m1"),
                    vec![builder.generic_type(PStr::UPPER_A), builder.generic_type(PStr::UPPER_B)],
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                  MemberSignature::create_builtin_function(
                    heap.alloc_str_for_test("m2"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                ]),
              },
            ),
            (
              PStr::UPPER_B,
              InterfaceSignature {
                private: false,
                type_definition: None,
                type_parameters: vec![
                  TypeParameterSignature { name: PStr::UPPER_E, bound: None },
                  TypeParameterSignature { name: PStr::UPPER_F, bound: None },
                ],
                super_types: Vec::new(),
                functions: HashMap::from([
                  MemberSignature::create_builtin_function(
                    heap.alloc_str_for_test("f1"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                  MemberSignature::create_private_builtin_function(
                    heap.alloc_str_for_test("f2"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                ]),
                methods: HashMap::from([
                  MemberSignature::create_builtin_function(
                    heap.alloc_str_for_test("m1"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                  MemberSignature::create_private_builtin_function(
                    heap.alloc_str_for_test("m2"),
                    Vec::new(),
                    builder.int_type(),
                    vec![PStr::UPPER_C],
                  ),
                ]),
              },
            ),
          ]),
        },
      ),
    ]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      PStr::UPPER_A,
      vec![
        TypeParameterSignature {
          name: heap.alloc_str_for_test("TT1"),
          bound: Some(builder.simple_nominal_type_unwrapped(PStr::UPPER_A)),
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

    assert_eq!(false, cx.class_exists(ModuleReference::DUMMY, heap.alloc_str_for_test("s")));
    assert_eq!(
      false,
      cx.class_exists(
        heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
        PStr::UPPER_A
      )
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: mod_ref_w,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_some()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy()
      )
      .is_some()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f3"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m1"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_some()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f3"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m1"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy()
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m2"),
        Location::dummy(),
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_B,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy(),
      )
      .is_none()
    );
    assert_eq!(
      true,
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_C,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("m3"),
        Location::dummy(),
      )
      .is_none()
    );

    assert_eq!(
      "public <C>(int, int) -> int",
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: false,
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
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
          module_reference: ModuleReference::DUMMY,
          id: PStr::UPPER_A,
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f2"),
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );

    assert!(
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("TT2"),
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none()
    );
    assert!(
      cx.get_method_type(
        &NominalType {
          reason: Reason::dummy(),
          is_class_statics: true,
          module_reference: ModuleReference::DUMMY,
          id: heap.alloc_str_for_test("TT3"),
          type_arguments: Vec::new()
        },
        heap.alloc_str_for_test("f1"),
        Location::dummy()
      )
      .is_none()
    );
  }

  #[test]
  fn resolve_type_definitions_test() {
    let builder = test_type_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mod_ref_w = heap.alloc_module_reference(vec![PStr::UPPER_W]);
    let global_cx = HashMap::from([
      (
        ModuleReference::DUMMY,
        ModuleSignature {
          interfaces: HashMap::from([
            (
              PStr::UPPER_A,
              InterfaceSignature {
                private: false,
                type_definition: Some(TypeDefinitionSignature::Enum(vec![
                  EnumVariantDefinitionSignature {
                    name: PStr::LOWER_A,
                    types: vec![builder.generic_type(PStr::UPPER_A)],
                  },
                  EnumVariantDefinitionSignature {
                    name: PStr::LOWER_B,
                    types: vec![builder.generic_type(PStr::UPPER_B)],
                  },
                ])),
                type_parameters: vec![
                  TypeParameterSignature { name: PStr::UPPER_A, bound: None },
                  TypeParameterSignature { name: PStr::UPPER_B, bound: None },
                ],
                super_types: Vec::new(),
                functions: HashMap::new(),
                methods: HashMap::new(),
              },
            ),
            (
              PStr::UPPER_B,
              InterfaceSignature {
                private: false,
                type_definition: Some(TypeDefinitionSignature::Struct(Vec::new())),
                type_parameters: vec![
                  TypeParameterSignature { name: PStr::UPPER_E, bound: None },
                  TypeParameterSignature { name: PStr::UPPER_F, bound: None },
                ],
                super_types: Vec::new(),
                functions: HashMap::new(),
                methods: HashMap::new(),
              },
            ),
          ]),
        },
      ),
      (
        mod_ref_w,
        ModuleSignature {
          interfaces: HashMap::from([(
            PStr::UPPER_A,
            InterfaceSignature {
              private: true,
              type_definition: Some(TypeDefinitionSignature::Enum(vec![
                EnumVariantDefinitionSignature {
                  name: PStr::LOWER_A,
                  types: vec![builder.generic_type(PStr::UPPER_A)],
                },
                EnumVariantDefinitionSignature {
                  name: PStr::LOWER_B,
                  types: vec![builder.generic_type(PStr::UPPER_B)],
                },
              ])),
              type_parameters: vec![
                TypeParameterSignature { name: PStr::UPPER_A, bound: None },
                TypeParameterSignature { name: PStr::UPPER_B, bound: None },
              ],
              super_types: Vec::new(),
              functions: HashMap::new(),
              methods: HashMap::new(),
            },
          )]),
        },
      ),
    ]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      PStr::UPPER_A,
      Vec::new(),
    );

    assert!(cx.resolve_struct_definitions(&builder.bool_type()).is_empty());
    assert!(
      cx.resolve_struct_definitions(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type(), builder.int_type()])
      )
      .is_empty()
    );
    assert!(
      cx.resolve_struct_definitions(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type(), builder.int_type()])
      )
      .is_empty()
    );
    assert!(
      cx.resolve_struct_definitions(
        &builder.general_nominal_type(PStr::UPPER_C, vec![builder.int_type(), builder.int_type()])
      )
      .is_empty()
    );
    assert!(
      cx.resolve_detailed_enum_definitions_opt(&Type::Nominal(NominalType {
        reason: Reason::dummy(),
        is_class_statics: false,
        module_reference: mod_ref_w,
        id: PStr::UPPER_A,
        type_arguments: Vec::new()
      }))
      .is_none()
    );

    let (_, _, resolved) = cx
      .resolve_detailed_enum_definitions_opt(
        &builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type(), builder.int_type()]),
      )
      .unwrap();
    assert_eq!(2, resolved.len());
    let resolved_a = &resolved[0];
    let resolved_b = &resolved[1];
    assert_eq!("int", resolved_a.types[0].pretty_print(&heap));
    assert_eq!("int", resolved_b.types[0].pretty_print(&heap));
  }
}
