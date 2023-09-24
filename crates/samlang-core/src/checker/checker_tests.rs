#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, Id, Literal, NO_COMMENT_REFERENCE},
      Location, Reason,
    },
    checker::{
      main_checker::type_check_expression_for_tests,
      ssa_analysis::{perform_ssa_analysis_on_expression, SsaAnalysisResult},
      type_::{
        create_builtin_module_signature, test_type_builder, EnumVariantDefinitionSignature,
        FunctionType, GlobalSignature, InterfaceSignature, MemberSignature, ModuleSignature,
        StructItemDefinitionSignature, Type, TypeDefinitionSignature, TypeParameterSignature,
      },
      type_check_sources, type_system,
      typing_context::{LocalTypingContext, TypingContext},
    },
    errors::ErrorSet,
    parser::{parse_source_expression_from_text, parse_source_module_from_text},
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::collections::{HashMap, HashSet};

  #[test]
  #[should_panic]
  fn boilterplate_1() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();

    let mut local_cx = LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::new(),
      lambda_captures: HashMap::new(),
    });
    let global_cx = sandbox_global_cx(&mut heap, false);
    let test_str = heap.alloc_str_for_test("Test");
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      test_str,
      /* availableTypeParameters */ vec![],
    );

    type_check_expression_for_tests(
      &mut cx,
      &expr::E::Tuple(
        expr::ExpressionCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          type_: (),
        },
        vec![],
      ),
      None,
    );
  }

  #[test]
  #[should_panic]
  fn boilterplate_2() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();

    let mut local_cx = LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_to_use_map: HashMap::new(),
      local_scoped_def_locs: HashMap::new(),
      lambda_captures: HashMap::new(),
    });
    let global_cx = sandbox_global_cx(&mut heap, false);
    let test_str = heap.alloc_str_for_test("Test");
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      test_str,
      /* availableTypeParameters */ vec![],
    );

    type_check_expression_for_tests(
      &mut cx,
      &expr::E::MethodAccess(expr::MethodAccess {
        common: expr::ExpressionCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          type_: (),
        },
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(expr::E::Literal(expr::ExpressionCommon::dummy(()), Literal::Bool(true))),
        method_name: Id {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: test_str,
        },
      }),
      None,
    );
  }

  fn sandbox_global_cx(heap: &mut Heap, include_std: bool) -> GlobalSignature {
    let builder = test_type_builder::create();

    let mut sigs = HashMap::from([
      (ModuleReference::ROOT, create_builtin_module_signature()),
      (
        ModuleReference::DUMMY,
        ModuleSignature {
          interfaces: HashMap::from([
            (
              heap.alloc_str_for_test("Test"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature::Struct(vec![
                  StructItemDefinitionSignature {
                    name: heap.alloc_str_for_test("foo"),
                    type_: builder.bool_type(),
                    is_public: true,
                  },
                  StructItemDefinitionSignature {
                    name: heap.alloc_str_for_test("bar"),
                    type_: builder.int_type(),
                    is_public: false,
                  },
                  StructItemDefinitionSignature {
                    name: heap.alloc_str_for_test("fff"),
                    type_: builder.fun_type(vec![], builder.string_type()),
                    is_public: false,
                  },
                ])),
                functions: HashMap::from([
                  (
                    PStr::INIT,
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.bool_type(), builder.int_type()],
                        return_type: builder.simple_nominal_type(heap.alloc_str_for_test("Test")),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("helloWorld"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.string_type()],
                        return_type: builder.unit_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("helloWorldWithTypeParameters"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: PStr::UPPER_A,
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(PStr::UPPER_A)],
                        return_type: builder.unit_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("generic1"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![
                        TypeParameterSignature { name: PStr::UPPER_A, bound: None },
                        TypeParameterSignature { name: PStr::UPPER_B, bound: None },
                        TypeParameterSignature { name: PStr::UPPER_C, bound: None },
                        TypeParameterSignature { name: PStr::UPPER_D, bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![
                          builder.generic_type(PStr::UPPER_A),
                          builder.generic_type(PStr::UPPER_B),
                          builder.generic_type(PStr::UPPER_C),
                        ],
                        return_type: builder.generic_type(PStr::UPPER_D),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("generic2"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str_for_test("T"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![
                          builder.fun_type(vec![builder.int_type()], builder.int_type()),
                          builder.generic_type(heap.alloc_str_for_test("T")),
                        ],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("generic3"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![
                        TypeParameterSignature { name: PStr::UPPER_A, bound: None },
                        TypeParameterSignature { name: PStr::UPPER_B, bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.fun_type(
                          vec![builder.generic_type(PStr::UPPER_A)],
                          builder.generic_type(PStr::UPPER_B),
                        )],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("generic4"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.fun_type(
                          vec![builder.int_type(), builder.int_type()],
                          builder.int_type(),
                        )],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                ]),
                methods: HashMap::from([
                  (
                    heap.alloc_str_for_test("baz"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("bazWithTypeParam"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: PStr::UPPER_A,
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("bazWithUsefulTypeParam"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: PStr::UPPER_A,
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(PStr::UPPER_A)],
                        return_type: builder.bool_type(),
                      },
                    },
                  ),
                ]),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("Test2"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature::Enum(vec![
                  EnumVariantDefinitionSignature {
                    name: heap.alloc_str_for_test("Foo"),
                    types: vec![builder.bool_type()],
                  },
                  EnumVariantDefinitionSignature {
                    name: heap.alloc_str_for_test("Bar"),
                    types: vec![builder.int_type()],
                  },
                ])),
                functions: HashMap::from([
                  (
                    heap.alloc_str_for_test("Foo"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.bool_type()],
                        return_type: builder.simple_nominal_type(heap.alloc_str_for_test("Test2")),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("Bar"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.simple_nominal_type(heap.alloc_str_for_test("Test2")),
                      },
                    },
                  ),
                ]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("Test3"),
              InterfaceSignature {
                type_parameters: vec![TypeParameterSignature { name: PStr::UPPER_E, bound: None }],
                type_definition: Some(TypeDefinitionSignature::Struct(vec![
                  StructItemDefinitionSignature {
                    name: heap.alloc_str_for_test("foo"),
                    type_: builder.generic_type(PStr::UPPER_E),
                    is_public: true,
                  },
                  StructItemDefinitionSignature {
                    name: heap.alloc_str_for_test("bar"),
                    type_: builder.int_type(),
                    is_public: false,
                  },
                ])),
                functions: HashMap::new(),
                methods: HashMap::new(),
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("Test4"),
              InterfaceSignature {
                type_parameters: vec![TypeParameterSignature { name: PStr::UPPER_E, bound: None }],
                type_definition: Some(TypeDefinitionSignature::Enum(vec![
                  EnumVariantDefinitionSignature {
                    name: heap.alloc_str_for_test("Foo"),
                    types: vec![builder.generic_type(PStr::UPPER_E)],
                  },
                  EnumVariantDefinitionSignature {
                    name: heap.alloc_str_for_test("Bar"),
                    types: vec![builder.int_type()],
                  },
                ])),
                functions: HashMap::from([
                  (
                    heap.alloc_str_for_test("Foo"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: PStr::UPPER_E,
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(PStr::UPPER_E)],
                        return_type: builder.general_nominal_type(
                          heap.alloc_str_for_test("Test4"),
                          vec![builder.generic_type(PStr::UPPER_E)],
                        ),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("Bar"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: PStr::UPPER_E,
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.general_nominal_type(
                          heap.alloc_str_for_test("Test4"),
                          vec![builder.generic_type(PStr::UPPER_E)],
                        ),
                      },
                    },
                  ),
                ]),
                methods: HashMap::new(),
                super_types: vec![],
              },
            ),
            (
              PStr::UPPER_A,
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature::Struct(vec![
                  StructItemDefinitionSignature {
                    name: PStr::LOWER_A,
                    type_: builder.int_type(),
                    is_public: true,
                  },
                  StructItemDefinitionSignature {
                    name: PStr::LOWER_B,
                    type_: builder.bool_type(),
                    is_public: false,
                  },
                ])),
                functions: HashMap::from([(
                  PStr::INIT,
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(PStr::UPPER_A),
                    },
                  },
                )]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              PStr::UPPER_B,
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature::Struct(vec![
                  StructItemDefinitionSignature {
                    name: PStr::LOWER_A,
                    type_: builder.int_type(),
                    is_public: true,
                  },
                  StructItemDefinitionSignature {
                    name: PStr::LOWER_B,
                    type_: builder.bool_type(),
                    is_public: false,
                  },
                ])),
                functions: HashMap::from([(
                  PStr::INIT,
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(PStr::UPPER_B),
                    },
                  },
                )]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              PStr::UPPER_C,
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature::Enum(vec![
                  EnumVariantDefinitionSignature {
                    name: PStr::LOWER_A,
                    types: vec![builder.int_type()],
                  },
                  EnumVariantDefinitionSignature {
                    name: PStr::LOWER_B,
                    types: vec![builder.bool_type()],
                  },
                ])),
                functions: HashMap::from([(
                  PStr::INIT,
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(PStr::UPPER_C),
                    },
                  },
                )]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
          ]),
        },
      ),
    ]);
    if include_std {
      for (mod_ref, sig) in super::super::global_signature::create_std_signatures(heap) {
        sigs.insert(mod_ref, sig);
      }
    }
    sigs
  }

  fn type_check_expr_in_sandbox(
    heap: &mut Heap,
    source: &str,
    expected_type: &Type,
    current_class: &'static str,
    include_std: bool,
  ) -> String {
    let mut error_set = ErrorSet::new();

    let (_, parsed) =
      parse_source_expression_from_text(source, ModuleReference::DUMMY, heap, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame(heap));

    let mut temp_ssa_error_set = ErrorSet::new();
    let global_cx = sandbox_global_cx(heap, include_std);
    let mut local_cx = LocalTypingContext::new(perform_ssa_analysis_on_expression(
      ModuleReference::DUMMY,
      &parsed,
      &mut temp_ssa_error_set,
    ));
    let current_class = heap.alloc_str_for_test(current_class);
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::DUMMY,
      current_class,
      /* availableTypeParameters */ vec![],
    );

    let expr = type_check_expression_for_tests(&mut cx, &parsed, Some(expected_type));
    if let Some(err) = type_system::assignability_check(expr.type_(), expected_type) {
      cx.error_set.report_stackable_error(expr.loc(), err);
    }
    error_set.pretty_print_error_messages(
      heap,
      &HashMap::from([(ModuleReference::DUMMY, source.to_string())]),
    )
  }

  fn assert_errors_full_customization(
    heap: &mut Heap,
    source: &str,
    expected_type: &Type,
    expected_errors: &str,
    current_class: &'static str,
    include_std: bool,
  ) {
    assert_eq!(
      expected_errors.trim(),
      type_check_expr_in_sandbox(heap, source, expected_type, current_class, include_std).trim()
    );
  }

  fn assert_errors(heap: &mut Heap, source: &str, expected_type: &Type, expected_errors: &str) {
    assert_errors_full_customization(heap, source, expected_type, expected_errors, "Test", false);
  }

  fn assert_checks(heap: &mut Heap, source: &str, expected_type: &Type) {
    assert_errors_full_customization(heap, source, expected_type, "", "Test", false);
  }

  #[test]
  fn simple_expressions_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "true", &builder.bool_type());
    assert_checks(heap, "false", &builder.bool_type());
    assert_checks(heap, "42", &builder.int_type());
    assert_checks(heap, "\"a\"", &builder.string_type());
    assert_errors(
      heap,
      "true",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:5

`bool` [1] is incompatible with `unit` .

  1| true
     ^^^^

  [1] DUMMY.sam:1:1-1:5
  ---------------------
  1| true
     ^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "false",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`bool` [1] is incompatible with `unit` .

  1| false
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| false
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "42",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:3

`int` [1] is incompatible with `unit` .

  1| 42
     ^^

  [1] DUMMY.sam:1:1-1:3
  ---------------------
  1| 42
     ^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "\"a\"",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:4

`Str` [1] is incompatible with `unit` .

  1| "a"
     ^^^

  [1] DUMMY.sam:1:1-1:4
  ---------------------
  1| "a"
     ^^^


Found 1 error.
"#,
    );

    assert_checks(heap, "this", &builder.int_type());
    assert_checks(heap, "{ let foo = 3; foo }", &builder.int_type());
    assert_errors(
      heap,
      "{ let foo = true; foo }",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:24

`bool` [1] is incompatible with `int` .

  1| { let foo = true; foo }
     ^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:24
  ----------------------
  1| { let foo = true; foo }
     ^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
  }

  #[test]
  fn tuple_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_errors_full_customization(
      heap,
      r#"{
  let _: int = [1, 1].e1;
  let _: int = [1, 1, 1].e2;
  let _: int = [1, 1, 1, 1].e3;
  let _: int = [1, 1, 1, 1, 1].e4;
  let _: int = [1, 1, 1, 1, 1, 1].e5;
  let _: int = [1, 1, 1, 1, 1, 1, 1].e6;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1].e7;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1].e8;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e9;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e10;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e11;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e12;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e13;
  let _: bool = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e14;
  let _: int = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e15;
}"#,
      &builder.unit_type(),
      r#"
Error --------------------------------- DUMMY.sam:15:3-15:67

`int` [1] is incompatible with `bool` [2].

  15|   let _: bool = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e14;
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:15:17-15:66
  -------------------------
  15|   let _: bool = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e14;
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [2] DUMMY.sam:15:10-15:14
  -------------------------
  15|   let _: bool = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].e14;
               ^^^^


Found 1 error.
"#,
      "Test",
      true,
    );
  }

  #[test]
  fn class_members_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(
      heap,
      "Test.helloWorldWithTypeParameters<int>",
      &builder.fun_type(vec![builder.int_type()], builder.unit_type()),
    );
    assert_checks(
      heap,
      "Test.helloWorld",
      &builder.fun_type(vec![builder.string_type()], builder.unit_type()),
    );

    assert_errors(
      heap,
      "Test.helloWorld<A>",
      &builder.fun_type(vec![builder.string_type()], builder.unit_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:19

Type argument arity of 1 is incompatible with type argument arity of 0.

  1| Test.helloWorld<A>
     ^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:34

`(any) -> unit` is incompatible with `(Str, Str) -> unit`.
- Function parameter arity of 1 is incompatible with function parameter arity of 2.

  1| Test.helloWorldWithTypeParameters
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:1-1:34

There is not enough context information to decide the type of this expression.

  1| Test.helloWorldWithTypeParameters
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.string_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:34

`(any) -> unit` [1] is incompatible with `Str` .

  1| Test.helloWorldWithTypeParameters
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:34
  ----------------------
  1| Test.helloWorldWithTypeParameters
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:1-1:34

There is not enough context information to decide the type of this expression.

  1| Test.helloWorldWithTypeParameters
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<int, Str>",
      &builder.fun_type(vec![builder.int_type()], builder.unit_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:44

Type argument arity of 2 is incompatible with type argument arity of 1.

  1| Test.helloWorldWithTypeParameters<int, Str>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<Str>",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:39

`(Str) -> unit` is incompatible with `(Str, Str) -> unit`.
- Function parameter arity of 1 is incompatible with function parameter arity of 2.

  1| Test.helloWorldWithTypeParameters<Str>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorld2",
      &builder.fun_type(vec![builder.string_type()], builder.unit_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:6-1:17

Cannot find member `helloWorld2` on `Test`.

  1| Test.helloWorld2
          ^^^^^^^^^^^


Found 1 error.
"#,
    );
  }

  #[test]
  fn ctors_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    let test_str = heap.alloc_str_for_test("Test");
    let test2_str = heap.alloc_str_for_test("Test2");
    let test4_str = heap.alloc_str_for_test("Test4");

    assert_checks(heap, "Test.init(true, 3)", &builder.simple_nominal_type(test_str));
    assert_checks(
      heap,
      "{ let foo=true; Test.init(foo, 3) }",
      &builder.simple_nominal_type(test_str),
    );
    assert_errors_full_customization(
      heap,
      "Test2.Foo(true)",
      &builder.simple_nominal_type(test2_str),
      "",
      "Test2",
      false,
    );
    assert_errors_full_customization(
      heap,
      "Test2.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      "",
      "Test2",
      false,
    );
    assert_errors_full_customization(
      heap,
      "Test4.Foo(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      "",
      "Test4",
      false,
    );
    assert_errors_full_customization(
      heap,
      "Test4.Foo<bool>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      "",
      "Test4",
      false,
    );

    assert_errors(
      heap,
      "Test.Foo(true)",
      &builder.simple_nominal_type(test2_str),
      r#"
Error ------------------------------------ DUMMY.sam:1:6-1:9

Cannot find member `Foo` on `Test`.

  1| Test.Foo(true)
          ^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      r#"
Error ------------------------------------ DUMMY.sam:1:6-1:9

Cannot find member `Bar` on `Test`.

  1| Test.Bar(42)
          ^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test4.Foo<int, bool>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:21

Type argument arity of 2 is incompatible with type argument arity of 1.

  1| Test4.Foo<int, bool>(true)
     ^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.int_type()]),
      r#"
Error ---------------------------------- DUMMY.sam:1:16-1:20

`bool` [1] is incompatible with `int` [2].

  1| Test4.Foo<int>(true)
                    ^^^^

  [1] DUMMY.sam:1:16-1:20
  -----------------------
  1| Test4.Foo<int>(true)
                    ^^^^

  [2] DUMMY.sam:1:11-1:14
  -----------------------
  1| Test4.Foo<int>(true)
               ^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:21

`Test4<int>` is incompatible with `Test4<bool>`.
- `int` [1] is incompatible with `bool` .

  1| Test4.Foo<int>(true)
     ^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:11-1:14
  -----------------------
  1| Test4.Foo<int>(true)
               ^^^


Error ---------------------------------- DUMMY.sam:1:16-1:20

`bool` [1] is incompatible with `int` [2].

  1| Test4.Foo<int>(true)
                    ^^^^

  [1] DUMMY.sam:1:16-1:20
  -----------------------
  1| Test4.Foo<int>(true)
                    ^^^^

  [2] DUMMY.sam:1:11-1:14
  -----------------------
  1| Test4.Foo<int>(true)
               ^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "Test44.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:7

Class `Test44` is not resolved.

  1| Test44.Bar(42)
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors_full_customization(
      heap,
      "Test2.Tars(42)",
      &builder.simple_nominal_type(test2_str),
      r#"
Error ----------------------------------- DUMMY.sam:1:7-1:11

Cannot find member `Tars` on `Test2`.

  1| Test2.Tars(42)
           ^^^^


Found 1 error.
"#,
      "Test2",
      false,
    );
  }

  #[test]
  fn field_and_method_access_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "Test.init(true, 3).foo", &builder.bool_type());
    assert_checks(heap, "Test.init(true, 3).bar", &builder.int_type());
    assert_checks(
      heap,
      "Test.init(true, 3).baz",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    assert_checks(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    assert_checks(
      heap,
      "Test.init(true, 3).bazWithTypeParam<int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    assert_checks(
      heap,
      "Test.init(true, 3).bazWithUsefulTypeParam<int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );

    assert_errors(
      heap,
      "3.foo",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:2

`int` is incompatible with `nominal type`.

  1| 3.foo
     ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazz",
      &builder.int_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:20-1:24

Cannot find member `bazz` on `Test`.

  1| Test.init(true, 3).bazz
                        ^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "{ let _ = (t3: Test3<bool>) -> t3.bar; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:35-1:38

Cannot find member `bar` on `Test3`.

  1| { let _ = (t3: Test3<bool>) -> t3.bar; }
                                       ^^^


Found 1 error.
"#,
    );
    assert_errors_full_customization(
      heap,
      "Test2.Foo(true).foo",
      &builder.int_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:17-1:20

Cannot find member `foo` on `Test2`.

  1| Test2.Foo(true).foo
                     ^^^


Found 1 error.
"#,
      "Test2",
      false,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).foo<int>",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:28

Type argument arity of 1 is incompatible with type argument arity of 0.

  1| Test.init(true, 3).foo<int>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).foo",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:23

`bool` [1] is incompatible with `int` .

  1| Test.init(true, 3).foo
     ^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:23
  ----------------------
  1| Test.init(true, 3).foo
     ^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bar",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:23

`int` [1] is incompatible with `bool` .

  1| Test.init(true, 3).bar
     ^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:23
  ----------------------
  1| Test.init(true, 3).bar
     ^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:23

`(int) -> bool` [1] is incompatible with `int` .

  1| Test.init(true, 3).baz
     ^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:23
  ----------------------
  1| Test.init(true, 3).baz
     ^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz<int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:28

Type argument arity of 1 is incompatible with type argument arity of 0.

  1| Test.init(true, 3).baz<int>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:36

`(int) -> bool` [1] is incompatible with `int` .

  1| Test.init(true, 3).bazWithTypeParam
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:36
  ----------------------
  1| Test.init(true, 3).bazWithTypeParam
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:1-1:36

There is not enough context information to decide the type of this expression.

  1| Test.init(true, 3).bazWithTypeParam
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.fun_type(vec![builder.int_type(), builder.int_type()], builder.bool_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:36

`(int) -> bool` is incompatible with `(int, int) -> bool`.
- Function parameter arity of 1 is incompatible with function parameter arity of 2.

  1| Test.init(true, 3).bazWithTypeParam
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:1-1:36

There is not enough context information to decide the type of this expression.

  1| Test.init(true, 3).bazWithTypeParam
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam<int, int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:46

Type argument arity of 2 is incompatible with type argument arity of 1.

  1| Test.init(true, 3).bazWithTypeParam<int, int>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithUsefulTypeParam<bool>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:48

`(bool) -> bool` is incompatible with `(int) -> bool`.
- `bool` [1] is incompatible with `int` .

  1| Test.init(true, 3).bazWithUsefulTypeParam<bool>
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:43-1:47
  -----------------------
  1| Test.init(true, 3).bazWithUsefulTypeParam<bool>
                                               ^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.fun_type(vec![builder.bool_type()], builder.int_type()),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:23

`(int) -> bool` is incompatible with `(bool) -> int`.
- `int`  is incompatible with `bool` .

  1| Test.init(true, 3).baz
     ^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );

    assert_errors(
      heap,
      "{ let _ = (t) -> t.foo; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:12-1:13

There is not enough context information to decide the type of this expression.

  1| { let _ = (t) -> t.foo; }
                ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "{ let _ = (t) -> t.bar; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:12-1:13

There is not enough context information to decide the type of this expression.

  1| { let _ = (t) -> t.bar; }
                ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "{ let _ = (t) -> t.baz; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:12-1:13

There is not enough context information to decide the type of this expression.

  1| { let _ = (t) -> t.baz; }
                ^


Found 1 error.
"#,
    );
  }

  #[test]
  fn function_call_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "Process.panic(\"\")", &builder.unit_type());
    assert_checks(heap, "Process.panic(\"\")", &builder.bool_type());
    assert_checks(heap, "Process.panic(\"\")", &builder.int_type());
    assert_checks(heap, "Process.panic(\"\")", &builder.string_type());
    assert_checks(
      heap,
      "Process.panic(\"\")",
      &builder.fun_type(vec![builder.int_type(), builder.bool_type()], builder.string_type()),
    );
    assert_checks(heap, "Test.helloWorld(\"\")", &builder.unit_type());
    assert_checks(heap, "Test.init(true, 3).fff()", &builder.string_type());
    assert_checks(heap, "((i: int) -> true)(3)", &builder.bool_type());

    assert_errors(
      heap,
      "Process.panic(3)",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:15-1:16

`int` [1] is incompatible with `Str` .

  1| Process.panic(3)
                   ^

  [1] DUMMY.sam:1:15-1:16
  -----------------------
  1| Process.panic(3)
                   ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "3(3)",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:2

`int` is incompatible with `nominal type`.

  1| 3(3)
     ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorld(3)",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:17-1:18

`int` [1] is incompatible with `Str` .

  1| Test.helloWorld(3)
                     ^

  [1] DUMMY.sam:1:17-1:18
  -----------------------
  1| Test.helloWorld(3)
                     ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).fff()",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:25

`Str` [1] is incompatible with `int` .

  1| Test.init(true, 3).fff()
     ^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:25
  ----------------------
  1| Test.init(true, 3).fff()
     ^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "((i: int) -> true)({})",
      &builder.bool_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:20-1:22

`unit` [1] is incompatible with `int` [2].

  1| ((i: int) -> true)({})
                        ^^

  [1] DUMMY.sam:1:20-1:22
  -----------------------
  1| ((i: int) -> true)({})
                        ^^

  [2] DUMMY.sam:1:6-1:9
  ---------------------
  1| ((i: int) -> true)({})
          ^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.helloWorld(\"\")",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:20

`unit` [1] is incompatible with `bool` .

  1| Test.helloWorld("")
     ^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:20
  ----------------------
  1| Test.helloWorld("")
     ^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz(3)",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:26

`bool` [1] is incompatible with `int` .

  1| Test.init(true, 3).baz(3)
     ^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:26
  ----------------------
  1| Test.init(true, 3).baz(3)
     ^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "((i: int) -> true)(3)",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:2-1:22

`bool` [1] is incompatible with `int` .

  1| ((i: int) -> true)(3)
      ^^^^^^^^^^^^^^^^^^^^

  [1] DUMMY.sam:1:2-1:22
  ----------------------
  1| ((i: int) -> true)(3)
      ^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam(1)",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:39

There is not enough context information to decide the type of this expression.

  1| Test.init(true, 3).bazWithTypeParam(1)
     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Found 1 error.
"#,
    );
  }

  #[test]
  fn unary_binary_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "-(1)", &builder.int_type());
    assert_checks(heap, "!true", &builder.bool_type());
    assert_checks(heap, "!false", &builder.bool_type());
    assert_checks(heap, "1 * 1", &builder.int_type());
    assert_checks(heap, "1 - 1", &builder.int_type());
    assert_checks(heap, "1 % 1", &builder.int_type());
    assert_checks(heap, "1 + 1", &builder.int_type());
    assert_checks(heap, "1 - 1", &builder.int_type());
    assert_checks(heap, "1 < 1", &builder.bool_type());
    assert_checks(heap, "1 <= 1", &builder.bool_type());
    assert_checks(heap, "1 > 1", &builder.bool_type());
    assert_checks(heap, "1 >= 1", &builder.bool_type());
    assert_checks(heap, "true || false", &builder.bool_type());
    assert_checks(heap, "false && true", &builder.bool_type());
    assert_checks(heap, "\"false\" :: \"string\"", &builder.string_type());
    assert_checks(heap, "1 == 1", &builder.bool_type());
    assert_checks(heap, "true == false", &builder.bool_type());
    assert_checks(heap, "false != true", &builder.bool_type());
    assert_checks(heap, "\"\" != \"3\"", &builder.bool_type());
    assert_checks(heap, "{ let _ = (t: Str, f: Str) -> t == f; }", &builder.unit_type());

    assert_errors(
      heap,
      "-(false)",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:3-1:8

`bool` [1] is incompatible with `int` [2].

  1| -(false)
       ^^^^^

  [1] DUMMY.sam:1:3-1:8
  ---------------------
  1| -(false)
       ^^^^^

  [2] DUMMY.sam:1:1-1:8
  ---------------------
  1| -(false)
     ^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "!1",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:2-1:3

`int` [1] is incompatible with `bool` [2].

  1| !1
      ^

  [1] DUMMY.sam:1:2-1:3
  ---------------------
  1| !1
      ^

  [2] DUMMY.sam:1:1-1:3
  ---------------------
  1| !1
     ^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "-(1+1)",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `bool` .

  1| -(1+1)
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| -(1+1)
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "!true",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`bool` [1] is incompatible with `int` .

  1| !true
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| !true
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "!false",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:7

`bool` [1] is incompatible with `int` .

  1| !false
     ^^^^^^

  [1] DUMMY.sam:1:1-1:7
  ---------------------
  1| !false
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "\"1\" * \"1\"",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:4

`Str` [1] is incompatible with `int` [2].

  1| "1" * "1"
     ^^^

  [1] DUMMY.sam:1:1-1:4
  ---------------------
  1| "1" * "1"
     ^^^

  [2] DUMMY.sam:1:1-1:10
  ----------------------
  1| "1" * "1"
     ^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:7-1:10

`Str` [1] is incompatible with `int` [2].

  1| "1" * "1"
           ^^^

  [1] DUMMY.sam:1:7-1:10
  ----------------------
  1| "1" * "1"
           ^^^

  [2] DUMMY.sam:1:1-1:10
  ----------------------
  1| "1" * "1"
     ^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "\"1\" - 1",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:4

`Str` [1] is incompatible with `int` [2].

  1| "1" - 1
     ^^^

  [1] DUMMY.sam:1:1-1:4
  ---------------------
  1| "1" - 1
     ^^^

  [2] DUMMY.sam:1:1-1:8
  ---------------------
  1| "1" - 1
     ^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 % \"1\"",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:5-1:8

`Str` [1] is incompatible with `int` [2].

  1| 1 % "1"
         ^^^

  [1] DUMMY.sam:1:5-1:8
  ---------------------
  1| 1 % "1"
         ^^^

  [2] DUMMY.sam:1:1-1:8
  ---------------------
  1| 1 % "1"
     ^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 + false",
      &builder.int_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:5-1:10

`bool` [1] is incompatible with `int` [2].

  1| 1 + false
         ^^^^^

  [1] DUMMY.sam:1:5-1:10
  ----------------------
  1| 1 + false
         ^^^^^

  [2] DUMMY.sam:1:1-1:10
  ----------------------
  1| 1 + false
     ^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "false - 1",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`bool` [1] is incompatible with `int` [2].

  1| false - 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| false - 1
     ^^^^^

  [2] DUMMY.sam:1:1-1:10
  ----------------------
  1| false - 1
     ^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "\"\" < false",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:3

`Str` [1] is incompatible with `int` [2].

  1| "" < false
     ^^

  [1] DUMMY.sam:1:1-1:3
  ---------------------
  1| "" < false
     ^^

  [2] DUMMY.sam:1:1-1:11
  ----------------------
  1| "" < false
     ^^^^^^^^^^


Error ----------------------------------- DUMMY.sam:1:6-1:11

`bool` [1] is incompatible with `int` [2].

  1| "" < false
          ^^^^^

  [1] DUMMY.sam:1:6-1:11
  ----------------------
  1| "" < false
          ^^^^^

  [2] DUMMY.sam:1:1-1:11
  ----------------------
  1| "" < false
     ^^^^^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "1 <= false",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:6-1:11

`bool` [1] is incompatible with `int` [2].

  1| 1 <= false
          ^^^^^

  [1] DUMMY.sam:1:6-1:11
  ----------------------
  1| 1 <= false
          ^^^^^

  [2] DUMMY.sam:1:1-1:11
  ----------------------
  1| 1 <= false
     ^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 > \"\"",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:5-1:7

`Str` [1] is incompatible with `int` [2].

  1| 1 > ""
         ^^

  [1] DUMMY.sam:1:5-1:7
  ---------------------
  1| 1 > ""
         ^^

  [2] DUMMY.sam:1:1-1:7
  ---------------------
  1| 1 > ""
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true >= 1",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:5

`bool` [1] is incompatible with `int` [2].

  1| true >= 1
     ^^^^

  [1] DUMMY.sam:1:1-1:5
  ---------------------
  1| true >= 1
     ^^^^

  [2] DUMMY.sam:1:1-1:10
  ----------------------
  1| true >= 1
     ^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "false || 4",
      &builder.bool_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:10-1:11

`int` [1] is incompatible with `bool` [2].

  1| false || 4
              ^

  [1] DUMMY.sam:1:10-1:11
  -----------------------
  1| false || 4
              ^

  [2] DUMMY.sam:1:1-1:11
  ----------------------
  1| false || 4
     ^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "2 && 3",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:2

`int` [1] is incompatible with `bool` [2].

  1| 2 && 3
     ^

  [1] DUMMY.sam:1:1-1:2
  ---------------------
  1| 2 && 3
     ^

  [2] DUMMY.sam:1:1-1:7
  ---------------------
  1| 2 && 3
     ^^^^^^


Error ------------------------------------ DUMMY.sam:1:6-1:7

`int` [1] is incompatible with `bool` [2].

  1| 2 && 3
          ^

  [1] DUMMY.sam:1:6-1:7
  ---------------------
  1| 2 && 3
          ^

  [2] DUMMY.sam:1:1-1:7
  ---------------------
  1| 2 && 3
     ^^^^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "1 == false",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:6-1:11

`bool` [1] is incompatible with `int` [2].

  1| 1 == false
          ^^^^^

  [1] DUMMY.sam:1:6-1:11
  ----------------------
  1| 1 == false
          ^^^^^

  [2] DUMMY.sam:1:1-1:2
  ---------------------
  1| 1 == false
     ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true == 3",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:9-1:10

`int` [1] is incompatible with `bool` [2].

  1| true == 3
             ^

  [1] DUMMY.sam:1:9-1:10
  ----------------------
  1| true == 3
             ^

  [2] DUMMY.sam:1:1-1:5
  ---------------------
  1| true == 3
     ^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true != 3",
      &builder.bool_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:9-1:10

`int` [1] is incompatible with `bool` [2].

  1| true != 3
             ^

  [1] DUMMY.sam:1:9-1:10
  ----------------------
  1| true != 3
             ^

  [2] DUMMY.sam:1:1-1:5
  ---------------------
  1| true != 3
     ^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "\"\" != 3",
      &builder.bool_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:7-1:8

`int` [1] is incompatible with `Str` [2].

  1| "" != 3
           ^

  [1] DUMMY.sam:1:7-1:8
  ---------------------
  1| "" != 3
           ^

  [2] DUMMY.sam:1:1-1:3
  ---------------------
  1| "" != 3
     ^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "{ let _ = (t: int, f: bool) -> t == f; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:37-1:38

`bool` [1] is incompatible with `int` [2].

  1| { let _ = (t: int, f: bool) -> t == f; }
                                         ^

  [1] DUMMY.sam:1:37-1:38
  -----------------------
  1| { let _ = (t: int, f: bool) -> t == f; }
                                         ^

  [2] DUMMY.sam:1:32-1:33
  -----------------------
  1| { let _ = (t: int, f: bool) -> t == f; }
                                    ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 * 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `unit` .

  1| 1 * 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 * 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `unit` .

  1| 1 - 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 - 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 % 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `unit` .

  1| 1 % 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 % 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 + 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `unit` .

  1| 1 + 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 + 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`int` [1] is incompatible with `unit` .

  1| 1 - 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 - 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 < 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`bool` [1] is incompatible with `unit` .

  1| 1 < 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 < 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 <= 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:7

`bool` [1] is incompatible with `unit` .

  1| 1 <= 1
     ^^^^^^

  [1] DUMMY.sam:1:1-1:7
  ---------------------
  1| 1 <= 1
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 > 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:6

`bool` [1] is incompatible with `unit` .

  1| 1 > 1
     ^^^^^

  [1] DUMMY.sam:1:1-1:6
  ---------------------
  1| 1 > 1
     ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 >= 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:7

`bool` [1] is incompatible with `unit` .

  1| 1 >= 1
     ^^^^^^

  [1] DUMMY.sam:1:1-1:7
  ---------------------
  1| 1 >= 1
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true || false",
      &builder.unit_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:14

`bool` [1] is incompatible with `unit` .

  1| true || false
     ^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:14
  ----------------------
  1| true || false
     ^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "false && true",
      &builder.unit_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:14

`bool` [1] is incompatible with `unit` .

  1| false && true
     ^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:14
  ----------------------
  1| false && true
     ^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "1 == 1",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:7

`bool` [1] is incompatible with `unit` .

  1| 1 == 1
     ^^^^^^

  [1] DUMMY.sam:1:1-1:7
  ---------------------
  1| 1 == 1
     ^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true == false",
      &builder.unit_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:14

`bool` [1] is incompatible with `unit` .

  1| true == false
     ^^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:14
  ----------------------
  1| true == false
     ^^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "true != true",
      &builder.unit_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:13

`bool` [1] is incompatible with `unit` .

  1| true != true
     ^^^^^^^^^^^^

  [1] DUMMY.sam:1:1-1:13
  ----------------------
  1| true != true
     ^^^^^^^^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      r#""" != "3""#,
      &builder.unit_type(),
      r#"
Error ----------------------------------- DUMMY.sam:1:1-1:10

`bool` [1] is incompatible with `unit` .

  1| "" != "3"
     ^^^^^^^^^

  [1] DUMMY.sam:1:1-1:10
  ----------------------
  1| "" != "3"
     ^^^^^^^^^


Found 1 error.
"#,
    );
  }

  #[test]
  fn control_flow_expressions_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "if true then false else true", &builder.bool_type());
    assert_checks(heap, "if false then 1 else 0", &builder.int_type());
    assert_checks(heap, "if false then \"\" else \"\"", &builder.string_type());
    assert_checks(
      heap,
      "{ let _ = (b: bool, t: int, f: int) -> if b then t else f; }",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "{ let _ = (t: Test) -> if let {foo, bar as _} = t then 1 else 2; }",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "{ let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(s) -> 2 }; }",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "{ let _ = (t: Test2) -> if let Foo(_) = t then 1 else 2; }",
      &builder.unit_type(),
    );
    assert_errors_full_customization(
      heap,
      "{ let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(s) -> 2 }; }",
      &builder.unit_type(),
      "",
      "Test2",
      false,
    );
    assert_errors_full_customization(
      heap,
      "{ let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(d) -> 2 }; }",
      &builder.unit_type(),
      "",
      "Test2",
      false,
    );

    assert_errors(
      heap,
      "if true then false else 1",
      &builder.bool_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:25-1:26

`int` [1] is incompatible with `bool` [2].

  1| if true then false else 1
                             ^

  [1] DUMMY.sam:1:25-1:26
  -----------------------
  1| if true then false else 1
                             ^

  [2] DUMMY.sam:1:14-1:19
  -----------------------
  1| if true then false else 1
                  ^^^^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "if false then 1 else false",
      &builder.int_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:22-1:27

`bool` [1] is incompatible with `int` [2].

  1| if false then 1 else false
                          ^^^^^

  [1] DUMMY.sam:1:22-1:27
  -----------------------
  1| if false then 1 else false
                          ^^^^^

  [2] DUMMY.sam:1:15-1:16
  -----------------------
  1| if false then 1 else false
                   ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "if false then \"\" else 3",
      &builder.string_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:23-1:24

`int` [1] is incompatible with `Str` [2].

  1| if false then "" else 3
                           ^

  [1] DUMMY.sam:1:23-1:24
  -----------------------
  1| if false then "" else 3
                           ^

  [2] DUMMY.sam:1:15-1:17
  -----------------------
  1| if false then "" else 3
                   ^^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      r#"{
  let _ = (b: bool, t: bool, f: int) -> (
    if b then t else f
  );
}"#,
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:3:22-3:23

`int` [1] is incompatible with `bool` [2].

  3|     if b then t else f
                          ^

  [1] DUMMY.sam:3:22-3:23
  -----------------------
  3|     if b then t else f
                          ^

  [2] DUMMY.sam:3:15-3:16
  -----------------------
  3|     if b then t else f
                   ^


Found 1 error.
"#,
    );
    assert_errors_full_customization(
      heap,
      "{ let _ = (t: Test) -> if let [a, b, _] = [1, 2] then 1 else 2; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:38-1:39

Cannot access member of `Pair<int, int>` at index 2.

  1| { let _ = (t: Test) -> if let [a, b, _] = [1, 2] then 1 else 2; }
                                          ^


Found 1 error.
"#,
      "Test",
      true,
    );
    assert_errors_full_customization(
      heap,
      r#"{ let _ = (t: Test) -> if let {bar, boo} = t then 1 else 2;
let _ = (t: Test) -> if let [_, bar] = t then 1 else 2;
let _ = (t: Test2) -> if let Foo(_) = t then 1 else 2;
let _ = (t: Test2) -> if let Foo(_, _) = t then 1 else 2;
let _ = (t: Test2) -> if let Foo111(_) = t then 1 else 2;
}"#,
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:32-1:35

Cannot find member `bar` on `Test`.

  1| { let _ = (t: Test) -> if let {bar, boo} = t then 1 else 2;
                                    ^^^


Error ---------------------------------- DUMMY.sam:1:37-1:40

Cannot find member `boo` on `Test`.

  1| { let _ = (t: Test) -> if let {bar, boo} = t then 1 else 2;
                                         ^^^


Error ---------------------------------- DUMMY.sam:2:33-2:36

Cannot access member of `Test` at index 1.

  2| let _ = (t: Test) -> if let [_, bar] = t then 1 else 2;
                                     ^^^


Error ---------------------------------- DUMMY.sam:4:37-4:38

Cannot access member of `Test2` at index 1.

  4| let _ = (t: Test2) -> if let Foo(_, _) = t then 1 else 2;
                                         ^


Error ---------------------------------- DUMMY.sam:5:30-5:36

Cannot find member `Foo111` on `Test2`.

  5| let _ = (t: Test2) -> if let Foo111(_) = t then 1 else 2;
                                  ^^^^^^


Found 5 errors.
"#,
      "Test2",
      false,
    );
    assert_errors(
      heap,
      "match (3) { Foo(_) -> 1, Bar(s) -> 2 }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:13-1:16

Cannot find member `Foo` on `int`.

  1| match (3) { Foo(_) -> 1, Bar(s) -> 2 }
                 ^^^


Error ---------------------------------- DUMMY.sam:1:26-1:29

Cannot find member `Bar` on `int`.

  1| match (3) { Foo(_) -> 1, Bar(s) -> 2 }
                              ^^^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "match (Test.init(true, 3)) { Foo(_) -> 1, Bar(s) -> 2, }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:30-1:33

Cannot find member `Foo` on `Test`.

  1| match (Test.init(true, 3)) { Foo(_) -> 1, Bar(s) -> 2, }
                                  ^^^


Error ---------------------------------- DUMMY.sam:1:43-1:46

Cannot find member `Bar` on `Test`.

  1| match (Test.init(true, 3)) { Foo(_) -> 1, Bar(s) -> 2, }
                                               ^^^


Found 2 errors.
"#,
    );
    assert_errors_full_customization(
      heap,
      "{ let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Baz(s) -> 2, }; }",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:25-1:64

The match is not exhausive. The following variants have not been handled:
- `Bar`

  1| { let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Baz(s) -> 2, }; }
                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ---------------------------------- DUMMY.sam:1:50-1:53

Cannot find member `Baz` on `Test2`.

  1| { let _ = (t: Test2) -> match (t) { Foo(_) -> 1, Baz(s) -> 2, }; }
                                                      ^^^


Found 2 errors.
"#,
      "Test2",
      false,
    );
  }

  #[test]
  fn lambdas_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(
      heap,
      "{let _ = (a: (int) -> bool, b: int, c: int) -> if a(b + 1) then b else c;}",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "(a) -> a",
      &builder.fun_type(vec![builder.int_type()], builder.int_type()),
    );
    assert_checks(
      heap,
      "(a) -> (b) -> a + b",
      &builder.fun_type(
        vec![builder.int_type()],
        builder.fun_type(vec![builder.int_type()], builder.int_type()),
      ),
    );

    assert_errors(
      heap,
      "(a) -> a",
      &builder.fun_type(vec![], builder.int_type()),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:9

`(any) -> any` is incompatible with `() -> int`.
- Function parameter arity of 1 is incompatible with function parameter arity of 0.

  1| (a) -> a
     ^^^^^^^^


Error ------------------------------------ DUMMY.sam:1:2-1:3

There is not enough context information to decide the type of this expression.

  1| (a) -> a
      ^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "(a) -> a",
      &builder.int_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:1-1:9

`(any) -> any` [1] is incompatible with `int` .

  1| (a) -> a
     ^^^^^^^^

  [1] DUMMY.sam:1:1-1:9
  ---------------------
  1| (a) -> a
     ^^^^^^^^


Error ------------------------------------ DUMMY.sam:1:2-1:3

There is not enough context information to decide the type of this expression.

  1| (a) -> a
      ^


Found 2 errors.
"#,
    );
  }

  #[test]
  fn blocks_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_errors_full_customization(
      heap,
      "{let {a, b as c} = A.init();}",
      &builder.unit_type(),
      "",
      "A",
      false,
    );
    assert_checks(heap, "{let a = 1;}", &builder.unit_type());
    assert_checks(heap, "{let a = 1; let b = true;}", &builder.unit_type());
    assert_checks(heap, "{let a = 1; a}", &builder.int_type());
    assert_checks(heap, "{1}", &builder.int_type());
    assert_checks(heap, "{}", &builder.unit_type());
    assert_checks(heap, "{{{{}}}}", &builder.unit_type());

    assert_errors(
      heap,
      "{let [a, b, c] = A.init();}",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:10-1:11

Cannot access member of `A` at index 1.

  1| {let [a, b, c] = A.init();}
              ^


Error ---------------------------------- DUMMY.sam:1:13-1:14

Cannot access member of `A` at index 2.

  1| {let [a, b, c] = A.init();}
                 ^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "{let {a, b as c} = A.init();}",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:10-1:11

Cannot find member `b` on `A`.

  1| {let {a, b as c} = A.init();}
              ^


Found 1 error.
"#,
    );
    assert_errors(
      heap,
      "{let {a, b as c} = C.init();}",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:7-1:8

Cannot find member `a` on `C`.

  1| {let {a, b as c} = C.init();}
           ^


Error ---------------------------------- DUMMY.sam:1:10-1:11

Cannot find member `b` on `C`.

  1| {let {a, b as c} = C.init();}
              ^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "{let {a, b as c} = 1;}",
      &builder.unit_type(),
      r#"
Error ------------------------------------ DUMMY.sam:1:7-1:8

Cannot find member `a` on `int`.

  1| {let {a, b as c} = 1;}
           ^


Error ---------------------------------- DUMMY.sam:1:10-1:11

Cannot find member `b` on `int`.

  1| {let {a, b as c} = 1;}
              ^


Found 2 errors.
"#,
    );
    assert_errors(
      heap,
      "{let {a, d as c} = A.init();}",
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:1:10-1:11

Cannot find member `d` on `A`.

  1| {let {a, d as c} = A.init();}
              ^


Found 1 error.
"#,
    );
  }

  #[test]
  fn function_call_integration_test() {
    let builder = test_type_builder::create();

    assert_errors(
      &mut Heap::new(),
      r#"{
  let _ = (() -> true)(1);
  let _: Str = Test.generic1(
    (() -> 0)(),
    {true},
    match (Test2.Foo(false)) { Foo(_, _) -> false, Bar(_) -> false, }
  );
  let _ = Test.generic1(0, if true then true else false, false);
  let _ = Test.generic2((a: int) -> 1, 1);
  let _ = Test.generic2((a) -> 1, 1);
  let _ = Test.generic3((a: int) -> 1);
  let _ = Test.generic3(match (Test2.Foo(false)) { Foo(_) -> (a) -> 1, Bar(_) -> (a) -> 1, });
  let _ = Test.generic4((a: int, b) -> 1);
}
"#,
      &builder.unit_type(),
      r#"
Error ---------------------------------- DUMMY.sam:2:12-2:26

Function parameter arity of 1 is incompatible with function parameter arity of 0.

  2|   let _ = (() -> true)(1);
                ^^^^^^^^^^^^^^


Error ---------------------------------- DUMMY.sam:6:32-6:51

Data variable arity of 2 is incompatible with data variable arity of 1.

  6|     match (Test2.Foo(false)) { Foo(_, _) -> false, Bar(_) -> false, }
                                    ^^^^^^^^^^^^^^^^^^^


Error ---------------------------------- DUMMY.sam:8:11-8:64

There is not enough context information to decide the type of this expression.

  8|   let _ = Test.generic1(0, if true then true else false, false);
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error -------------------------------- DUMMY.sam:12:63-12:64

There is not enough context information to decide the type of this expression.

  12|   let _ = Test.generic3(match (Test2.Foo(false)) { Foo(_) -> (a) -> 1, Bar(_) -> (a) -> 1, });
                                                                    ^


Error -------------------------------- DUMMY.sam:12:83-12:84

There is not enough context information to decide the type of this expression.

  12|   let _ = Test.generic3(match (Test2.Foo(false)) { Foo(_) -> (a) -> 1, Bar(_) -> (a) -> 1, });
                                                                                        ^


Found 5 errors.
  "#,
    );
  }

  #[test]
  fn checker_simple_integration_test() {
    let builder = test_type_builder::create();

    assert_checks(
      &mut Heap::new(),
      r#"{
  let f = (a: int, b: int, c: int) -> {
    let f = (d: int, e: int) -> a + b + c + d + e;
    f(1, 2)
  };
  let _ = (b: bool, t: int, f: int) -> if b then t else f;
  f(3, 4, 5)
}
"#,
      &builder.int_type(),
    );
  }

  fn assert_module_errors(sources: Vec<(&'static str, &str)>, expected_errors: &str) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut string_sources = HashMap::new();
    let mut unchecked_sources = HashMap::new();
    for (mod_ref_str, source) in sources {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![mod_ref_str.to_string()]);
      let parsed = parse_source_module_from_text(source, mod_ref, &mut heap, &mut error_set);
      string_sources.insert(mod_ref, source.to_string());
      unchecked_sources.insert(mod_ref, parsed);
    }
    type_check_sources(&unchecked_sources, &mut error_set);
    assert_eq!(
      expected_errors.trim(),
      error_set.pretty_print_error_messages(&heap, &string_sources).trim()
    );
  }

  #[test]
  fn type_checker_smoke_test_passing() {
    let source_a = r#"class A { function a(): int = 42 }"#;
    let source_b = r#"import { A } from A
  class B(val value: int) {
    function of(): B = B.init(A.a())
    method intValue(): int = this.value
  }"#;
    let source_c = r#"import { B } from B
  class C(Int(int), Boo(B)) {
    function ofInt(value: int): C = C.Int(value)
    function ofB(b: B): C = C.Boo(b)
    method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
  }"#;
    let source_d = r#"import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c2: C): bool = c1.intValue() == c2.intValue() }
  class Main { function main(): bool = IdentifyChecker.equals(C.ofInt(A.a()), C.ofB(B.of())) }"#;

    assert_module_errors(
      vec![("A", source_a), ("B", source_b), ("C", source_c), ("D", source_d)],
      "",
    );
  }

  #[test]
  fn type_checker_smoke_test_failing() {
    let source_a = r#"import { Z } from K
    import { C } from B
    class A {
      function a(): int = 42 function a(): int = 42 }
    "#;
    let source_b = r#"import { A } from A
  class B<A, A>(val value: int) {
    function of(): B<int, bool> = B.init(A.a())
    method intValue(): int = this.value
  }"#;
    let source_c = r#"import { B } from B
  class C(Int(int), Int(bool), Boo(B)) {
    function ofInt(value: int): C = C.Int(value)
    function <T, F, T>ofB(b: B): C = C.Boo(b)
    method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
  }"#;
    let source_d = r#"import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
  class Main { function main(): bool = true }
  class Useless {
    function main(): unit = {
      let _ = (foo: Useless) -> {};
    }
  }
  interface Bar {}
  class Foo : Bar {}"#;

    assert_module_errors(
      vec![("A", source_a), ("B", source_b), ("C", source_c), ("D", source_d)],
      r#"
Error --------------------------------------- A.sam:1:1-1:20

Module `K` is not resolved.

  1| import { Z } from K
     ^^^^^^^^^^^^^^^^^^^


Error -------------------------------------- A.sam:2:14-2:15

There is no `C` export in `B`.

  2|     import { C } from B
                  ^


Error -------------------------------------- A.sam:4:39-4:40

Name `a` collides with a previously defined name at [1].

  4|       function a(): int = 42 function a(): int = 42 }
                                           ^

  [1] A.sam:4:16-4:17
  -------------------
  4|       function a(): int = 42 function a(): int = 42 }
                    ^


Error -------------------------------------- B.sam:2:11-2:12

Name `A` collides with a previously defined name at [1].

  2|   class B<A, A>(val value: int) {
               ^

  [1] B.sam:1:10-1:11
  -------------------
  1| import { A } from A
              ^


Error -------------------------------------- B.sam:2:14-2:15

Name `A` collides with a previously defined name at [1].

  2|   class B<A, A>(val value: int) {
                  ^

  [1] B.sam:1:10-1:11
  -------------------
  1| import { A } from A
              ^


Error -------------------------------------- B.sam:3:35-3:48

`B<int, int>` is incompatible with `B<int, bool>`.
- `int` [1] is incompatible with `bool` [2].

  3|     function of(): B<int, bool> = B.init(A.a())
                                       ^^^^^^^^^^^^^

  [1] B.sam:3:22-3:25
  -------------------
  3|     function of(): B<int, bool> = B.init(A.a())
                          ^^^

  [2] B.sam:3:27-3:31
  -------------------
  3|     function of(): B<int, bool> = B.init(A.a())
                               ^^^^


Error -------------------------------------- C.sam:2:21-2:24

Name `Int` collides with a previously defined name at [1].

  2|   class C(Int(int), Int(bool), Boo(B)) {
                         ^^^

  [1] C.sam:2:11-2:14
  -------------------
  2|   class C(Int(int), Int(bool), Boo(B)) {
               ^^^


Error -------------------------------------- C.sam:2:36-2:37

Type argument arity of 0 is incompatible with type argument arity of 2.

  2|   class C(Int(int), Int(bool), Boo(B)) {
                                        ^


Error -------------------------------------- C.sam:3:43-3:48

`int` [1] is incompatible with `bool` [2].

  3|     function ofInt(value: int): C = C.Int(value)
                                               ^^^^^

  [1] C.sam:3:43-3:48
  -------------------
  3|     function ofInt(value: int): C = C.Int(value)
                                               ^^^^^

  [2] C.sam:2:25-2:29
  -------------------
  2|   class C(Int(int), Int(bool), Boo(B)) {
                             ^^^^


Error -------------------------------------- C.sam:4:21-4:22

Name `T` collides with a previously defined name at [1].

  4|     function <T, F, T>ofB(b: B): C = C.Boo(b)
                         ^

  [1] C.sam:4:15-4:16
  -------------------
  4|     function <T, F, T>ofB(b: B): C = C.Boo(b)
                   ^


Error -------------------------------------- C.sam:4:30-4:31

Type argument arity of 0 is incompatible with type argument arity of 2.

  4|     function <T, F, T>ofB(b: B): C = C.Boo(b)
                                  ^


Error -------------------------------------- C.sam:5:30-5:83

`bool` [1] is incompatible with `int` [2].

  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [1] C.sam:5:30-5:83
  -------------------
  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

  [2] C.sam:5:24-5:27
  -------------------
  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                            ^^^


Error -------------------------------------- C.sam:5:58-5:81

`int` [1] is incompatible with `bool` [2].

  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                                                              ^^^^^^^^^^^^^^^^^^^^^^^

  [1] C.sam:5:68-5:80
  -------------------
  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                                                                        ^^^^^^^^^^^^

  [2] C.sam:5:55-5:56
  -------------------
  5|     method intValue(): int = match (this) { Int(v) -> v, Boo(b) -> b.intValue(), }
                                                           ^


Error -------------------------------------- D.sam:5:50-5:52

Name `c1` collides with a previously defined name at [1].

  5|   class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
                                                      ^^

  [1] D.sam:5:43-5:45
  -------------------
  5|   class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
                                               ^^


Found 14 errors.
"#,
    );
  }

  #[test]
  fn type_checker_interface_conformance_tests() {
    let source = r#"
interface Foo {}
class A : Foo {} // OK
interface Bar {
  function a(): unit
  method b(): Str
}
class B : Bar {} // Error
class C : Bar {
  function a(): Str = ""
  method b(): unit = {} // error
}
class D : Bar {
  function b(): Str = "" // error
  method a(): unit = {} // error
}
interface Base<TA, TB> {
  method <TC> m1(a: TA, b: TB): TC
}
interface Baz1<TA, TB> : Base<int, TB> {
  method <TA1, TB1, TC> f1(a: TA1, b: TB1): TC
}
interface Baz2<TA, TB> : Baz1<TA, int> {
  method <TC> m2(a: TA, b: TB): TC
}
class E : Baz2<Str, bool> { // all good
  method <TC> m1(a: int, b: int): TC = Process.panic("")
  method <TA1, TB1, TC> f1(a: TA1, b: TB1): TC = Process.panic("")
  method <TC> m2(a: Str, b: bool): TC = Process.panic("")
}
class F : Baz2<Str, bool> {
  private method <TC> m1(a: Str, b: Str): TC = Process.panic("") // error
  method <TA1, TB1, TC> f1(a: Str, b: Str): TC = Process.panic("") // error
  method <TC> m2(a: Str, b: Str): TC = Process.panic("") // error
}
interface G : Baz2<Str, bool> {
  method <TD> m1(a: int, b: int): TD // tparam name mismatch
  method <TA1: TA, TB1, TC> f1(a: TA1, b: TB1): TC // has bound mismatch
  method <TE: Foo> unrelated(): unit
}
interface H : G {
  method <TE> unrelated(): unit
}
interface J : G {
  method unrelated(): unit
}
interface K : G {
  method <TE: Bar> unrelated(): unit
}
interface WithBound { method <T: T> f(): int }
interface WithBound2 : WithBound { method <T: T> f(): int }
class Z<T: Foo> : DumDum {} // error
interface Cyclic1 : Cyclic2 {} // error: cyclic
interface Cyclic2 : Cyclic3 {} // error: cyclic
interface Cyclic3 : Cyclic1 {} // error: cyclic
interface Cyclic4 : Cyclic4 {} // error: cyclic
"#;

    let expected_errors = r#"
Error --------------------------------------- A.sam:5:3-5:21

Function declarations are not allowed in interfaces.

  5|   function a(): unit
       ^^^^^^^^^^^^^^^^^^


Error ---------------------------------------- A.sam:8:7-8:8

The following members must be implemented for the class:
- `b`

  8| class B : Bar {} // Error
           ^


Error ------------------------------------ A.sam:11:11-11:19

`() -> unit` [1] is incompatible with `() -> Str` [2].

  11|   method b(): unit = {} // error
                ^^^^^^^^

  [1] A.sam:11:11-11:19
  ---------------------
  11|   method b(): unit = {} // error
                ^^^^^^^^

  [2] A.sam:6:11-6:18
  -------------------
  6|   method b(): Str
               ^^^^^^^


Error -------------------------------------- A.sam:13:7-13:8

The following members must be implemented for the class:
- `b`

  13| class D : Bar {
            ^


Error ------------------------------------ A.sam:32:11-32:65

`private member` is incompatible with `public member`.

  32|   private method <TC> m1(a: Str, b: Str): TC = Process.panic("") // error
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:32:25-32:45

`(Str, Str) -> TC` [1] is incompatible with `(int, int) -> TC` [2].

  32|   private method <TC> m1(a: Str, b: Str): TC = Process.panic("") // error
                              ^^^^^^^^^^^^^^^^^^^^

  [1] A.sam:32:25-32:45
  ---------------------
  32|   private method <TC> m1(a: Str, b: Str): TC = Process.panic("") // error
                              ^^^^^^^^^^^^^^^^^^^^

  [2] A.sam:18:17-18:35
  ---------------------
  18|   method <TC> m1(a: TA, b: TB): TC
                      ^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:33:27-33:47

`(Str, Str) -> TC` [1] is incompatible with `(TA1, TB1) -> TC` [2].

  33|   method <TA1, TB1, TC> f1(a: Str, b: Str): TC = Process.panic("") // error
                                ^^^^^^^^^^^^^^^^^^^^

  [1] A.sam:33:27-33:47
  ---------------------
  33|   method <TA1, TB1, TC> f1(a: Str, b: Str): TC = Process.panic("") // error
                                ^^^^^^^^^^^^^^^^^^^^

  [2] A.sam:21:27-21:47
  ---------------------
  21|   method <TA1, TB1, TC> f1(a: TA1, b: TB1): TC
                                ^^^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:34:17-34:37

`(Str, Str) -> TC` [1] is incompatible with `(Str, bool) -> TC` [2].

  34|   method <TC> m2(a: Str, b: Str): TC = Process.panic("") // error
                      ^^^^^^^^^^^^^^^^^^^^

  [1] A.sam:34:17-34:37
  ---------------------
  34|   method <TC> m2(a: Str, b: Str): TC = Process.panic("") // error
                      ^^^^^^^^^^^^^^^^^^^^

  [2] A.sam:24:17-24:35
  ---------------------
  24|   method <TC> m2(a: TA, b: TB): TC
                      ^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:37:17-37:37

Type parameter name mismatch. Expected exact match of `<TC>`.

  37|   method <TD> m1(a: int, b: int): TD // tparam name mismatch
                      ^^^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:38:16-38:18

Name `TA` is not resolved.

  38|   method <TA1: TA, TB1, TC> f1(a: TA1, b: TB1): TC // has bound mismatch
                     ^^


Error ------------------------------------ A.sam:38:31-38:51

Type parameter name mismatch. Expected exact match of `<TA1, TB1, TC>`.

  38|   method <TA1: TA, TB1, TC> f1(a: TA1, b: TB1): TC // has bound mismatch
                                    ^^^^^^^^^^^^^^^^^^^^


Error ------------------------------------ A.sam:42:24-42:32

Type parameter name mismatch. Expected exact match of `<TE : Foo>`.

  42|   method <TE> unrelated(): unit
                             ^^^^^^^^


Error ------------------------------------ A.sam:45:19-45:27

Type parameter arity of 0 is incompatible with type parameter arity of 1.

  45|   method unrelated(): unit
                        ^^^^^^^^


Error ------------------------------------ A.sam:48:29-48:37

Type parameter name mismatch. Expected exact match of `<TE : Foo>`.

  48|   method <TE: Bar> unrelated(): unit
                                  ^^^^^^^^


Error ------------------------------------ A.sam:50:34-50:35

Name `T` is not resolved.

  50| interface WithBound { method <T: T> f(): int }
                                       ^


Error ------------------------------------ A.sam:51:47-51:48

Name `T` is not resolved.

  51| interface WithBound2 : WithBound { method <T: T> f(): int }
                                                    ^


Error ------------------------------------ A.sam:52:19-52:25

Name `DumDum` is not resolved.

  52| class Z<T: Foo> : DumDum {} // error
                        ^^^^^^


Error ------------------------------------ A.sam:53:11-53:18

Type `Cyclic1` has a cyclic definition.

  53| interface Cyclic1 : Cyclic2 {} // error: cyclic
                ^^^^^^^


Error ------------------------------------ A.sam:54:11-54:18

Type `Cyclic2` has a cyclic definition.

  54| interface Cyclic2 : Cyclic3 {} // error: cyclic
                ^^^^^^^


Error ------------------------------------ A.sam:55:11-55:18

Type `Cyclic3` has a cyclic definition.

  55| interface Cyclic3 : Cyclic1 {} // error: cyclic
                ^^^^^^^


Error ------------------------------------ A.sam:56:11-56:18

Type `Cyclic4` has a cyclic definition.

  56| interface Cyclic4 : Cyclic4 {} // error: cyclic
                ^^^^^^^


Found 21 errors.
"#;
    assert_module_errors(vec![("A", source)], expected_errors);
  }

  #[test]
  fn bounded_generics_tests() {
    let source = r#"
interface Comparable<T> {
  method compare(other: T): int
}
class BoxedInt(val i: int): Comparable<BoxedInt> {
  method compare(other: BoxedInt): int = this.i - other.i
}
class TwoItemCompare {
  function <C: Comparable<C>> compare(v1: C, v2: C): int =
    v1.compare(v2)
}
class Pair<T: Comparable<T>>(val v1: T, val v2: T) {
  method relation1(): int = TwoItemCompare.compare(this.v1, this.v2)
  method relation2(): int = TwoItemCompare.compare<T>(this.v1, this.v2)
  method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
}
class TestLimitedSubtyping {
  function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
  function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
}
interface Conflicting1 {
  method foo(): int
}
interface Conflicting2 {
  method foo(): bool
}
interface ExtendingConfliting : Conflicting1, Conflicting2 // no error, we only complain if it's used by classes
class ImplItself : ImplItself {} // error: expect interface type
class ImplTArg<T> : T {} // error: T not resolved
class NoBoundMethodCall {
  function <T> foo(t: T): unit = t.bar()
}
    "#;
    let expected_errors = r#"
Error --------------------- bounded-generics.sam:15:52-15:55

`int` is not a subtype of `Comparable<int>`.

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:15:57-15:64

`T` [1] is incompatible with `int` [2].

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                              ^^^^^^^

  [1] bounded-generics.sam:15:57-15:64
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                              ^^^^^^^

  [2] bounded-generics.sam:15:52-15:55
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:15:66-15:73

`T` [1] is incompatible with `int` [2].

  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                                       ^^^^^^^

  [1] bounded-generics.sam:15:66-15:73
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                                       ^^^^^^^

  [2] bounded-generics.sam:15:52-15:55
  ------------------------------------
  15|   method relation3(): int = TwoItemCompare.compare<int>(this.v1, this.v2) // error typearg
                                                         ^^^


Error --------------------- bounded-generics.sam:18:20-18:40

`Comparable<BoxedInt>` is incompatible with `non-abstract type`.

  18|   function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
                         ^^^^^^^^^^^^^^^^^^^^


Error --------------------- bounded-generics.sam:19:53-19:69

`BoxedInt` [1] is incompatible with `Comparable<BoxedInt>` [2].

  19|   function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
                                                          ^^^^^^^^^^^^^^^^

  [1] bounded-generics.sam:19:53-19:69
  ------------------------------------
  19|   function main(): unit = TestLimitedSubtyping.test(BoxedInt.init(1)) // error subtyping
                                                          ^^^^^^^^^^^^^^^^

  [2] bounded-generics.sam:18:20-18:40
  ------------------------------------
  18|   function test(v: Comparable<BoxedInt>): unit = {} // error signature validation
                         ^^^^^^^^^^^^^^^^^^^^


Error ---------------------- bounded-generics.sam:28:7-28:17

Type `ImplItself` has a cyclic definition.

  28| class ImplItself : ImplItself {} // error: expect interface type
            ^^^^^^^^^^


Error --------------------- bounded-generics.sam:28:20-28:30

`class type` is incompatible with `interface type`.

  28| class ImplItself : ImplItself {} // error: expect interface type
                         ^^^^^^^^^^


Error --------------------- bounded-generics.sam:29:21-29:22

Name `T` is not resolved.

  29| class ImplTArg<T> : T {} // error: T not resolved
                          ^


Error --------------------- bounded-generics.sam:31:34-31:35

`T` is incompatible with `nominal type`.

  31|   function <T> foo(t: T): unit = t.bar()
                                       ^


Found 9 errors.
"#;
    assert_module_errors(vec![("bounded-generics", source)], expected_errors);
  }

  #[test]
  fn type_checker_identifier_resolution_tests() {
    let source_a = r#"class SameName(val a: int) {
    function create(): SameName = SameName.init(0)
  }"#;
    let source_b = r#"import { SameName } from A
  class Producer {
    function produce(): SameName = SameName.create()
  }"#;
    let source_c = r#"import { Producer } from B

  class SameName(val b: int) {
    // Here, Producer.produce() produces a SameName class from module a, so the field a should exist.
    function create(): SameName = SameName.init(Producer.produce().a)
  }"#;

    assert_module_errors(vec![("A", source_a), ("B", source_b), ("C", source_c)], "");
  }
}
