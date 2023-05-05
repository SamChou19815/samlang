#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, Id, Literal, NO_COMMENT_REFERENCE},
      Location, Reason,
    },
    checker::{
      main_checker::type_check_expression,
      ssa_analysis::{perform_ssa_analysis_on_expression, SsaAnalysisResult},
      type_::{
        create_builtin_module_signature, test_type_builder, FunctionType, GlobalSignature,
        InterfaceSignature, MemberSignature, ModuleSignature, Type, TypeDefinitionSignature,
        TypeParameterSignature,
      },
      type_check_sources,
      typing_context::{LocalTypingContext, TypingContext},
    },
    common::{Heap, ModuleReference},
    errors::ErrorSet,
    parser::{parse_source_expression_from_text, parse_source_module_from_text},
  };
  use pretty_assertions::assert_eq;
  use std::collections::{HashMap, HashSet};

  #[test]
  #[should_panic]
  fn boilterplate() {
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
    let global_cx = sandbox_global_cx(&mut heap);
    let test_str = heap.alloc_str_for_test("Test");
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      test_str,
      /* availableTypeParameters */ vec![],
    );

    type_check_expression(
      &mut cx,
      &heap,
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

  fn sandbox_global_cx(heap: &mut Heap) -> GlobalSignature {
    let builder = test_type_builder::create();

    HashMap::from([
      (ModuleReference::root(), create_builtin_module_signature(heap)),
      (
        ModuleReference::dummy(),
        ModuleSignature {
          interfaces: HashMap::from([
            (
              heap.alloc_str_for_test("Test"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature {
                  is_object: true,
                  names: vec![
                    heap.alloc_str_for_test("foo"),
                    heap.alloc_str_for_test("bar"),
                    heap.alloc_str_for_test("fff"),
                  ],
                  mappings: HashMap::from([
                    (heap.alloc_str_for_test("foo"), (builder.bool_type(), true)),
                    (heap.alloc_str_for_test("bar"), (builder.int_type(), false)),
                    (
                      heap.alloc_str_for_test("fff"),
                      (builder.fun_type(vec![], builder.string_type()), false),
                    ),
                  ]),
                }),
                functions: HashMap::from([
                  (
                    heap.alloc_str_for_test("init"),
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
                        name: heap.alloc_str_for_test("A"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(heap.alloc_str_for_test("A"))],
                        return_type: builder.unit_type(),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("generic1"),
                    MemberSignature {
                      is_public: false,
                      type_parameters: vec![
                        TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str_for_test("C"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str_for_test("D"), bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![
                          builder.generic_type(heap.alloc_str_for_test("A")),
                          builder.generic_type(heap.alloc_str_for_test("B")),
                          builder.generic_type(heap.alloc_str_for_test("C")),
                        ],
                        return_type: builder.generic_type(heap.alloc_str_for_test("D")),
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
                        TypeParameterSignature { name: heap.alloc_str_for_test("A"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str_for_test("B"), bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.fun_type(
                          vec![builder.generic_type(heap.alloc_str_for_test("A"))],
                          builder.generic_type(heap.alloc_str_for_test("B")),
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
                        name: heap.alloc_str_for_test("A"),
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
                        name: heap.alloc_str_for_test("A"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(heap.alloc_str_for_test("A"))],
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
                type_definition: Some(TypeDefinitionSignature {
                  is_object: false,
                  names: vec![heap.alloc_str_for_test("Foo"), heap.alloc_str_for_test("Bar")],
                  mappings: HashMap::from([
                    (heap.alloc_str_for_test("Foo"), (builder.bool_type(), true)),
                    (heap.alloc_str_for_test("Bar"), (builder.int_type(), true)),
                  ]),
                }),
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
                type_parameters: vec![TypeParameterSignature {
                  name: heap.alloc_str_for_test("E"),
                  bound: None,
                }],
                type_definition: Some(TypeDefinitionSignature {
                  is_object: true,
                  names: vec![heap.alloc_str_for_test("foo"), heap.alloc_str_for_test("bar")],
                  mappings: HashMap::from([
                    (
                      heap.alloc_str_for_test("foo"),
                      (builder.generic_type(heap.alloc_str_for_test("E")), true),
                    ),
                    (heap.alloc_str_for_test("bar"), (builder.int_type(), false)),
                  ]),
                }),
                functions: HashMap::new(),
                methods: HashMap::new(),
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("Test4"),
              InterfaceSignature {
                type_parameters: vec![TypeParameterSignature {
                  name: heap.alloc_str_for_test("E"),
                  bound: None,
                }],
                type_definition: Some(TypeDefinitionSignature {
                  is_object: false,
                  names: vec![heap.alloc_str_for_test("Foo"), heap.alloc_str_for_test("Bar")],
                  mappings: HashMap::from([
                    (
                      heap.alloc_str_for_test("Foo"),
                      (builder.generic_type(heap.alloc_str_for_test("E")), true),
                    ),
                    (heap.alloc_str_for_test("Bar"), (builder.int_type(), true)),
                  ]),
                }),
                functions: HashMap::from([
                  (
                    heap.alloc_str_for_test("Foo"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str_for_test("E"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.generic_type(heap.alloc_str_for_test("E"))],
                        return_type: builder.general_nominal_type(
                          heap.alloc_str_for_test("Test4"),
                          vec![builder.generic_type(heap.alloc_str_for_test("E"))],
                        ),
                      },
                    },
                  ),
                  (
                    heap.alloc_str_for_test("Bar"),
                    MemberSignature {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str_for_test("E"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.general_nominal_type(
                          heap.alloc_str_for_test("Test4"),
                          vec![builder.generic_type(heap.alloc_str_for_test("E"))],
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
              heap.alloc_str_for_test("A"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature {
                  is_object: true,
                  names: vec![heap.alloc_str_for_test("a"), heap.alloc_str_for_test("b")],
                  mappings: HashMap::from([
                    (heap.alloc_str_for_test("a"), (builder.int_type(), true)),
                    (heap.alloc_str_for_test("b"), (builder.bool_type(), false)),
                  ]),
                }),
                functions: HashMap::from([(
                  heap.alloc_str_for_test("init"),
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(heap.alloc_str_for_test("A")),
                    },
                  },
                )]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("B"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature {
                  is_object: true,
                  names: vec![heap.alloc_str_for_test("a"), heap.alloc_str_for_test("b")],
                  mappings: HashMap::from([
                    (heap.alloc_str_for_test("a"), (builder.int_type(), true)),
                    (heap.alloc_str_for_test("b"), (builder.bool_type(), false)),
                  ]),
                }),
                functions: HashMap::from([(
                  heap.alloc_str_for_test("init"),
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(heap.alloc_str_for_test("B")),
                    },
                  },
                )]),
                methods: HashMap::new(),
                type_parameters: vec![],
                super_types: vec![],
              },
            ),
            (
              heap.alloc_str_for_test("C"),
              InterfaceSignature {
                type_definition: Some(TypeDefinitionSignature {
                  is_object: false,
                  names: vec![heap.alloc_str_for_test("a"), heap.alloc_str_for_test("b")],
                  mappings: HashMap::from([
                    (heap.alloc_str_for_test("a"), (builder.int_type(), true)),
                    (heap.alloc_str_for_test("b"), (builder.bool_type(), true)),
                  ]),
                }),
                functions: HashMap::from([(
                  heap.alloc_str_for_test("init"),
                  MemberSignature {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_nominal_type(heap.alloc_str_for_test("C")),
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
    ])
  }

  fn type_check_expr_in_sandbox(
    heap: &mut Heap,
    source: &str,
    expected_type: &Type,
    current_class: &'static str,
  ) -> Vec<String> {
    let mut error_set = ErrorSet::new();

    let (_, parsed) =
      parse_source_expression_from_text(source, ModuleReference::dummy(), heap, &mut error_set);
    assert_eq!(Vec::<String>::new(), error_set.error_messages(heap));

    let mut temp_ssa_error_set = ErrorSet::new();
    let global_cx = sandbox_global_cx(heap);
    let mut local_cx =
      LocalTypingContext::new(perform_ssa_analysis_on_expression(&parsed, &mut temp_ssa_error_set));
    let current_class = heap.alloc_str_for_test(current_class);
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      current_class,
      /* availableTypeParameters */ vec![],
    );

    type_check_expression(&mut cx, heap, &parsed, Some(expected_type));
    error_set.error_messages(heap)
  }

  fn assert_errors_with_class(
    heap: &mut Heap,
    source: &str,
    expected_type: &Type,
    expected_errors: Vec<&str>,
    current_class: &'static str,
  ) {
    assert_eq!(
      expected_errors,
      type_check_expr_in_sandbox(heap, source, expected_type, current_class)
    );
  }

  fn assert_errors(
    heap: &mut Heap,
    source: &str,
    expected_type: &Type,
    expected_errors: Vec<&str>,
  ) {
    assert_errors_with_class(heap, source, expected_type, expected_errors, "Test");
  }

  fn assert_checks(heap: &mut Heap, source: &str, expected_type: &Type) {
    assert_errors_with_class(heap, source, expected_type, vec![], "Test");
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
      vec!["__DUMMY__.sam:1:1-1:5: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "42",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:3: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "\"a\"",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:4: [incompatible-type]: Expected: `unit`, actual: `string`."],
    );

    assert_checks(heap, "this", &builder.int_type());
    assert_checks(heap, "{ val foo = 3; foo }", &builder.int_type());
    assert_errors(
      heap,
      "{ val foo = true; foo }",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:19-1:22: [incompatible-type]: Expected: `int`, actual: `bool`."],
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
      vec![
        "__DUMMY__.sam:1:1-1:19: [invalid-arity]: Incorrect type arguments size. Expected: 0, actual: 1.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:34: [incompatible-type]: Expected: `(string, string) -> unit`, actual: `(any) -> unit`.",
        "__DUMMY__.sam:1:1-1:34: [invalid-arity]: Incorrect parameter size. Expected: 2, actual: 1.",
        "__DUMMY__.sam:1:1-1:34: [underconstrained]: There is not enough context information to decide the type of this expression.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.string_type(),
      vec![
        "__DUMMY__.sam:1:1-1:34: [incompatible-type]: Expected: `string`, actual: `(any) -> unit`.",
        "__DUMMY__.sam:1:1-1:34: [incompatible-type]: Expected: `string`, actual: `function`.",
        "__DUMMY__.sam:1:1-1:34: [underconstrained]: There is not enough context information to decide the type of this expression.",
      ]
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<int, string>",
      &builder.fun_type(vec![builder.int_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:47: [invalid-arity]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<string>",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:42: [incompatible-type]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorld2",
      &builder.fun_type(vec![builder.string_type()], builder.unit_type()),
      vec!["__DUMMY__.sam:1:6-1:17: [member-missing]: Cannot find member `helloWorld2` on `Test`."],
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
      "{ val foo=true; Test.init(foo, 3) }",
      &builder.simple_nominal_type(test_str),
    );
    assert_errors_with_class(
      heap,
      "Test2.Foo(true)",
      &builder.simple_nominal_type(test2_str),
      vec![],
      "Test2",
    );
    assert_errors_with_class(
      heap,
      "Test2.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      vec![],
      "Test2",
    );
    assert_errors_with_class(
      heap,
      "Test4.Foo(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      vec![],
      "Test4",
    );
    assert_errors_with_class(
      heap,
      "Test4.Foo<bool>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      vec![],
      "Test4",
    );

    assert_errors(
      heap,
      "Test.Foo(true)",
      &builder.simple_nominal_type(test2_str),
      vec!["__DUMMY__.sam:1:6-1:9: [member-missing]: Cannot find member `Foo` on `Test`."],
    );
    assert_errors(
      heap,
      "Test.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      vec!["__DUMMY__.sam:1:6-1:9: [member-missing]: Cannot find member `Bar` on `Test`."],
    );
    assert_errors(heap,
      "Test4.Foo<int, bool>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      vec![
        "__DUMMY__.sam:1:1-1:21: [invalid-arity]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.int_type()]),
      vec!["__DUMMY__.sam:1:16-1:20: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_nominal_type(test4_str, vec![builder.bool_type()]),
      vec![
        "__DUMMY__.sam:1:1-1:21: [incompatible-type]: Expected: `Test4<bool>`, actual: `Test4<int>`.",
        "__DUMMY__.sam:1:16-1:20: [incompatible-type]: Expected: `int`, actual: `bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test44.Bar(42)",
      &builder.simple_nominal_type(test2_str),
      vec!["__DUMMY__.sam:1:1-1:7: [cannot-resolve-class]: Class `Test44` is not resolved."],
    );
    assert_errors_with_class(
      heap,
      "Test2.Tars(42)",
      &builder.simple_nominal_type(test2_str),
      vec!["__DUMMY__.sam:1:7-1:11: [member-missing]: Cannot find member `Tars` on `Test2`."],
      "Test2",
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
      vec!["__DUMMY__.sam:1:1-1:2: [incompatible-type]: Expected: `nominal type`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazz",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:20-1:24: [member-missing]: Cannot find member `bazz` on `Test`."],
    );
    assert_errors(
      heap,
      "{ val _ = (t3: Test3<bool>) -> t3.bar; }",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:35-1:38: [member-missing]: Cannot find member `bar` on `Test3`."],
    );
    assert_errors_with_class(
      heap,
      "Test2.Foo(true).foo",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:17-1:20: [member-missing]: Cannot find member `foo` on `Test2`."],
      "Test2",
    );
    assert_errors(heap, "Test.init(true, 3).foo<int>", &builder.bool_type(), vec![
      "__DUMMY__.sam:1:1-1:28: [invalid-arity]: Incorrect type arguments size. Expected: 0, actual: 1.",
    ]);
    assert_errors(
      heap,
      "Test.init(true, 3).foo",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:23: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bar",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:23: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.int_type(),
      vec![
        "__DUMMY__.sam:1:1-1:23: [incompatible-type]: Expected: `int`, actual: `(int) -> bool`.",
      ],
    );
    assert_errors(heap,
      "Test.init(true, 3).baz<int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:28: [invalid-arity]: Incorrect type arguments size. Expected: 0, actual: 1.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.int_type(),
      vec![
        "__DUMMY__.sam:1:1-1:36: [incompatible-type]: Expected: `int`, actual: `(int) -> bool`.",
        "__DUMMY__.sam:1:1-1:36: [incompatible-type]: Expected: `int`, actual: `function`.",
        "__DUMMY__.sam:1:1-1:36: [underconstrained]: There is not enough context information to decide the type of this expression.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.fun_type(vec![builder.int_type(), builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:36: [incompatible-type]: Expected: `(int, int) -> bool`, actual: `(int) -> bool`.",
        "__DUMMY__.sam:1:1-1:36: [invalid-arity]: Incorrect parameter size. Expected: 2, actual: 1.",
        "__DUMMY__.sam:1:1-1:36: [underconstrained]: There is not enough context information to decide the type of this expression.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam<int, int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:46: [invalid-arity]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithUsefulTypeParam<bool>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:48: [incompatible-type]: Expected: `(int) -> bool`, actual: `(bool) -> bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.fun_type(vec![builder.bool_type()], builder.int_type()),
      vec![
        "__DUMMY__.sam:1:1-1:23: [incompatible-type]: Expected: `(bool) -> int`, actual: `(int) -> bool`.",
      ],
    );

    assert_errors(heap, "{ val _ = (t) -> t.foo; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [underconstrained]: There is not enough context information to decide the type of this expression.",
    ]);
    assert_errors(heap, "{ val _ = (t) -> t.bar; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [underconstrained]: There is not enough context information to decide the type of this expression.",
    ]);
    assert_errors(heap, "{ val _ = (t) -> t.baz; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [underconstrained]: There is not enough context information to decide the type of this expression.",
    ]);
  }

  #[test]
  fn function_call_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(heap, "Builtins.panic(\"\")", &builder.unit_type());
    assert_checks(heap, "Builtins.panic(\"\")", &builder.bool_type());
    assert_checks(heap, "Builtins.panic(\"\")", &builder.int_type());
    assert_checks(heap, "Builtins.panic(\"\")", &builder.string_type());
    assert_checks(
      heap,
      "Builtins.panic(\"\")",
      &builder.fun_type(vec![builder.int_type(), builder.bool_type()], builder.string_type()),
    );
    assert_checks(heap, "Test.helloWorld(\"\")", &builder.unit_type());
    assert_checks(heap, "Test.init(true, 3).fff()", &builder.string_type());
    assert_checks(heap, "((i: int) -> true)(3)", &builder.bool_type());

    assert_errors(
      heap,
      "Builtins.panic(3)",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:16-1:17: [incompatible-type]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "3(3)",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:5: [incompatible-type]: Expected: `function`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.helloWorld(3)",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:17-1:18: [incompatible-type]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).fff()",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:25: [incompatible-type]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "((i: int) -> true)({})",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:20-1:22: [incompatible-type]: Expected: `int`, actual: `unit`."],
    );
    assert_errors(
      heap,
      "Test.helloWorld(\"\")",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:20: [incompatible-type]: Expected: `bool`, actual: `unit`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz(3)",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:26: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "((i: int) -> true)(3)",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:2-1:22: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(heap, "Test.init(true, 3).bazWithTypeParam(1)", &builder.bool_type(), vec![
      "__DUMMY__.sam:1:1-1:39: [underconstrained]: There is not enough context information to decide the type of this expression."
    ]);
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
    assert_checks(heap, "{ val _ = (t: string, f: string) -> t == f; }", &builder.unit_type());

    assert_errors(
      heap,
      "-(false)",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:3-1:8: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "!1",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:2-1:3: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "-(1+1)",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "!true",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "!false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"1\" * \"1\"",
      &builder.int_type(),
      vec![
        "__DUMMY__.sam:1:1-1:4: [incompatible-type]: Expected: `int`, actual: `string`.",
        "__DUMMY__.sam:1:7-1:10: [incompatible-type]: Expected: `int`, actual: `string`.",
      ],
    );
    assert_errors(
      heap,
      "\"1\" - 1",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:4: [incompatible-type]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "1 % \"1\"",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:5-1:8: [incompatible-type]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "1 + false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:5-1:10: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false - 1",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"\" < false",
      &builder.bool_type(),
      vec![
        "__DUMMY__.sam:1:1-1:3: [incompatible-type]: Expected: `int`, actual: `string`.",
        "__DUMMY__.sam:1:6-1:11: [incompatible-type]: Expected: `int`, actual: `bool`.",
      ],
    );
    assert_errors(
      heap,
      "1 <= false",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:6-1:11: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 > \"\"",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:5-1:7: [incompatible-type]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "true >= 1",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:5: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false || 4",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:10-1:11: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "2 && 3",
      &builder.bool_type(),
      vec![
        "__DUMMY__.sam:1:1-1:2: [incompatible-type]: Expected: `bool`, actual: `int`.",
        "__DUMMY__.sam:1:6-1:7: [incompatible-type]: Expected: `bool`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "1 == false",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:6-1:11: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true == 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:9-1:10: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "true != 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:9-1:10: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "\"\" != 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:7-1:8: [incompatible-type]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "{ val _ = (t: int, f: bool) -> t == f; }",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:37-1:38: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 * 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 % 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 + 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 < 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 <= 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 > 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 >= 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true || false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false && true",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 == 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true == false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true != true",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:13: [incompatible-type]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"\" != \"3\"",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:10: [incompatible-type]: Expected: `unit`, actual: `bool`."],
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
      "{ val _ = (b: bool, t: int, f: int) -> if b then t else f; }",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "{ val _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(s) -> 2 }; }",
      &builder.unit_type(),
    );
    assert_errors_with_class(
      heap,
      "{ val _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(s) -> 2 }; }",
      &builder.unit_type(),
      vec![],
      "Test2",
    );
    assert_errors_with_class(
      heap,
      "{ val _ = (t: Test2) -> match (t) { Foo(_) -> 1, Bar(d) -> 2 }; }",
      &builder.unit_type(),
      vec![],
      "Test2",
    );

    assert_errors(
      heap,
      "if true then false else 1",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:25-1:26: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "if false then 1 else false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:22-1:27: [incompatible-type]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "if false then \"\" else 3",
      &builder.string_type(),
      vec!["__DUMMY__.sam:1:23-1:24: [incompatible-type]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      r#"{
  val _ = (b: bool, t: bool, f: int) -> (
    if b then t else f
  );
}"#,
      &builder.unit_type(),
      vec!["__DUMMY__.sam:3:22-3:23: [incompatible-type]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "match (3) { Foo(_) -> 1, Bar(s) -> 2 }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:13-1:16: [member-missing]: Cannot find member `Foo` on `int`.",
        "__DUMMY__.sam:1:26-1:29: [member-missing]: Cannot find member `Bar` on `int`.",
      ],
    );
    assert_errors(
      heap,
      "match (Test.init(true, 3)) { Foo(_) -> 1, Bar(s) -> 2, }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:30-1:33: [member-missing]: Cannot find member `Foo` on `Test`.",
        "__DUMMY__.sam:1:43-1:46: [member-missing]: Cannot find member `Bar` on `Test`.",
      ],
    );
    assert_errors_with_class(
      heap,"{ val _ = (t: Test2) -> match (t) { Foo(_) -> 1, Baz(s) -> 2, }; }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:25-1:64: [non-exhaustive-match]: The following tags are not considered in the match: [Bar].",
        "__DUMMY__.sam:1:50-1:53: [member-missing]: Cannot find member `Baz` on `Test2`.",
      ],
      "Test2",
    );
  }

  #[test]
  fn lambdas_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_checks(
      heap,
      "{val _ = (a: (int) -> bool, b: int, c: int) -> if a(b + 1) then b else c;}",
      &builder.unit_type(),
    );
    assert_checks(
      heap,
      "(a) -> a",
      &builder.fun_type(vec![builder.int_type()], builder.int_type()),
    );

    assert_errors(heap, "(a) -> a", &builder.fun_type(vec![], builder.int_type()), vec![
      "__DUMMY__.sam:1:1-1:9: [invalid-arity]: Incorrect function arguments size. Expected: 0, actual: 1.",
      "__DUMMY__.sam:1:2-1:3: [underconstrained]: There is not enough context information to decide the type of this expression.",
    ]);
    assert_errors(heap, "(a) -> a", &builder.int_type(), vec![
      "__DUMMY__.sam:1:1-1:9: [incompatible-type]: Expected: `int`, actual: `function type`.",
      "__DUMMY__.sam:1:2-1:3: [underconstrained]: There is not enough context information to decide the type of this expression.",
    ]);
  }

  #[test]
  fn blocks_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    assert_errors_with_class(
      heap,
      "{val {a, b as c} = A.init();}",
      &builder.unit_type(),
      vec![],
      "A",
    );
    assert_checks(heap, "{val a = 1;}", &builder.unit_type());
    assert_checks(heap, "{val a = 1; val b = true;}", &builder.unit_type());
    assert_checks(heap, "{val a = 1; a}", &builder.int_type());
    assert_checks(heap, "{1}", &builder.int_type());
    assert_checks(heap, "{}", &builder.unit_type());
    assert_checks(heap, "{{{{}}}}", &builder.unit_type());

    assert_errors(
      heap,
      "{val {a, b as c} = A.init();}",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:10-1:11: [member-missing]: Cannot find member `b` on `A`."],
    );
    assert_errors(
      heap,
      "{val {a, b as c} = C.init();}",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:7-1:8: [member-missing]: Cannot find member `a` on `C`.",
        "__DUMMY__.sam:1:10-1:11: [member-missing]: Cannot find member `b` on `C`.",
      ],
    );
    assert_errors(
      heap,
      "{val {a, b as c} = 1;}",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:7-1:8: [member-missing]: Cannot find member `a` on `int`.",
        "__DUMMY__.sam:1:10-1:11: [member-missing]: Cannot find member `b` on `int`.",
      ],
    );
    assert_errors(
      heap,
      "{val {a, d as c} = A.init();}",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:10-1:11: [member-missing]: Cannot find member `d` on `A`."],
    );
  }

  #[test]
  fn function_call_integration_test() {
    let builder = test_type_builder::create();

    assert_errors(
      &mut Heap::new(),
      r#"{
  val _ = (() -> true)(1);
  val _: string = Test.generic1(
    (() -> 0)(),
    {true},
    match (Test2.Foo(false)) { Foo(_) -> false, Bar(_) -> false, }
  );
  val _ = Test.generic1(0, if true then true else false, false);
  val _ = Test.generic2((a: int) -> 1, 1);
  val _ = Test.generic2((a) -> 1, 1);
  val _ = Test.generic3((a: int) -> 1);
  val _ = Test.generic3(match (Test2.Foo(false)) { Foo(_) -> (a) -> 1, Bar(_) -> (a) -> 1, });
  val _ = Test.generic4((a: int, b) -> 1);
}
"#,
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:2:12-2:26: [invalid-arity]: Incorrect arguments size. Expected: 0, actual: 1.",
        "__DUMMY__.sam:8:11-8:64: [underconstrained]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:12:63-12:64: [underconstrained]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:12:83-12:84: [underconstrained]: There is not enough context information to decide the type of this expression."
      ],
    );
  }

  #[test]
  fn checker_simple_integration_test() {
    let builder = test_type_builder::create();

    assert_checks(
      &mut Heap::new(),
      r#"{
  val f = (a: int, b: int, c: int) -> {
    val f = (d: int, e: int) -> a + b + c + d + e;
    f(1, 2)
  };
  val _ = (b: bool, t: int, f: int) -> if b then t else f;
  f(3, 4, 5)
}
"#,
      &builder.int_type(),
    );
  }

  fn assert_module_errors(sources: Vec<(&'static str, &str)>, expected_errors: Vec<&str>) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut unchecked_sources = HashMap::new();
    for (mod_ref_str, source) in sources {
      let mod_ref = heap.alloc_module_reference_from_string_vec(vec![mod_ref_str.to_string()]);
      let parsed = parse_source_module_from_text(source, mod_ref, &mut heap, &mut error_set);
      unchecked_sources.insert(mod_ref, parsed);
    }
    type_check_sources(&unchecked_sources, &mut heap, &mut error_set);
    assert_eq!(expected_errors, error_set.error_messages(&heap));
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
      vec![],
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
      val _ = (foo: Useless) -> {};
    }
  }
  interface Bar {}
  class Foo : Bar {}"#;

    assert_module_errors(
      vec![("A", source_a), ("B", source_b), ("C", source_c), ("D", source_d)],
      vec![
        "A.sam:1:1-1:20: [cannot-resolve-module]: Module `K` is not resolved.",
        "A.sam:2:14-2:15: [missing-export]: There is no `C` export in `B`.",
        "A.sam:4:39-4:40: [name-already-bound]: Name `a` collides with a previously defined name at A.sam:4:16-4:17.",
        "B.sam:2:11-2:12: [name-already-bound]: Name `A` collides with a previously defined name at B.sam:1:10-1:11.",
        "B.sam:2:14-2:15: [name-already-bound]: Name `A` collides with a previously defined name at B.sam:1:10-1:11.",
        "B.sam:3:35-3:48: [incompatible-type]: Expected: `B<int, bool>`, actual: `B<int, int>`.",
        "C.sam:2:21-2:24: [name-already-bound]: Name `Int` collides with a previously defined name at C.sam:2:11-2:14.",
        "C.sam:2:36-2:37: [invalid-arity]: Incorrect type arguments size. Expected: 2, actual: 0.",
        "C.sam:3:43-3:48: [incompatible-type]: Expected: `bool`, actual: `int`.",
        "C.sam:4:21-4:22: [name-already-bound]: Name `T` collides with a previously defined name at C.sam:4:15-4:16.",
        "C.sam:4:30-4:31: [invalid-arity]: Incorrect type arguments size. Expected: 2, actual: 0.",
        "C.sam:5:55-5:56: [incompatible-type]: Expected: `int`, actual: `bool`.",
        "C.sam:5:68-5:80: [incompatible-type]: Expected: `bool`, actual: `int`.",
        "D.sam:5:50-5:52: [name-already-bound]: Name `c1` collides with a previously defined name at D.sam:5:43-5:45.",
      ],
    );
  }

  #[test]
  fn type_checker_interface_conformance_tests() {
    let source = r#"
interface Foo {}
class A : Foo {} // OK
interface Bar {
  function a(): unit
  method b(): string
}
class B : Bar {} // Error
class C : Bar {
  function a(): string = ""
  method b(): unit = {} // error
}
class D : Bar {
  function b(): string = "" // error
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
class E : Baz2<string, bool> { // all good
  method <TC> m1(a: int, b: int): TC = Builtins.panic("")
  method <TA1, TB1, TC> f1(a: TA1, b: TB1): TC = Builtins.panic("")
  method <TC> m2(a: string, b: bool): TC = Builtins.panic("")
}
class F : Baz2<string, bool> {
  private method <TC> m1(a: string, b: string): TC = Builtins.panic("") // error
  method <TA1, TB1, TC> f1(a: string, b: string): TC = Builtins.panic("") // error
  method <TC> m2(a: string, b: string): TC = Builtins.panic("") // error
}
interface G : Baz2<string, bool> {
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

    let expected_errors = vec![
      "A.sam:5:3-5:21: [illegal-function-in-interface]: Function declarations are not allowed in interfaces.",
      "A.sam:8:1-8:17: [missing-definitions]: Missing definitions for [b].",
      "A.sam:11:11-11:19: [incompatible-type]: Expected: `() -> string`, actual: `() -> unit`.",
      "A.sam:13:1-16:2: [missing-definitions]: Missing definitions for [b].",
      "A.sam:32:11-32:72: [incompatible-type]: Expected: `public class member`, actual: `private class member`.",
      "A.sam:32:25-32:51: [incompatible-type]: Expected: `(int, int) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:33:27-33:53: [incompatible-type]: Expected: `(TA1, TB1) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:34:17-34:43: [incompatible-type]: Expected: `(string, bool) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:37:17-37:37: [type-parameter-name-mismatch]: Type parameter name mismatch. Expected exact match of `<TC>`.",
      "A.sam:38:16-38:18: [cannot-resolve-name]: Name `TA` is not resolved.",
      "A.sam:38:31-38:51: [type-parameter-name-mismatch]: Type parameter name mismatch. Expected exact match of `<TA1, TB1, TC>`.",
      "A.sam:42:24-42:32: [type-parameter-name-mismatch]: Type parameter name mismatch. Expected exact match of `<TE : Foo>`.",
      "A.sam:45:19-45:27: [invalid-arity]: Incorrect type parameters size. Expected: 1, actual: 0.",
      "A.sam:48:29-48:37: [type-parameter-name-mismatch]: Type parameter name mismatch. Expected exact match of `<TE : Foo>`.",
      "A.sam:50:34-50:35: [cannot-resolve-name]: Name `T` is not resolved.",
      "A.sam:51:47-51:48: [cannot-resolve-name]: Name `T` is not resolved.",
      "A.sam:52:19-52:25: [cannot-resolve-name]: Name `DumDum` is not resolved.",
      "A.sam:53:11-53:18: [cyclic-type-definition]: Type `Cyclic1` has a cyclic definition.",
      "A.sam:54:11-54:18: [cyclic-type-definition]: Type `Cyclic2` has a cyclic definition.",
      "A.sam:55:11-55:18: [cyclic-type-definition]: Type `Cyclic3` has a cyclic definition.",
      "A.sam:56:11-56:18: [cyclic-type-definition]: Type `Cyclic4` has a cyclic definition.",
    ];
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

    let expected_errors = vec![
      "bounded-generics.sam:15:52-15:55: [incompatible-type]: Expected: subtype of `Comparable<int>`, actual: `int`.",
      "bounded-generics.sam:15:57-15:64: [incompatible-type]: Expected: `int`, actual: `T`.",
      "bounded-generics.sam:15:66-15:73: [incompatible-type]: Expected: `int`, actual: `T`.",
      "bounded-generics.sam:18:20-18:40: [incompatible-type]: Expected: `non-abstract type`, actual: `Comparable<BoxedInt>`.",
      "bounded-generics.sam:19:53-19:69: [incompatible-type]: Expected: `Comparable<BoxedInt>`, actual: `BoxedInt`.",
      "bounded-generics.sam:28:7-28:17: [cyclic-type-definition]: Type `ImplItself` has a cyclic definition.",
      "bounded-generics.sam:28:20-28:30: [incompatible-type]: Expected: `interface type`, actual: `class type`.",
      "bounded-generics.sam:29:21-29:22: [cannot-resolve-name]: Name `T` is not resolved.",
      "bounded-generics.sam:31:34-31:35: [incompatible-type]: Expected: `nominal type`, actual: `T`.",
    ];
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

    assert_module_errors(vec![("A", source_a), ("B", source_b), ("C", source_c)], vec![]);
  }
}
