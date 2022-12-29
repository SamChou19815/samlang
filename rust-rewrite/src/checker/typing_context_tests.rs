#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{test_builder, FieldType, FunctionType, ISourceType, Type, TypeParameterSignature},
      Location, ModuleReference, Reason,
    },
    checker::{
      ssa_analysis::SsaAnalysisResult,
      typing_context::{
        create_builtin_module_typing_context, InterfaceTypingContext, LocalTypingContext,
        MemberTypeInformation, ModuleTypingContext, TypeDefinitionTypingContext, TypingContext,
      },
    },
    common::{rc, rcs},
    errors::ErrorSet,
  };
  use pretty_assertions::assert_eq;
  use std::collections::{BTreeMap, HashMap, HashSet};

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
  fn boilterplate() {
    assert_eq!(
      r#"
class  : []
functions:
intToString: public (int) -> string
panic: public <T>(string) -> T
println: public (string) -> unit
stringConcat: public (string, string) -> string
stringToInt: public (string) -> int
methods:

"#
      .trim(),
      create_builtin_module_typing_context().interfaces.get(&rcs("Builtins")).unwrap().to_string()
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
        functions: rc(BTreeMap::new()),
        methods: rc(BTreeMap::from([
          (
            rcs("m1",),
            rc(MemberTypeInformation {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: rc(Type::Unknown(Reason::dummy()))
              }
            })
          ),
          (
            rcs("m2",),
            rc(MemberTypeInformation {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: rc(Type::Unknown(Reason::dummy()))
              }
            })
          )
        ])),
      }
      .to_string()
    );

    let builder = test_builder::create();
    assert_eq!(
      "a:bool, b:(private) bool",
      TypeDefinitionTypingContext {
        is_object: true,
        names: vec![rcs("a"), rcs("b")],
        mappings: HashMap::from([
          (rcs("a"), FieldType { is_public: true, type_: builder.bool_type() }),
          (rcs("b"), FieldType { is_public: false, type_: builder.bool_type() })
        ])
      }
      .to_string()
    );
    assert_eq!(
      "A(bool)",
      TypeDefinitionTypingContext {
        is_object: false,
        names: vec![rcs("A")],
        mappings: HashMap::from([(
          rcs("A"),
          FieldType { is_public: true, type_: builder.bool_type() }
        )])
      }
      .to_string()
    );

    assert_eq!(
      "private a() -> bool",
      MemberTypeInformation::create_private_builtin_function(
        "a",
        vec![],
        builder.bool_type(),
        vec![]
      )
      .1
      .pretty_print("a")
    );
  }

  #[test]
  fn is_subtype_tests() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([(
          rcs("A"),
          rc(InterfaceTypingContext {
            is_concrete: true,
            type_parameters: vec![TypeParameterSignature { name: rcs("T"), bound: None }],
            super_types: vec![builder.general_id_type_unwrapped(
              "B",
              vec![builder.simple_id_type("T"), builder.int_type()],
            )],
            functions: rc(BTreeMap::new()),
            methods: rc(BTreeMap::new()),
          }),
        )]),
      },
    )]);
    let cx = TypingContext::new(
      &global_cx,
      &mut local_cx,
      &mut error_set,
      ModuleReference::dummy(),
      rcs("A"),
      vec![],
    );

    // Non-id lower type
    assert!(!cx.is_subtype(&builder.int_type(), &builder.simple_id_type("B")));
    // Non-existent type
    assert!(!cx.is_subtype(&builder.simple_id_type("B"), &builder.simple_id_type("B")));
    // Type-args length mismatch
    assert!(!cx.is_subtype(&builder.simple_id_type("A"), &builder.simple_id_type("B")));
    // Type-args mismatch
    assert!(!cx.is_subtype(
      &builder.general_id_type("A", vec![builder.int_type()]),
      &builder.general_id_type("B", vec![builder.string_type(), builder.int_type()])
    ));
    assert!(!cx.is_subtype(
      &builder.general_id_type("A", vec![builder.int_type()]),
      &builder.general_id_type("B", vec![builder.string_type(), builder.string_type()])
    ));
    // Good
    assert!(cx.is_subtype(
      &builder.general_id_type("A", vec![builder.string_type()]),
      &builder.general_id_type("B", vec![builder.string_type(), builder.int_type()])
    ));
  }

  #[test]
  fn validate_type_instantiation_tests() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([
          (
            rcs("A"),
            rc(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: rcs("T1"), bound: None },
                TypeParameterSignature {
                  name: rcs("T2"),
                  bound: Some(rc(builder.simple_id_type_unwrapped("B"))),
                },
              ],
              super_types: vec![],
              functions: rc(BTreeMap::new()),
              methods: rc(BTreeMap::new()),
            }),
          ),
          (
            rcs("B"),
            rc(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![],
              super_types: vec![builder.simple_id_type_unwrapped("B")],
              functions: rc(BTreeMap::new()),
              methods: rc(BTreeMap::new()),
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
      rcs("A"),
      vec![
        TypeParameterSignature { name: rcs("TPARAM"), bound: None },
        TypeParameterSignature {
          name: rcs("T2"),
          bound: Some(rc(builder.simple_id_type_unwrapped("A"))),
        },
      ],
    );

    cx.validate_type_instantiation_allow_abstract_types(&builder.int_type());
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.fun_type(vec![builder.int_type()], builder.bool_type()),
    );
    cx.validate_type_instantiation_allow_abstract_types(&Type::Unknown(Reason::dummy()));
    cx.validate_type_instantiation_allow_abstract_types(&builder.simple_id_type("TPARAM"));
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.general_id_type("TPARAM", vec![builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(&builder.simple_id_type("T"));
    cx.validate_type_instantiation_allow_abstract_types(&builder.simple_id_type("A"));
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.general_id_type("A", vec![builder.int_type(), builder.int_type()]),
    );
    cx.validate_type_instantiation_allow_abstract_types(
      &builder.general_id_type("A", vec![builder.int_type(), builder.simple_id_type("B")]),
    );
    cx.validate_type_instantiation_strictly(&builder.simple_id_type("B"));

    let expected_errors = r#"
__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 0, actual: 1.
__DUMMY__.sam:0:0-0:0: [ArityMismatchError]: Incorrect type arguments size. Expected: 2, actual: 0.
__DUMMY__.sam:0:0-0:0: [UnexpectedSubtype]: Expected: subtype of `B`, actual: `int`.
__DUMMY__.sam:0:0-0:0: [UnexpectedTypeKind]: Expected kind: `non-abstract type`, actual: `B`."#
      .trim();
    let actual_errors = cx.error_set.error_messages().join("\n");
    assert_eq!(expected_errors, actual_errors);
  }

  #[test]
  fn get_members_test() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::new(),
        interfaces: BTreeMap::from([
          (
            rcs("A"),
            rc(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              super_types: vec![],
              functions: rc(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
              methods: rc(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  "m1",
                  vec![builder.simple_id_type("A"), builder.simple_id_type("B")],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_builtin_function(
                  "m2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
            }),
          ),
          (
            rcs("B"),
            rc(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![
                TypeParameterSignature { name: rcs("E"), bound: None },
                TypeParameterSignature { name: rcs("F"), bound: None },
              ],
              super_types: vec![],
              functions: rc(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  "f1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
                  "f2",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
              ])),
              methods: rc(BTreeMap::from([
                MemberTypeInformation::create_builtin_function(
                  "m1",
                  vec![],
                  builder.int_type(),
                  vec!["C"],
                ),
                MemberTypeInformation::create_private_builtin_function(
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
      rcs("A"),
      vec![
        TypeParameterSignature {
          name: rcs("TT1"),
          bound: Some(rc(builder.simple_id_type_unwrapped("A"))),
        },
        TypeParameterSignature { name: rcs("TT2"), bound: None },
        TypeParameterSignature {
          name: rcs("TT3"),
          bound: Some(rc(builder.simple_id_type_unwrapped("sdfasdfasfs"))),
        },
      ],
    );

    assert!(cx
      .get_function_type(
        &ModuleReference::ordinary(vec![rcs("A")]),
        &rcs("A"),
        &rcs("f1"),
        Location::dummy()
      )
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("f1"), Location::dummy())
      .is_some());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("f2"), Location::dummy())
      .is_some());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("f3"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("m1"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("m2"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("m3"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("f1"), Location::dummy())
      .is_some());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("f2"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("f3"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("m1"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("m2"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("B"), &rcs("m3"), Location::dummy())
      .is_none());
    assert!(cx
      .get_method_type(&ModuleReference::dummy(), &rcs("B"), &rcs("m2"), vec![], Location::dummy(),)
      .is_none());
    assert!(cx
      .get_method_type(&ModuleReference::dummy(), &rcs("B"), &rcs("m3"), vec![], Location::dummy(),)
      .is_none());
    assert!(cx
      .get_method_type(&ModuleReference::dummy(), &rcs("C"), &rcs("m3"), vec![], Location::dummy(),)
      .is_none());

    assert_eq!(
      "public <C>(int, int) -> int",
      cx.get_method_type(
        &ModuleReference::dummy(),
        &rcs("A"),
        &rcs("m1"),
        vec![builder.int_type(), builder.int_type()],
        Location::dummy(),
      )
      .unwrap()
      .to_string()
    );
    assert_eq!(
      "private <C>() -> int",
      cx.get_function_type(&ModuleReference::dummy(), &rcs("A"), &rcs("f2"), Location::dummy(),)
        .unwrap()
        .to_string()
    );
    assert_eq!(
      "public <C>() -> int",
      cx.get_function_type(&ModuleReference::dummy(), &rcs("TT1"), &rcs("f1"), Location::dummy())
        .unwrap()
        .to_string()
    );

    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("TT2"), &rcs("f1"), Location::dummy())
      .is_none());
    assert!(cx
      .get_function_type(&ModuleReference::dummy(), &rcs("TT3"), &rcs("f1"), Location::dummy())
      .is_none());
  }

  #[test]
  fn resolve_type_definitions_test() {
    let builder = test_builder::create();
    let mut local_cx = empty_local_typing_context();
    let mut error_set = ErrorSet::new();
    let global_cx = HashMap::from([(
      ModuleReference::dummy(),
      ModuleTypingContext {
        type_definitions: BTreeMap::from([
          (
            rcs("A"),
            TypeDefinitionTypingContext {
              is_object: false,
              names: vec![rcs("a"), rcs("b")],
              mappings: HashMap::from([
                (rcs("a"), FieldType { is_public: true, type_: builder.simple_id_type("A") }),
                (rcs("b"), FieldType { is_public: false, type_: builder.simple_id_type("B") }),
              ]),
            },
          ),
          (
            rcs("B"),
            TypeDefinitionTypingContext {
              is_object: true,
              names: vec![],
              mappings: HashMap::new(),
            },
          ),
        ]),
        interfaces: BTreeMap::from([
          (
            rcs("A"),
            rc(InterfaceTypingContext {
              is_concrete: true,
              type_parameters: vec![
                TypeParameterSignature { name: rcs("A"), bound: None },
                TypeParameterSignature { name: rcs("B"), bound: None },
              ],
              super_types: vec![],
              functions: rc(BTreeMap::new()),
              methods: rc(BTreeMap::new()),
            }),
          ),
          (
            rcs("B"),
            rc(InterfaceTypingContext {
              is_concrete: false,
              type_parameters: vec![
                TypeParameterSignature { name: rcs("E"), bound: None },
                TypeParameterSignature { name: rcs("F"), bound: None },
              ],
              super_types: vec![],
              functions: rc(BTreeMap::new()),
              methods: rc(BTreeMap::new()),
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
      rcs("A"),
      vec![],
    );

    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped("A", vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .0
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped("A", vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .0
      .is_empty());
    assert!(cx
      .resolve_type_definition(
        &builder.general_id_type_unwrapped("C", vec![builder.int_type(), builder.int_type()]),
        true,
      )
      .0
      .is_empty());

    let (_, resolved) = cx.resolve_type_definition(
      &builder.general_id_type_unwrapped("A", vec![builder.int_type(), builder.int_type()]),
      false,
    );
    assert_eq!(2, resolved.len());
    let resolved_a = resolved.get(&rcs("a")).unwrap();
    let resolved_b = resolved.get(&rcs("b")).unwrap();
    assert_eq!(true, resolved_a.is_public);
    assert_eq!(false, resolved_b.is_public);
    assert_eq!("int", resolved_a.type_.pretty_print());
    assert_eq!("int", resolved_b.type_.pretty_print());
  }
}
