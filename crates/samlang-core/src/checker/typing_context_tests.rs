#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{test_builder, FieldType, FunctionType, ISourceType, Type, TypeParameterSignature},
      Location, Reason,
    },
    checker::{
      ssa_analysis::SsaAnalysisResult,
      typing_context::{
        create_builtin_module_typing_context, InterfaceTypingContext, LocalTypingContext,
        MemberTypeInformation, ModuleTypingContext, TypeDefinitionTypingContext, TypingContext,
      },
    },
    common::{Heap, ModuleReference},
    errors::ErrorSet,
  };
  use pretty_assertions::assert_eq;
  use std::{
    collections::{BTreeMap, HashMap, HashSet},
    rc::Rc,
  };

  fn empty_local_typing_context() -> LocalTypingContext {
    LocalTypingContext::new(SsaAnalysisResult {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_to_use_map: HashMap::new(),
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
      lambda_captures: HashMap::new(),
    })
    .read(&Location::dummy());
  }

  #[test]
  fn boilterplate() {
    let mut heap = Heap::new();

    assert_eq!(
      r#"
class  : []
functions:
stringToInt: public (string) -> int
intToString: public (int) -> string
println: public (string) -> unit
panic: public <T>(string) -> T
stringConcat: public (string, string) -> string
methods:

"#
      .trim(),
      create_builtin_module_typing_context(&mut heap)
        .interfaces
        .get(&heap.alloc_str("Builtins"))
        .unwrap()
        .to_string(&heap)
    );
    assert_eq!(
      r#"
class  : []
functions:
methods:
m1: public () -> unknown
m2: public () -> unknown
     "#
      .trim(),
      InterfaceTypingContext {
        is_concrete: true,
        type_parameters: vec![],
        super_types: vec![],
        functions: Rc::new(BTreeMap::new()),
        methods: Rc::new(BTreeMap::from([
          (
            heap.alloc_str("m1"),
            Rc::new(MemberTypeInformation {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: Rc::new(Type::Unknown(Reason::dummy()))
              }
            })
          ),
          (
            heap.alloc_str("m2"),
            Rc::new(MemberTypeInformation {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: Rc::new(Type::Unknown(Reason::dummy()))
              }
            })
          )
        ])),
      }
      .to_string(&heap)
    );

    let builder = test_builder::create();
    assert_eq!(
      "a:bool, b:(private) bool",
      TypeDefinitionTypingContext {
        is_object: true,
        names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
        mappings: HashMap::from([
          (heap.alloc_str("a"), FieldType { is_public: true, type_: builder.bool_type() }),
          (heap.alloc_str("b"), FieldType { is_public: false, type_: builder.bool_type() })
        ])
      }
      .to_string(&heap)
    );
    assert_eq!(
      "A(bool)",
      TypeDefinitionTypingContext {
        is_object: false,
        names: vec![heap.alloc_str("A")],
        mappings: HashMap::from([(
          heap.alloc_str("A"),
          FieldType { is_public: true, type_: builder.bool_type() }
        )])
      }
      .to_string(&heap)
    );

    assert_eq!(
      "private a() -> bool",
      MemberTypeInformation::create_private_builtin_function(
        &mut heap,
        "a",
        vec![],
        builder.bool_type(),
        vec![]
      )
      .1
      .pretty_print("a", &heap)
    );
  }

  #[test]
  fn is_subtype_tests() {
    let mut heap = Heap::new();
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([(
          heap.alloc_str("A"),
          Rc::new(InterfaceTypingContext {
            is_concrete: true,
            type_parameters: vec![TypeParameterSignature {
              name: heap.alloc_str("T"),
              bound: None,
            }],
            super_types: vec![builder.general_id_type_unwrapped(
              heap.alloc_str("B"),
              vec![builder.simple_id_type(heap.alloc_str("T")), builder.int_type()],
            )],
            functions: Rc::new(BTreeMap::new()),
            methods: Rc::new(BTreeMap::new()),
          }),
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
      &builder.simple_id_type(heap.alloc_str("B"))
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
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([
          (
            heap.alloc_str("A"),
            Rc::new(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("T1"), bound: None },
                TypeParameterSignature {
                  name: heap.alloc_str("T2"),
                  bound: Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("B")))),
                },
              ],
              super_types: vec![],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
            }),
          ),
          (
            heap.alloc_str("B"),
            Rc::new(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![],
              super_types: vec![builder.simple_id_type_unwrapped(heap.alloc_str("B"))],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
            }),
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
__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.
__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.
__DUMMY__.sam:0:0-0:0: [UnexpectedSubtype]: Expected: subtype of `B`, actual: `int`.
__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `non-abstract type`, actual: `B`."#
      .trim();
    let actual_errors = cx.error_set.error_messages(&heap).join("\n");
    assert_eq!(expected_errors, actual_errors);
  }

  #[test]
  fn get_members_test() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let str_a = heap.alloc_str("A");
    let str_b = heap.alloc_str("B");
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([
          (
            heap.alloc_str("A"),
            Rc::new(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: str_a, bound: None },
                TypeParameterSignature { name: str_b, bound: None },
              ],
              super_types: vec![],
              functions: Rc::new(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  &mut heap,
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
                  &mut heap,
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
              methods: Rc::new(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  &mut heap,
                  "m1",
                  vec![builder.simple_id_type(str_a), builder.simple_id_type(str_b)],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_builtin_function(
                  &mut heap,
                  "m2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
            }),
          ),
          (
            heap.alloc_str("B"),
            Rc::new(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("E"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("F"), bound: None },
              ],
              super_types: vec![],
              functions: Rc::new(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  &mut heap,
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
                  &mut heap,
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
              methods: Rc::new(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  &mut heap,
                  "m1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
                  &mut heap,
                  "m2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
            }),
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
        &heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]),
        &heap.alloc_str("A"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("f2"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_some());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("f2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("f3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("m1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("m2"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("m3"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("m2"),
        vec![],
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("B"),
        &heap.alloc_str("m3"),
        vec![],
        Location::dummy(),
      )
      .is_none());
    assert!(cx
      .get_method_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("C"),
        &heap.alloc_str("m3"),
        vec![],
        Location::dummy(),
      )
      .is_none());

    assert_eq!(
      "public <C>(int, int) -> int",
      cx.get_method_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("m1"),
        vec![builder.int_type(), builder.int_type()],
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );
    assert_eq!(
      "private <C>() -> int",
      cx.get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("A"),
        &heap.alloc_str("f2"),
        Location::dummy(),
      )
      .unwrap()
      .to_string(&heap)
    );
    assert_eq!(
      "public <C>() -> int",
      cx.get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("TT1"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .unwrap()
      .to_string(&heap)
    );

    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("TT2"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(
        &ModuleReference::dummy(),
        &heap.alloc_str("TT3"),
        &heap.alloc_str("f1"),
        Location::dummy()
      )
      .is_none());
  }

  #[test]
  fn resolve_type_definitions_test() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::from([
          (
            heap.alloc_str("A"),
            TypeDefinitionTypingContext {
              is_object: false,
              names: vec![heap.alloc_str("a"), heap.alloc_str("b")],
              mappings: HashMap::from([
                (
                  heap.alloc_str("a"),
                  FieldType { is_public: true, type_: builder.simple_id_type(heap.alloc_str("A")) },
                ),
                (
                  heap.alloc_str("b"),
                  FieldType {
                    is_public: false,
                    type_: builder.simple_id_type(heap.alloc_str("B")),
                  },
                ),
              ]),
            },
          ),
          (
            heap.alloc_str("B"),
            TypeDefinitionTypingContext {
              is_object: true,
              names: vec![],
              mappings: HashMap::new(),
            },
          ),
        ]),
        interfaces: BTreeMap::from([
          (
            heap.alloc_str("A"),
            Rc::new(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("A"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("B"), bound: None },
              ],
              super_types: vec![],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
            }),
          ),
          (
            heap.alloc_str("B"),
            Rc::new(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![
                TypeParameterSignature { name: heap.alloc_str("E"), bound: None },
                TypeParameterSignature { name: heap.alloc_str("F"), bound: None },
              ],
              super_types: vec![],
              functions: Rc::new(BTreeMap::new()),
              methods: Rc::new(BTreeMap::new()),
            }),
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

    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped(
          heap.alloc_str("A"),
          vec![builder.int_type(), builder.int_type()]
        ),
        true,
      )
      .0
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped(
          heap.alloc_str("A"),
          vec![builder.int_type(), builder.int_type()]
        ),
        true,
      )
      .0
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped(
          heap.alloc_str("C"),
          vec![builder.int_type(), builder.int_type()]
        ),
        true,
      )
      .0
      .is_empty());

    let (_, resolved) = cx.resolve_type_definition(
      &builder.general_id_type_unwrapped(
        heap.alloc_str("A"),
        vec![builder.int_type(), builder.int_type()],
      ),
      false,
    );
    assert_eq!(2, resolved.len());
    let resolved_a = resolved.get(&heap.alloc_str("a")).unwrap();
    let resolved_b = resolved.get(&heap.alloc_str("b")).unwrap();
    assert_eq!(true, resolved_a.is_public);
    assert_eq!(false, resolved_b.is_public);
    assert_eq!("int", resolved_a.type_.pretty_print(&heap));
    assert_eq!("int", resolved_b.type_.pretty_print(&heap));
  }
}
