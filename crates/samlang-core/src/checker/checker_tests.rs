#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, FieldType, Id, Literal, NO_COMMENT_REFERENCE},
      Location, Reason,
    },
    checker::{
      main_checker::type_check_expression,
      ssa_analysis::{perform_ssa_analysis_on_expression, SsaAnalysisResult},
      type_::{test_type_builder, FunctionType, Type, TypeParameterSignature},
      type_check_single_module_source, type_check_source_handles, type_check_sources,
      typing_context::{
        create_builtin_module_typing_context, GlobalTypingContext, InterfaceTypingContext,
        LocalTypingContext, MemberTypeInformation, ModuleTypingContext,
        TypeDefinitionTypingContext, TypingContext,
      },
    },
    common::{Heap, ModuleReference},
    errors::ErrorSet,
    parser::{parse_source_expression_from_text, parse_source_module_from_text},
  };
  use pretty_assertions::assert_eq;
  use std::{
    collections::{BTreeMap, HashMap, HashSet},
    rc::Rc,
  };

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
      lambda_captures: HashMap::new(),
    });
    let global_cx = sandbox_global_cx(&mut heap);
    let test_str = heap.alloc_str("Test");
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      test_str,
      /* availableTypeParameters */ vec![],
    );

    let builder = test_type_builder::create();
    type_check_expression(
      &mut cx,
      &heap,
      expr::E::MethodAccess(expr::MethodAccess {
        common: expr::ExpressionCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          type_: builder.bool_type(),
        },
        type_arguments: vec![],
        object: Box::new(expr::E::Literal(
          expr::ExpressionCommon::dummy(builder.bool_type()),
          Literal::Bool(true),
        )),
        method_name: Id {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: test_str,
        },
      }),
      None,
    );
  }

  fn sandbox_global_cx(heap: &mut Heap) -> GlobalTypingContext {
    let builder = test_type_builder::create();

    HashMap::from([
      (ModuleReference::root(), create_builtin_module_typing_context(heap)),
      (
        ModuleReference::dummy(),
        ModuleTypingContext {
          type_definitions: BTreeMap::from([
            (
              heap.alloc_str("Test"),
              TypeDefinitionTypingContext {
                is_object: true,
                names: vec![heap.alloc_str("foo"), heap.alloc_str("bar"), heap.alloc_str("fff")],
                mappings: HashMap::from([
                  (
                    heap.alloc_str("foo"),
                    FieldType { is_public: true, type_: builder.bool_type() },
                  ),
                  (
                    heap.alloc_str("bar"),
                    FieldType { is_public: false, type_: builder.int_type() },
                  ),
                  (
                    heap.alloc_str("fff"),
                    FieldType {
                      is_public: false,
                      type_: builder.fun_type(vec![], builder.string_type()),
                    },
                  ),
                ]),
              },
            ),
            (
              heap.alloc_str("Test2"),
              TypeDefinitionTypingContext {
                is_object: false,
                names: vec![heap.alloc_str("Foo"), heap.alloc_str("Bar")],
                mappings: HashMap::from([
                  (
                    heap.alloc_str("Foo"),
                    FieldType { is_public: true, type_: builder.bool_type() },
                  ),
                  (heap.alloc_str("Bar"), FieldType { is_public: true, type_: builder.int_type() }),
                ]),
              },
            ),
            (
              heap.alloc_str("Test3"),
              TypeDefinitionTypingContext {
                is_object: true,
                names: vec![heap.alloc_str("foo"), heap.alloc_str("bar")],
                mappings: HashMap::from([
                  (
                    heap.alloc_str("foo"),
                    FieldType {
                      is_public: true,
                      type_: builder.simple_id_type(heap.alloc_str("E")),
                    },
                  ),
                  (
                    heap.alloc_str("bar"),
                    FieldType { is_public: false, type_: builder.int_type() },
                  ),
                ]),
              },
            ),
            (
              heap.alloc_str("Test4"),
              TypeDefinitionTypingContext {
                is_object: false,
                names: vec![heap.alloc_str("Foo"), heap.alloc_str("Bar")],
                mappings: HashMap::from([
                  (
                    heap.alloc_str("Foo"),
                    FieldType {
                      is_public: true,
                      type_: builder.simple_id_type(heap.alloc_str("E")),
                    },
                  ),
                  (heap.alloc_str("Bar"), FieldType { is_public: true, type_: builder.int_type() }),
                ]),
              },
            ),
            (
              heap.alloc_str("A"),
              TypeDefinitionTypingContext {
                is_object: true,
                names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
                mappings: HashMap::from([
                  (heap.alloc_str("a"), FieldType { is_public: true, type_: builder.int_type() }),
                  (heap.alloc_str("b"), FieldType { is_public: false, type_: builder.bool_type() }),
                ]),
              },
            ),
            (
              heap.alloc_str("B"),
              TypeDefinitionTypingContext {
                is_object: true,
                names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
                mappings: HashMap::from([
                  (heap.alloc_str("a"), FieldType { is_public: true, type_: builder.int_type() }),
                  (heap.alloc_str("b"), FieldType { is_public: false, type_: builder.bool_type() }),
                ]),
              },
            ),
            (
              heap.alloc_str("C"),
              TypeDefinitionTypingContext {
                is_object: false,
                names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
                mappings: HashMap::from([
                  (heap.alloc_str("a"), FieldType { is_public: true, type_: builder.int_type() }),
                  (heap.alloc_str("b"), FieldType { is_public: true, type_: builder.bool_type() }),
                ]),
              },
            ),
          ]),
          interfaces: BTreeMap::from([
            (
              heap.alloc_str("Test"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([
                  (
                    heap.alloc_str("init"),
                    Rc::new(MemberTypeInformation {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.bool_type(), builder.int_type()],
                        return_type: builder.simple_id_type(heap.alloc_str("Test")),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("helloWorld"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.string_type()],
                        return_type: builder.unit_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("helloWorldWithTypeParameters"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("A"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.simple_id_type(heap.alloc_str("A"))],
                        return_type: builder.unit_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("generic1"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![
                        TypeParameterSignature { name: heap.alloc_str("A"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str("B"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str("C"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str("D"), bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![
                          builder.simple_id_type(heap.alloc_str("A")),
                          builder.simple_id_type(heap.alloc_str("B")),
                          builder.simple_id_type(heap.alloc_str("C")),
                        ],
                        return_type: builder.simple_id_type(heap.alloc_str("D")),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("generic2"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("T"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![
                          builder.fun_type(vec![builder.int_type()], builder.int_type()),
                          builder.simple_id_type(heap.alloc_str("T")),
                        ],
                        return_type: builder.bool_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("generic3"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![
                        TypeParameterSignature { name: heap.alloc_str("A"), bound: None },
                        TypeParameterSignature { name: heap.alloc_str("B"), bound: None },
                      ],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.fun_type(
                          vec![builder.simple_id_type(heap.alloc_str("A"))],
                          builder.simple_id_type(heap.alloc_str("B")),
                        )],
                        return_type: builder.bool_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("generic4"),
                    Rc::new(MemberTypeInformation {
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
                    }),
                  ),
                ])),
                methods: Rc::new(BTreeMap::from([
                  (
                    heap.alloc_str("baz"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.bool_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("bazWithTypeParam"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("A"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.bool_type(),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("bazWithUsefulTypeParam"),
                    Rc::new(MemberTypeInformation {
                      is_public: false,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("A"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.simple_id_type(heap.alloc_str("A"))],
                        return_type: builder.bool_type(),
                      },
                    }),
                  ),
                ])),
                type_parameters: vec![],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("Test2"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([
                  (
                    heap.alloc_str("Foo"),
                    Rc::new(MemberTypeInformation {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.bool_type()],
                        return_type: builder.simple_id_type(heap.alloc_str("Test2")),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("Bar"),
                    Rc::new(MemberTypeInformation {
                      is_public: true,
                      type_parameters: vec![],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.simple_id_type(heap.alloc_str("Test2")),
                      },
                    }),
                  ),
                ])),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("Test3"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::new()),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![TypeParameterSignature {
                  name: heap.alloc_str("E"),
                  bound: None,
                }],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("Test4"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([
                  (
                    heap.alloc_str("Foo"),
                    Rc::new(MemberTypeInformation {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("E"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.simple_id_type(heap.alloc_str("E"))],
                        return_type: builder.general_id_type(
                          heap.alloc_str("Test4"),
                          vec![builder.simple_id_type(heap.alloc_str("E"))],
                        ),
                      },
                    }),
                  ),
                  (
                    heap.alloc_str("Bar"),
                    Rc::new(MemberTypeInformation {
                      is_public: true,
                      type_parameters: vec![TypeParameterSignature {
                        name: heap.alloc_str("E"),
                        bound: None,
                      }],
                      type_: FunctionType {
                        reason: Reason::dummy(),
                        argument_types: vec![builder.int_type()],
                        return_type: builder.general_id_type(
                          heap.alloc_str("Test4"),
                          vec![builder.simple_id_type(heap.alloc_str("E"))],
                        ),
                      },
                    }),
                  ),
                ])),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![TypeParameterSignature {
                  name: heap.alloc_str("E"),
                  bound: None,
                }],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("A"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([(
                  heap.alloc_str("init"),
                  Rc::new(MemberTypeInformation {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_id_type(heap.alloc_str("A")),
                    },
                  }),
                )])),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("B"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([(
                  heap.alloc_str("init"),
                  Rc::new(MemberTypeInformation {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_id_type(heap.alloc_str("B")),
                    },
                  }),
                )])),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![],
                super_types: vec![],
              }),
            ),
            (
              heap.alloc_str("C"),
              Rc::new(InterfaceTypingContext {
                is_concrete: true,
                functions: Rc::new(BTreeMap::from([(
                  heap.alloc_str("init"),
                  Rc::new(MemberTypeInformation {
                    is_public: true,
                    type_parameters: vec![],
                    type_: FunctionType {
                      reason: Reason::dummy(),
                      argument_types: vec![],
                      return_type: builder.simple_id_type(heap.alloc_str("C")),
                    },
                  }),
                )])),
                methods: Rc::new(BTreeMap::new()),
                type_parameters: vec![],
                super_types: vec![],
              }),
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
    let mut local_cx = LocalTypingContext::new(perform_ssa_analysis_on_expression(
      &parsed,
      heap,
      &mut temp_ssa_error_set,
    ));
    let current_class = heap.alloc_str(current_class);
    let mut cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      current_class,
      /* availableTypeParameters */ vec![],
    );

    type_check_expression(&mut cx, heap, parsed, Some(expected_type));
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
      vec!["__DUMMY__.sam:1:1-1:5: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "42",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:3: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "\"a\"",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `unit`, actual: `string`."],
    );

    assert_checks(heap, "this", &builder.int_type());
    assert_checks(heap, "{ val foo = 3; foo }", &builder.int_type());
    assert_errors(
      heap,
      "{ val foo = true; foo }",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`."],
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
        "__DUMMY__.sam:1:1-1:19: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:34: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.",
        "__DUMMY__.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:1:1-1:34: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(unknown) -> unit`.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters",
      &builder.string_type(),
      vec![
        "__DUMMY__.sam:1:1-1:34: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:1:1-1:34: [UnexpectedTypeKind]: Expected kind: `string`, actual: `function`.",
        "__DUMMY__.sam:1:1-1:34: [UnexpectedType]: Expected: `string`, actual: `(unknown) -> unit`.",
      ]
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<int, string>",
      &builder.fun_type(vec![builder.int_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:47: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorldWithTypeParameters<string>",
      &builder.fun_type(vec![builder.string_type(), builder.string_type()], builder.unit_type()),
      vec![
        "__DUMMY__.sam:1:1-1:42: [UnexpectedType]: Expected: `(string, string) -> unit`, actual: `(string) -> unit`.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorld2",
      &builder.fun_type(vec![builder.string_type()], builder.unit_type()),
      vec!["__DUMMY__.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved."],
    );
  }

  #[test]
  fn ctors_checker_test() {
    let heap = &mut Heap::new();
    let builder = test_type_builder::create();

    let test_str = heap.alloc_str("Test");
    let test2_str = heap.alloc_str("Test2");
    let test4_str = heap.alloc_str("Test4");

    assert_checks(heap, "Test.init(true, 3)", &builder.simple_id_type(test_str));
    assert_checks(heap, "{ val foo=true; Test.init(foo, 3) }", &builder.simple_id_type(test_str));
    assert_errors_with_class(
      heap,
      "Test2.Foo(true)",
      &builder.simple_id_type(test2_str),
      vec![],
      "Test2",
    );
    assert_errors_with_class(
      heap,
      "Test2.Bar(42)",
      &builder.simple_id_type(test2_str),
      vec![],
      "Test2",
    );
    assert_errors_with_class(
      heap,
      "Test4.Foo(true)",
      &builder.general_id_type(test4_str, vec![builder.bool_type()]),
      vec![],
      "Test4",
    );
    assert_errors_with_class(
      heap,
      "Test4.Foo<bool>(true)",
      &builder.general_id_type(test4_str, vec![builder.bool_type()]),
      vec![],
      "Test4",
    );

    assert_errors(
      heap,
      "Test.Foo(true)",
      &builder.simple_id_type(test2_str),
      vec!["__DUMMY__.sam:1:1-1:9: [UnresolvedName]: Name `Test.Foo` is not resolved."],
    );
    assert_errors(
      heap,
      "Test.Bar(42)",
      &builder.simple_id_type(test2_str),
      vec!["__DUMMY__.sam:1:1-1:9: [UnresolvedName]: Name `Test.Bar` is not resolved."],
    );
    assert_errors(heap,
      "Test4.Foo<int, bool>(true)",
      &builder.general_id_type(test4_str, vec![builder.bool_type()]),
      vec![
        "__DUMMY__.sam:1:1-1:21: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_id_type(test4_str, vec![builder.int_type()]),
      vec!["__DUMMY__.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "Test4.Foo<int>(true)",
      &builder.general_id_type(test4_str, vec![builder.bool_type()]),
      vec![
        "__DUMMY__.sam:1:1-1:21: [UnexpectedType]: Expected: `Test4<bool>`, actual: `Test4<int>`.",
        "__DUMMY__.sam:1:16-1:20: [UnexpectedType]: Expected: `int`, actual: `bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test44.Bar(42)",
      &builder.simple_id_type(test2_str),
      vec!["__DUMMY__.sam:1:1-1:11: [UnresolvedName]: Name `Test44.Bar` is not resolved."],
    );
    assert_errors_with_class(
      heap,
      "Test2.Tars(42)",
      &builder.simple_id_type(test2_str),
      vec!["__DUMMY__.sam:1:1-1:11: [UnresolvedName]: Name `Test2.Tars` is not resolved."],
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
      vec![
        "__DUMMY__.sam:1:1-1:2: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazz",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:20-1:24: [UnresolvedName]: Name `bazz` is not resolved."],
    );
    assert_errors(
      heap,
      "{ val _ = (t3: Test3<bool>) -> t3.bar; }",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:35-1:38: [UnresolvedName]: Name `bar` is not resolved."],
    );
    assert_errors_with_class(
      heap,
      "Test2.Foo(true).foo",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:17-1:20: [UnresolvedName]: Name `foo` is not resolved."],
      "Test2",
    );
    assert_errors(heap, "Test.init(true, 3).foo<int>", &builder.bool_type(), vec![
      "__DUMMY__.sam:1:1-1:28: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.",
    ]);
    assert_errors(
      heap,
      "Test.init(true, 3).foo",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bar",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`."],
    );
    assert_errors(heap,
      "Test.init(true, 3).baz<int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:28: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.int_type(),
      vec![
        "__DUMMY__.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:1:1-1:36: [UnexpectedTypeKind]: Expected kind: `int`, actual: `function`.",
        "__DUMMY__.sam:1:1-1:36: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam",
      &builder.fun_type(vec![builder.int_type(), builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:36: [ArityMismatchError]: Incorrect parameter size. Expected: 2, actual: 1.",
        "__DUMMY__.sam:1:1-1:36: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:1:1-1:36: [UnexpectedType]: Expected: `(int, int) -> bool`, actual: `(int) -> bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithTypeParam<int, int>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:46: [ArityMismatchError]: Incorrect type arguments size. Expected: 1, actual: 2.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).bazWithUsefulTypeParam<bool>",
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
      vec![
        "__DUMMY__.sam:1:1-1:48: [UnexpectedType]: Expected: `(int) -> bool`, actual: `(bool) -> bool`.",
      ],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz",
      &builder.fun_type(vec![builder.bool_type()], builder.int_type()),
      vec![
        "__DUMMY__.sam:1:1-1:23: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`.",
      ],
    );

    assert_errors(heap, "{ val _ = (t) -> t.foo; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
      "__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.",
    ]);
    assert_errors(heap, "{ val _ = (t) -> t.bar; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
      "__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.",
    ]);
    assert_errors(heap, "{ val _ = (t) -> t.baz; }", &builder.unit_type(), vec![
      "__DUMMY__.sam:1:12-1:13: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
      "__DUMMY__.sam:1:18-1:19: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `unknown`.",
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
      vec!["__DUMMY__.sam:1:16-1:17: [UnexpectedType]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "3(3)",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:1-1:5: [UnexpectedTypeKind]: Expected kind: `function`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "Test.helloWorld(3)",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:17-1:18: [UnexpectedType]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).fff()",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:25: [UnexpectedType]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "((i: int) -> true)({})",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:20-1:22: [UnexpectedType]: Expected: `int`, actual: `unit`."],
    );
    assert_errors(
      heap,
      "Test.helloWorld(\"\")",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:20: [UnexpectedType]: Expected: `bool`, actual: `unit`."],
    );
    assert_errors(
      heap,
      "Test.init(true, 3).baz(3)",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:26: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "((i: int) -> true)(3)",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:2-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(heap, "Test.init(true, 3).bazWithTypeParam(1)", &builder.bool_type(), vec![
      "__DUMMY__.sam:1:1-1:39: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression."
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
      vec!["__DUMMY__.sam:1:3-1:8: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "!1",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:2-1:3: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "-(1+1)",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "!true",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "!false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"1\" * \"1\"",
      &builder.int_type(),
      vec![
        "__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.",
        "__DUMMY__.sam:1:7-1:10: [UnexpectedType]: Expected: `int`, actual: `string`.",
      ],
    );
    assert_errors(
      heap,
      "\"1\" - 1",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "1 % \"1\"",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:5-1:8: [UnexpectedType]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "1 + false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:5-1:10: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false - 1",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"\" < false",
      &builder.bool_type(),
      vec![
        "__DUMMY__.sam:1:1-1:3: [UnexpectedType]: Expected: `int`, actual: `string`.",
        "__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.",
      ],
    );
    assert_errors(
      heap,
      "1 <= false",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 > \"\"",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:5-1:7: [UnexpectedType]: Expected: `int`, actual: `string`."],
    );
    assert_errors(
      heap,
      "true >= 1",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false || 4",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:10-1:11: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "2 && 3",
      &builder.bool_type(),
      vec![
        "__DUMMY__.sam:1:1-1:2: [UnexpectedType]: Expected: `bool`, actual: `int`.",
        "__DUMMY__.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "1 == false",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true == 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "true != 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "\"\" != 3",
      &builder.bool_type(),
      vec!["__DUMMY__.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      "{ val _ = (t: int, f: bool) -> t == f; }",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:37-1:38: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 * 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 % 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 + 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 - 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."],
    );
    assert_errors(
      heap,
      "1 < 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 <= 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 > 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 >= 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true || false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "false && true",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "1 == 1",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true == false",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "true != true",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:13: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "\"\" != \"3\"",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:1-1:10: [UnexpectedType]: Expected: `unit`, actual: `bool`."],
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
      vec!["__DUMMY__.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "if false then 1 else false",
      &builder.int_type(),
      vec!["__DUMMY__.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`."],
    );
    assert_errors(
      heap,
      "if false then \"\" else 3",
      &builder.string_type(),
      vec!["__DUMMY__.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`."],
    );
    assert_errors(
      heap,
      r#"{
  val _ = (b: bool, t: bool, f: int) -> (
    if b then t else f
  );
}"#,
      &builder.unit_type(),
      vec!["__DUMMY__.sam:3:22-3:23: [UnexpectedType]: Expected: `bool`, actual: `int`."],
    );
    assert_errors(
      heap,
      "match (3) { Foo(_) -> 1, Bar(s) -> 2 }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:8-1:9: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "match (Test.init(true, 3)) { Foo(_) -> 1, Bar(s) -> 2, }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:30-1:33: [UnresolvedName]: Name `Foo` is not resolved.",
        "__DUMMY__.sam:1:43-1:46: [UnresolvedName]: Name `Bar` is not resolved.",
      ],
    );
    assert_errors_with_class(
      heap,"{ val _ = (t: Test2) -> match (t) { Foo(_) -> 1, Baz(s) -> 2, }; }",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:25-1:64: [NonExhausiveMatch]: The following tags are not considered in the match: [Bar].",
        "__DUMMY__.sam:1:50-1:53: [UnresolvedName]: Name `Baz` is not resolved.",
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
      "__DUMMY__.sam:1:1-1:9: [ArityMismatchError]: Incorrect function arguments size. Expected: 0, actual: 1.",
      "__DUMMY__.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
    ]);
    assert_errors(heap, "(a) -> a", &builder.int_type(), vec![
      "__DUMMY__.sam:1:1-1:9: [UnexpectedType]: Expected: `int`, actual: `(unknown) -> unknown`.",
      "__DUMMY__.sam:1:2-1:3: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
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
      vec!["__DUMMY__.sam:1:10-1:11: [UnresolvedName]: Name `b` is not resolved."],
    );
    assert_errors(
      heap,
      "{val {a, b as c} = C.init();}",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:7-1:8: [UnresolvedName]: Name `a` is not resolved.",
        "__DUMMY__.sam:1:10-1:11: [UnresolvedName]: Name `b` is not resolved.",
      ],
    );
    assert_errors(
      heap,
      "{val {a, b as c} = 1;}",
      &builder.unit_type(),
      vec![
        "__DUMMY__.sam:1:20-1:21: [UnexpectedTypeKind]: Expected kind: `identifier`, actual: `int`.",
      ],
    );
    assert_errors(
      heap,
      "{val {a, d as c} = A.init();}",
      &builder.unit_type(),
      vec!["__DUMMY__.sam:1:10-1:11: [UnresolvedName]: Name `d` is not resolved."],
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
        "__DUMMY__.sam:2:12-2:26: [ArityMismatchError]: Incorrect arguments size. Expected: 0, actual: 1.",
        "__DUMMY__.sam:8:11-8:64: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
        "__DUMMY__.sam:12:11-12:94: [InsufficientTypeInferenceContext]: There is not enough context information to decide the type of this expression.",
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
    type_check_sources(unchecked_sources, &mut heap, &mut error_set);
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
    let source_a = r#"class A { function a(): int = 42 function a(): int = 42 }"#;
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
        "A.sam:1:43-1:44: [Collision]: Name `a` collides with a previously defined name.",
        "B.sam:2:11-2:12: [Collision]: Name `A` collides with a previously defined name.",
        "B.sam:2:14-2:15: [Collision]: Name `A` collides with a previously defined name.",
        "B.sam:3:35-3:48: [UnexpectedType]: Expected: `B<int, bool>`, actual: `B<int, int>`.",
        "C.sam:2:21-2:24: [Collision]: Name `Int` collides with a previously defined name.",
        "C.sam:2:36-2:37: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.",
        "C.sam:3:43-3:48: [UnexpectedType]: Expected: `bool`, actual: `int`.",
        "C.sam:4:21-4:22: [Collision]: Name `T` collides with a previously defined name.",
        "C.sam:4:30-4:31: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.",
        "C.sam:5:55-5:56: [UnexpectedType]: Expected: `int`, actual: `bool`.",
        "C.sam:5:68-5:80: [UnexpectedType]: Expected: `bool`, actual: `int`.",
        "D.sam:5:50-5:52: [Collision]: Name `c1` collides with a previously defined name.",
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
  function a(): string = "" // error
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
  function <TA, TB, TC> f1(a: TA, b: TB): TC
}
interface Baz2<TA, TB> : Baz1<TA, int> {
  method <TC> m2(a: TA, b: TB): TC
}
class E : Baz2<string, bool> { // all good
  method <TC> m1(a: int, b: int): TC = Builtins.panic("")
  function <TA, TB, TC> f1(a: TA, b: TB): TC = Builtins.panic("")
  method <TC> m2(a: string, b: bool): TC = Builtins.panic("")
}
class F : Baz2<string, bool> {
  private method <TC> m1(a: string, b: string): TC = Builtins.panic("") // error
  function <TA, TB, TC> f1(a: string, b: string): TC = Builtins.panic("") // error
  method <TC> m2(a: string, b: string): TC = Builtins.panic("") // error
}
interface G : Baz2<string, bool> {
  method <TD> m1(a: int, b: int): TD // tparam name mismatch
  function <TA: TA, TB, TC> f1(a: TA, b: TB): TC // has bound mismatch
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
class Z<T: Foo> : DumDum {} // error
interface Cyclic1 : Cyclic2 {} // error: cyclic
interface Cyclic2 : Cyclic3 {} // error: cyclic
interface Cyclic3 : Cyclic1 {} // error: cyclic
interface Cyclic4 : Cyclic4 {} // error: cyclic
"#;

    let expected_errors = vec![
      "A.sam:8:1-8:17: [MissingDefinitions]: Missing definitions for [a, b].",
      "A.sam:10:13-10:23: [UnexpectedType]: Expected: `() -> unit`, actual: `() -> string`.",
      "A.sam:11:11-11:19: [UnexpectedType]: Expected: `() -> string`, actual: `() -> unit`.",
      "A.sam:14:3-14:28: [UnexpectedTypeKind]: Expected kind: `method`, actual: `function`.",
      "A.sam:15:3-15:24: [UnexpectedTypeKind]: Expected kind: `function`, actual: `method`.",
      "A.sam:32:11-32:72: [UnexpectedTypeKind]: Expected kind: `public class member`, actual: `private class member`.",
      "A.sam:32:25-32:51: [UnexpectedType]: Expected: `(int, int) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:33:27-33:53: [UnexpectedType]: Expected: `(TA, TB) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:34:17-34:43: [UnexpectedType]: Expected: `(string, bool) -> TC`, actual: `(string, string) -> TC`.",
      "A.sam:37:17-37:37: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of `<TC>`.",
      "A.sam:38:31-38:49: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of `<TA, TB, TC>`.",
      "A.sam:42:24-42:32: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of `<TE : Foo>`.",
      "A.sam:45:19-45:27: [ArityMismatchError]: Incorrect type parameters size. Expected: 1, actual: 0.",
      "A.sam:48:29-48:37: [TypeParameterNameMismatch]: Type parameter name mismatch. Expected exact match of `<TE : Foo>`.",
      "A.sam:50:19-50:25: [UnresolvedName]: Name `DumDum` is not resolved.",
      "A.sam:51:21-51:28: [CyclicTypeDefinition]: Type `Cyclic2` has a cyclic definition.",
      "A.sam:52:21-52:28: [CyclicTypeDefinition]: Type `Cyclic3` has a cyclic definition.",
      "A.sam:53:21-53:28: [CyclicTypeDefinition]: Type `Cyclic1` has a cyclic definition.",
      "A.sam:54:21-54:28: [CyclicTypeDefinition]: Type `Cyclic4` has a cyclic definition.",
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
  function foo(): int
}
interface Conflicting2 {
  function foo(): bool
}
interface ExtendingConfliting : Conflicting1, Conflicting2
class ImplItself : ImplItself {} // error: expect interface type
class ImplTArg<T> : T {} // error: T not resolved
    "#;

    let expected_errors = vec![
      "bounded-generics.sam:15:52-15:55: [UnexpectedSubtype]: Expected: subtype of `Comparable<int>`, actual: `int`.",
      "bounded-generics.sam:15:57-15:64: [UnexpectedType]: Expected: `int`, actual: `T`.",
      "bounded-generics.sam:15:66-15:73: [UnexpectedType]: Expected: `int`, actual: `T`.",
      "bounded-generics.sam:18:20-18:40: [UnexpectedTypeKind]: Expected kind: `non-abstract type`, actual: `Comparable<BoxedInt>`.",
      "bounded-generics.sam:19:53-19:69: [UnexpectedType]: Expected: `Comparable<BoxedInt>`, actual: `BoxedInt`.",
      "bounded-generics.sam:25:15-25:23: [UnexpectedType]: Expected: `() -> int`, actual: `() -> bool`.",
      "bounded-generics.sam:28:20-28:30: [UnexpectedTypeKind]: Expected kind: `interface type`, actual: `class type`.",
      "bounded-generics.sam:29:21-29:22: [UnresolvedName]: Name `T` is not resolved.",
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

  #[test]
  fn type_check_toplevel_smoke_tests() {
    let heap = &mut Heap::new();
    let source = r#"
interface UnusedInterface<T> { function main(): unit }
class Main {
  function main(): string = Builtins.println("Hello "::"World!")
}
    "#;

    assert_eq!(
      1,
      type_check_source_handles(heap, vec![(ModuleReference::dummy(), source.to_string())])
        .compile_time_errors
        .len()
    );

    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    type_check_single_module_source(
      parse_source_module_from_text(
        source,
        heap.alloc_module_reference_from_string_vec(vec!["Test".to_string()]),
        &mut heap,
        &mut error_set,
      ),
      &mut heap,
      &mut error_set,
    );
    assert_eq!(
      vec!["Test.sam:4:29-4:65: [UnexpectedType]: Expected: `string`, actual: `unit`."],
      error_set.error_messages(&heap)
    );
  }
}
