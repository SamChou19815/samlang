use crate::{
  ast::{
    source::{
      expr, pattern, AnnotatedId, ClassDefinition, ClassMemberDeclaration, ClassMemberDefinition,
      Id, Module, OptionallyAnnotatedId, Toplevel,
    },
    Location,
  },
  checker::{perform_ssa_analysis_on_module, SsaAnalysisResult},
  errors::ErrorSet,
};
use samlang_heap::{ModuleReference, PStr};
use std::rc::Rc;

pub(super) struct DefinitionAndUses {
  pub(super) definition_location: Location,
  pub(super) use_locations: Vec<Location>,
}

impl DefinitionAndUses {
  pub(super) fn all_locations(self) -> Vec<Location> {
    let DefinitionAndUses { definition_location, mut use_locations } = self;
    use_locations.push(definition_location);
    use_locations
  }
}

pub(super) struct VariableDefinitionLookup(SsaAnalysisResult);

impl VariableDefinitionLookup {
  pub(super) fn new(
    module_reference: ModuleReference,
    module: &Module<()>,
  ) -> VariableDefinitionLookup {
    let mut error_set = ErrorSet::new();
    VariableDefinitionLookup(perform_ssa_analysis_on_module(
      module_reference,
      module,
      &mut error_set,
    ))
  }

  pub(super) fn find_all_definition_and_uses(
    &self,
    location: &Location,
  ) -> Option<DefinitionAndUses> {
    let def_loc = self.0.use_define_map.get(location).unwrap_or(location);
    let mut use_locations = self.0.def_to_use_map.get(def_loc)?.clone();
    use_locations.sort();
    Some(DefinitionAndUses { definition_location: *def_loc, use_locations })
  }
}

fn get_relevant_in_ranges(
  location: &Location,
  DefinitionAndUses { definition_location, use_locations }: &DefinitionAndUses,
) -> Vec<Location> {
  let mut locations = vec![];
  if location.contains(definition_location) {
    locations.push(*definition_location);
  }
  for use_loc in use_locations {
    if location.contains(use_loc) {
      locations.push(*use_loc);
    }
  }
  locations
}

fn mod_id(id: &Id, new_name: PStr) -> Id {
  Id { loc: id.loc, associated_comments: id.associated_comments, name: new_name }
}

fn mod_def_id(id: &Id, definition_and_uses: &DefinitionAndUses, new_name: PStr) -> Id {
  if id.loc.eq(&definition_and_uses.definition_location) {
    mod_id(id, new_name)
  } else {
    *id
  }
}

fn apply_matching_pattern_renaming(
  pattern: &pattern::MatchingPattern<()>,
  definition_and_uses: &DefinitionAndUses,
  new_name: PStr,
) -> pattern::MatchingPattern<()> {
  match pattern {
    pattern::MatchingPattern::Tuple(l, names) => pattern::MatchingPattern::Tuple(
      *l,
      names
        .iter()
        .map(|pattern::TuplePatternElement { pattern, type_ }| pattern::TuplePatternElement {
          pattern: Box::new(apply_matching_pattern_renaming(
            pattern,
            definition_and_uses,
            new_name,
          )),
          type_: *type_,
        })
        .collect(),
    ),
    pattern::MatchingPattern::Object(l, names) => pattern::MatchingPattern::Object(
      *l,
      names
        .iter()
        .map(
          |pattern::ObjectPatternElement {
             loc,
             field_order,
             field_name,
             pattern,
             shorthand: _,
             type_,
           }| {
            let pattern =
              Box::new(apply_matching_pattern_renaming(pattern, definition_and_uses, new_name));
            let shorthand = matches!(
              pattern.as_ref(),
              pattern::MatchingPattern::Id(id, _) if id.name.eq(&field_name.name),
            );
            pattern::ObjectPatternElement {
              loc: *loc,
              field_order: *field_order,
              field_name: *field_name,
              pattern,
              shorthand,
              type_: *type_,
            }
          },
        )
        .collect(),
    ),
    pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc,
      tag_order,
      tag,
      data_variables,
      type_: (),
    }) => pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc: *loc,
      tag_order: *tag_order,
      tag: *tag,
      data_variables: data_variables
        .iter()
        .map(|(p, ())| (apply_matching_pattern_renaming(p, definition_and_uses, new_name), ()))
        .collect(),
      type_: (),
    }),
    pattern::MatchingPattern::Id(id, ()) => {
      let name =
        if id.loc.eq(&definition_and_uses.definition_location) { new_name } else { id.name };
      pattern::MatchingPattern::Id(
        Id { loc: id.loc, associated_comments: id.associated_comments, name },
        (),
      )
    }
    pattern::MatchingPattern::Wildcard(_) => pattern.clone(),
  }
}

fn apply_expr_renaming(
  expr: &expr::E<()>,
  definition_and_uses: &DefinitionAndUses,
  new_name: PStr,
) -> expr::E<()> {
  let relevant_in_range = get_relevant_in_ranges(&expr.loc(), definition_and_uses);
  if relevant_in_range.is_empty() {
    return expr.clone();
  }
  match expr {
    expr::E::Literal(_, _) | expr::E::ClassId(_, _, _) => panic!(),
    expr::E::LocalId(common, old_id) => expr::E::LocalId(common.clone(), mod_id(old_id, new_name)),
    expr::E::Tuple(common, expressions) => expr::E::Tuple(
      common.clone(),
      expressions.iter().map(|e| apply_expr_renaming(e, definition_and_uses, new_name)).collect(),
    ),
    expr::E::FieldAccess(e) => expr::E::FieldAccess(expr::FieldAccess {
      common: e.common.clone(),
      explicit_type_arguments: e.explicit_type_arguments.clone(),
      inferred_type_arguments: e.inferred_type_arguments.clone(),
      object: Box::new(apply_expr_renaming(&e.object, definition_and_uses, new_name)),
      field_name: e.field_name,
      field_order: e.field_order,
    }),
    expr::E::MethodAccess(e) => expr::E::MethodAccess(expr::MethodAccess {
      common: e.common.clone(),
      explicit_type_arguments: e.explicit_type_arguments.clone(),
      inferred_type_arguments: e.inferred_type_arguments.clone(),
      object: Box::new(apply_expr_renaming(&e.object, definition_and_uses, new_name)),
      method_name: e.method_name,
    }),
    expr::E::Unary(e) => expr::E::Unary(expr::Unary {
      common: e.common.clone(),
      operator: e.operator,
      argument: Box::new(apply_expr_renaming(&e.argument, definition_and_uses, new_name)),
    }),
    expr::E::Call(e) => expr::E::Call(expr::Call {
      common: e.common.clone(),
      callee: Box::new(apply_expr_renaming(&e.callee, definition_and_uses, new_name)),
      arguments: e
        .arguments
        .iter()
        .map(|e| apply_expr_renaming(e, definition_and_uses, new_name))
        .collect(),
    }),
    expr::E::Binary(e) => expr::E::Binary(expr::Binary {
      common: e.common.clone(),
      operator_preceding_comments: e.operator_preceding_comments,
      operator: e.operator,
      e1: Box::new(apply_expr_renaming(&e.e1, definition_and_uses, new_name)),
      e2: Box::new(apply_expr_renaming(&e.e2, definition_and_uses, new_name)),
    }),
    expr::E::IfElse(e) => expr::E::IfElse(expr::IfElse {
      common: e.common.clone(),
      condition: Box::new(match e.condition.as_ref() {
        expr::IfElseCondition::Expression(e) => {
          expr::IfElseCondition::Expression(apply_expr_renaming(e, definition_and_uses, new_name))
        }
        expr::IfElseCondition::Guard(p, e) => expr::IfElseCondition::Guard(
          apply_matching_pattern_renaming(p, definition_and_uses, new_name),
          apply_expr_renaming(e, definition_and_uses, new_name),
        ),
      }),
      e1: Box::new(apply_expr_renaming(&e.e1, definition_and_uses, new_name)),
      e2: Box::new(apply_expr_renaming(&e.e2, definition_and_uses, new_name)),
    }),
    expr::E::Match(e) => expr::E::Match(expr::Match {
      common: e.common.clone(),
      matched: Box::new(apply_expr_renaming(&e.matched, definition_and_uses, new_name)),
      cases: e
        .cases
        .iter()
        .map(|expr::VariantPatternToExpression { loc, tag, tag_order, data_variables, body }| {
          expr::VariantPatternToExpression {
            loc: *loc,
            tag: *tag,
            tag_order: *tag_order,
            data_variables: data_variables
              .iter()
              .map(|dv| {
                dv.as_ref().map(|(id, t)| (mod_def_id(id, definition_and_uses, new_name), *t))
              })
              .collect(),
            body: Box::new(apply_expr_renaming(body, definition_and_uses, new_name)),
          }
        })
        .collect(),
    }),
    expr::E::Lambda(e) => expr::E::Lambda(expr::Lambda {
      common: e.common.clone(),
      parameters: e
        .parameters
        .iter()
        .map(|OptionallyAnnotatedId { name, type_, annotation }| OptionallyAnnotatedId {
          name: mod_def_id(name, definition_and_uses, new_name),
          type_: *type_,
          annotation: annotation.clone(),
        })
        .collect(),
      captured: e.captured.clone(),
      body: Box::new(apply_expr_renaming(&e.body, definition_and_uses, new_name)),
    }),
    expr::E::Block(e) => expr::E::Block(expr::Block {
      common: e.common.clone(),
      statements: e
        .statements
        .iter()
        .map(
          |expr::DeclarationStatement {
             loc,
             associated_comments,
             pattern,
             annotation,
             assigned_expression,
           }| expr::DeclarationStatement {
            loc: *loc,
            associated_comments: *associated_comments,
            pattern: apply_matching_pattern_renaming(pattern, definition_and_uses, new_name),
            annotation: annotation.clone(),
            assigned_expression: Box::new(apply_expr_renaming(
              assigned_expression,
              definition_and_uses,
              new_name,
            )),
          },
        )
        .collect(),
      expression: e
        .expression
        .as_ref()
        .map(|e| Box::new(apply_expr_renaming(e, definition_and_uses, new_name))),
    }),
  }
}
pub(super) fn apply_renaming(
  Module { comment_store, imports, toplevels, trailing_comments }: &Module<()>,
  definition_and_uses: &DefinitionAndUses,
  new_name: PStr,
) -> Module<()> {
  Module {
    comment_store: comment_store.clone(),
    imports: imports.clone(),
    toplevels: toplevels
      .iter()
      .map(|toplevel| match toplevel {
        Toplevel::Interface(i) => Toplevel::Interface(i.clone()),
        Toplevel::Class(c) => Toplevel::Class(ClassDefinition {
          loc: c.loc,
          associated_comments: c.associated_comments,
          private: c.private,
          name: c.name,
          type_parameters: c.type_parameters.clone(),
          extends_or_implements_nodes: c.extends_or_implements_nodes.clone(),
          type_definition: c.type_definition.clone(),
          members: c
            .members
            .iter()
            .map(
              |ClassMemberDefinition {
                 decl:
                   ClassMemberDeclaration {
                     loc,
                     associated_comments,
                     is_public,
                     is_method,
                     name,
                     type_parameters,
                     type_,
                     parameters,
                   },
                 body,
               }| {
                ClassMemberDefinition {
                  decl: ClassMemberDeclaration {
                    loc: *loc,
                    associated_comments: *associated_comments,
                    is_public: *is_public,
                    is_method: *is_method,
                    name: *name,
                    type_parameters: type_parameters.clone(),
                    type_: type_.clone(),
                    parameters: Rc::new(
                      parameters
                        .iter()
                        .map(|AnnotatedId { name, type_, annotation }| AnnotatedId {
                          name: mod_def_id(name, definition_and_uses, new_name),
                          type_: *type_,
                          annotation: annotation.clone(),
                        })
                        .collect(),
                    ),
                  },
                  body: apply_expr_renaming(body, definition_and_uses, new_name),
                }
              },
            )
            .collect(),
        }),
      })
      .collect(),
    trailing_comments: *trailing_comments,
  }
}

#[cfg(test)]
mod tests {
  use super::{apply_expr_renaming, apply_renaming, DefinitionAndUses, VariableDefinitionLookup};
  use crate::{
    ast::{
      source::{expr, Id, Literal, Module},
      Location, Position,
    },
    errors::ErrorSet,
    parser::parse_source_module_from_text,
    printer,
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, ModuleReference, PStr};

  #[should_panic]
  #[test]
  fn coverage_booster_tests() {
    apply_expr_renaming(
      &expr::E::MethodAccess(expr::MethodAccess {
        common: expr::ExpressionCommon::dummy(()),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(expr::E::Literal(expr::ExpressionCommon::dummy(()), Literal::Int(0))),
        method_name: Id::from(PStr::LOWER_A),
      }),
      &DefinitionAndUses {
        definition_location: Location::dummy(),
        use_locations: vec![Location::dummy()],
      },
      PStr::LOWER_A,
    );
  }

  fn parse(source: &str) -> (Heap, Module<()>) {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let module =
      parse_source_module_from_text(source, ModuleReference::DUMMY, &mut heap, &mut error_set);
    assert!(!error_set.has_errors());
    (heap, module)
  }

  fn new_lookup(module: Module<()>) -> VariableDefinitionLookup {
    VariableDefinitionLookup::new(ModuleReference::DUMMY, &module)
  }

  fn prepare_lookup(source: &str) -> (Heap, VariableDefinitionLookup) {
    let (heap, module) = parse(source);
    let lookup = new_lookup(module);
    (heap, lookup)
  }

  fn loc_to_string(heap: &Heap, location: &Location) -> String {
    let s = location.pretty_print(heap);
    s.chars().skip(s.chars().position(|c| c == ':').unwrap() + 1).collect()
  }

  fn query(
    heap: &Heap,
    lookup: &VariableDefinitionLookup,
    location: Location,
  ) -> Option<(String, Vec<String>)> {
    let DefinitionAndUses { definition_location, use_locations } =
      lookup.find_all_definition_and_uses(&location)?;
    Some((
      loc_to_string(heap, &definition_location),
      use_locations.iter().map(|l| loc_to_string(heap, l)).collect(),
    ))
  }

  #[test]
  fn basic_test() {
    let (heap, lookup) = prepare_lookup(
      r#"class Main {
function test(a: int, b: bool): unit = { }
}

interface Foo {}
"#,
    );
    lookup.find_all_definition_and_uses(&Location::from_pos(1, 14, 1, 15)).unwrap().all_locations();
    assert!(query(&heap, &lookup, Location::dummy()).is_none());
  }

  fn assert_lookup(
    heap: &Heap,
    lookup: &VariableDefinitionLookup,
    location: Location,
    expected: (&str, Vec<&str>),
  ) {
    let (actual_def_loc, actual_use_locs) = query(heap, lookup, location).unwrap();
    assert_eq!(expected.0, actual_def_loc);
    assert_eq!(expected.1, actual_use_locs);
  }

  #[test]
  fn lookup_tests() {
    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let {f, g as h} = Main.init(3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y * 3 > h then panic(f) else println(h);
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#;
    let (heap, lookup) = prepare_lookup(source);

    assert_lookup(
      &heap,
      &lookup,
      Location::from_pos(3, 12, 3, 13),
      ("3:17-3:18", vec!["3:17-3:18", "4:13-4:14"]),
    );
    assert_lookup(&heap, &lookup, Location::from_pos(3, 8, 3, 9), ("4:9-4:10", vec!["4:9-4:10"]));
    assert_lookup(
      &heap,
      &lookup,
      Location::from_pos(7, 12, 7, 13),
      ("6:10-6:11", vec!["6:10-6:11", "8:13-8:14", "9:57-9:58"]),
    );
    assert_lookup(
      &heap,
      &lookup,
      Location::from_pos(7, 16, 7, 17),
      (
        "6:18-6:19",
        vec!["6:18-6:19", "7:24-7:25", "8:17-8:18", "9:44-9:45", "9:73-9:74", "10:23-10:24"],
      ),
    );
    assert_lookup(
      &heap,
      &lookup,
      Location::from_pos(8, 22, 8, 23),
      ("9:23-9:24", vec!["9:23-9:24", "9:36-9:37"]),
    );
    assert_lookup(
      &heap,
      &lookup,
      Location::from_pos(11, 18, 11, 20),
      ("12:12-12:14", vec!["12:12-12:14", "12:19-12:21"]),
    );
  }

  #[test]
  fn rename_test_1() {
    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let c = a.foo;
  }
}

interface Foo {}
"#;
    let (mut heap, lookup) = prepare_lookup(source);
    let (_, parsed) = parse(source);
    let renamed = apply_renaming(
      &parsed,
      &lookup.find_all_definition_and_uses(&Location::from_pos(3, 12, 3, 13)).unwrap(),
      heap.alloc_str_for_test("renAmeD"),
    );
    assert_eq!(
      r#"class Main {
  function test(renAmeD: int, b: bool): unit = {
    let c = renAmeD.foo;
  }
}

interface Foo
"#,
      printer::pretty_print_source_module(&heap, 60, &renamed)
    );
  }

  fn assert_correctly_rewritten(
    source: &str,
    lookup: &VariableDefinitionLookup,
    location: Location,
    expected: &str,
  ) {
    let (mut heap, parsed) = parse(source);
    let renamed = apply_renaming(
      &parsed,
      &lookup.find_all_definition_and_uses(&location).unwrap(),
      heap.alloc_str_for_test("renAmeD"),
    );
    assert_eq!(expected, printer::pretty_print_source_module(&heap, 60, &renamed));
  }

  #[test]
  fn rename_test_2() {
    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let { e as d3, f } = Obj.init(5, 4) then 1 else 2;
  }
}"#;
    let (_, lookup) = prepare_lookup(source);
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 26, 3, 28),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let { e as renAmeD, f } = Obj.init(
      5,
      4
    ) then {
      1
    } else {
      2
    };
  }
}
"#,
    );

    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let { renAmeD as d3 } = Obj.init(5, 4) then 1 else 2;
  }
}"#;
    let (_, lookup) = prepare_lookup(source);
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 32, 3, 34),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let { renAmeD } = Obj.init(5, 4) then {
      1
    } else {
      2
    };
  }
}
"#,
    );

    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let Some(v) = Option.Some(1) then 1 else 2;
  }
}"#;
    let (_, lookup) = prepare_lookup(source);
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 24, 3, 25),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let Some(renAmeD) = Option.Some(1) then {
      1
    } else {
      2
    };
  }
}
"#,
    );

    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let (v, _) = (1, 2) then 1 else 2;
  }
}"#;
    let (_, lookup) = prepare_lookup(source);
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 20, 3, 21),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let _ = if let (renAmeD, _) = (1, 2) then 1 else 2;
  }
}
"#,
    );
  }

  #[test]
  fn rename_test_3() {
    let source = r#"
class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let {f, g as h} = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then panic(f) else println(h);
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}"#;
    let (_, lookup) = prepare_lookup(source);

    assert!(lookup
      .find_all_definition_and_uses(&Location {
        module_reference: ModuleReference::ROOT,
        start: Position(0, 0),
        end: Position(0, 0)
      })
      .is_none());
    assert!(lookup
      .find_all_definition_and_uses(&Location {
        module_reference: ModuleReference::DUMMY,
        start: Position(0, 0),
        end: Position(0, 0)
      })
      .is_none());

    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 8, 3, 9),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let renAmeD = a;
    let g = 3;
    let { f, g as h } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(3, 12, 3, 13),
      r#"class Main {
  function test(renAmeD: int, b: bool): unit = {
    let c = renAmeD;
    let g = 3;
    let { f, g as h } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(5, 35, 5, 36),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let renAmeD = 3;
    let { f, g as h } = Main.init(3, renAmeD);
    let (i, j) = (3, renAmeD);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(8, 12, 8, 13),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let { f as renAmeD, g as h } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = renAmeD + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then {
      panic(renAmeD)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(8, 16, 8, 17),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let { f, g as renAmeD } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(renAmeD);
    let _ = f + renAmeD;
    let lambda1 = (
      x,
      y
    ) -> if x + y + i + j * 3 > renAmeD then {
      panic(f)
    } else {
      println(renAmeD)
    };
    match lambda1(3, !renAmeD) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(9, 22, 9, 23),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let { f, g as h } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (
      x,
      renAmeD
    ) -> if x + renAmeD + i + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(9, 39, 9, 40),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let { f, g as h } = Main.init(3, g);
    let (renAmeD, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (
      x,
      y
    ) -> if x + y + renAmeD + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(dd) -> dd,
    }
  }
}
"#,
    );
    assert_correctly_rewritten(
      source,
      &lookup,
      Location::from_pos(12, 18, 12, 20),
      r#"class Main {
  function test(a: int, b: bool): unit = {
    let c = a;
    let g = 3;
    let { f, g as h } = Main.init(3, g);
    let (i, j) = (3, g);
    let _ = Obj.Tagged(h);
    let _ = f + h;
    let lambda1 = (x, y) -> if x + y + i + j * 3 > h then {
      panic(f)
    } else {
      println(h)
    };
    match lambda1(3, !h) {
      None(_) -> 1.d,
      Some(renAmeD) -> renAmeD,
    }
  }
}
"#,
    );
  }
}
