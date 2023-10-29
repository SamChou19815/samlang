use crate::{
  ast::{
    source::{expr, pattern, Module, Toplevel},
    Location, Position,
  },
  checker::type_::{FunctionType, Type},
  ModuleReference,
};
use samlang_heap::PStr;
use std::rc::Rc;

pub(super) enum LocationCoverSearchResult<'a> {
  Expression(&'a expr::E<Rc<Type>>),
  ToplevelName(Location, ModuleReference, PStr),
  PropertyName(Location, ModuleReference, PStr, PStr),
  InterfaceMemberName {
    loc: Location,
    module_reference: ModuleReference,
    class_name: PStr,
    fn_name: PStr,
    is_method: bool,
    type_: Rc<Type>,
  },
  TypedName(Location, PStr, Type),
}

fn search_destructuring_pattern(
  pattern: &pattern::DestructuringPattern<Rc<Type>>,
  position: Position,
) -> Option<LocationCoverSearchResult> {
  match pattern {
    pattern::DestructuringPattern::Tuple(_, patterns) => {
      patterns.iter().find_map(|p| search_destructuring_pattern(&p.pattern, position))
    }
    pattern::DestructuringPattern::Object(_, patterns) => {
      patterns.iter().find_map(|p| search_destructuring_pattern(&p.pattern, position))
    }
    pattern::DestructuringPattern::Id(id, type_) if id.loc.contains_position(position) => {
      Some(LocationCoverSearchResult::TypedName(id.loc, id.name, type_.as_ref().clone()))
    }
    pattern::DestructuringPattern::Id(_, _) | pattern::DestructuringPattern::Wildcard(_) => None,
  }
}

fn search_matching_pattern(
  pattern: &pattern::MatchingPattern<Rc<Type>>,
  position: Position,
) -> Option<LocationCoverSearchResult> {
  match pattern {
    pattern::MatchingPattern::Tuple(_, patterns) => {
      patterns.iter().find_map(|p| search_matching_pattern(&p.pattern, position))
    }
    pattern::MatchingPattern::Object(_, patterns) => {
      patterns.iter().find_map(|p| search_matching_pattern(&p.pattern, position))
    }
    pattern::MatchingPattern::Variant(variant_pattern) => {
      variant_pattern.data_variables.iter().find_map(|(p, _)| search_matching_pattern(p, position))
    }
    pattern::MatchingPattern::Id(id, type_) if id.loc.contains_position(position) => {
      Some(LocationCoverSearchResult::TypedName(id.loc, id.name, type_.as_ref().clone()))
    }
    pattern::MatchingPattern::Id(_, _) | pattern::MatchingPattern::Wildcard(_) => None,
  }
}

fn search_expression(
  expr: &expr::E<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult> {
  if !expr.loc().contains_position(position) {
    return None;
  }
  let found_from_children = match expr {
    expr::E::Literal(_, _) | expr::E::LocalId(_, _) => None,
    expr::E::ClassId(_, mod_ref, id) => {
      // We already checked at the start whether the expression contains the target.
      Some(LocationCoverSearchResult::ToplevelName(id.loc, *mod_ref, id.name))
    }
    expr::E::Tuple(_, expressions) => {
      expressions.iter().find_map(|e| search_expression(e, position, stop_at_call))
    }
    expr::E::FieldAccess(e) => {
      let found = e
        .object
        .common()
        .type_
        .as_nominal()
        .filter(|_| e.field_name.loc.contains_position(position))
        .map(|nominal_type| {
          if nominal_type.is_class_statics {
            LocationCoverSearchResult::InterfaceMemberName {
              loc: e.field_name.loc,
              module_reference: nominal_type.module_reference,
              class_name: nominal_type.id,
              fn_name: e.field_name.name,
              is_method: false,
              type_: e.common.type_.clone(),
            }
          } else {
            LocationCoverSearchResult::PropertyName(
              e.field_name.loc,
              nominal_type.module_reference,
              nominal_type.id,
              e.field_name.name,
            )
          }
        });
      if found.is_some() {
        return found;
      }
      search_expression(&e.object, position, stop_at_call)
    }
    expr::E::MethodAccess(e) => {
      let found = e
        .object
        .common()
        .type_
        .as_nominal()
        .filter(|_| e.method_name.loc.contains_position(position))
        .map(|nominal_type| LocationCoverSearchResult::InterfaceMemberName {
          loc: e.method_name.loc,
          module_reference: nominal_type.module_reference,
          class_name: nominal_type.id,
          fn_name: e.method_name.name,
          is_method: !nominal_type.is_class_statics,
          type_: e.common.type_.clone(),
        });
      if found.is_some() {
        return found;
      }
      search_expression(&e.object, position, stop_at_call)
    }
    expr::E::Unary(e) => search_expression(&e.argument, position, stop_at_call),
    expr::E::Call(e) => {
      let mut found = search_expression(&e.callee, position, stop_at_call);
      for e in &e.arguments {
        if Option::is_some(&found) {
          break;
        }
        found = search_expression(e, position, stop_at_call);
      }
      match &found {
        Some(LocationCoverSearchResult::Expression(expr::E::Call(_))) if stop_at_call => found,
        _ if stop_at_call => None,
        _ => found,
      }
    }
    expr::E::Binary(e) => search_expression(&e.e1, position, stop_at_call)
      .or_else(|| search_expression(&e.e2, position, stop_at_call)),
    expr::E::IfElse(e) => (match e.condition.as_ref() {
      expr::IfElseCondition::Expression(e) => search_expression(e, position, stop_at_call),
      expr::IfElseCondition::Guard(p, e) => search_matching_pattern(p, position)
        .or_else(|| search_expression(e, position, stop_at_call)),
    })
    .or_else(|| search_expression(&e.e1, position, stop_at_call))
    .or_else(|| search_expression(&e.e2, position, stop_at_call)),
    expr::E::Match(e) => {
      let mut found = search_expression(&e.matched, position, stop_at_call);
      for case in &e.cases {
        if Option::is_some(&found) {
          return found;
        }
        found = search_expression(&case.body, position, stop_at_call);
      }
      found
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters {
        if param.name.loc.contains_position(position) {
          if let Some(annot) = &param.annotation {
            return Some(LocationCoverSearchResult::TypedName(
              param.name.loc,
              param.name.name,
              Type::from_annotation(annot),
            ));
          }
        }
      }
      search_expression(&e.body, position, stop_at_call)
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        if let Some(found) = search_expression(&stmt.assigned_expression, position, stop_at_call) {
          return Some(found);
        }
        if let Some(found) = search_destructuring_pattern(&stmt.pattern, position) {
          return Some(found);
        }
      }
      if let Some(e) = &e.expression {
        return search_expression(e, position, stop_at_call);
      }
      None
    }
  };
  if let Some(e) = found_from_children {
    Some(e)
  } else {
    // We already checked at the start whether the expression contains the target.
    Some(LocationCoverSearchResult::Expression(expr))
  }
}

pub(super) fn search_module_locally(
  module_reference: ModuleReference,
  module: &Module<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult> {
  for toplevel in &module.toplevels {
    let name = toplevel.name();
    if !toplevel.loc().contains_position(position) {
      continue;
    }
    if name.loc.contains_position(position) {
      return Some(LocationCoverSearchResult::ToplevelName(name.loc, module_reference, name.name));
    }
    for member in toplevel.members_iter() {
      if !member.loc.contains_position(position) {
        continue;
      }
      if member.name.loc.contains_position(position) {
        return Some(LocationCoverSearchResult::InterfaceMemberName {
          loc: member.name.loc,
          module_reference,
          class_name: name.name,
          fn_name: member.name.name,
          is_method: member.is_method,
          type_: Rc::new(Type::Fn(FunctionType::from_annotation(&member.type_))),
        });
      }
      for param in member.parameters.iter() {
        if param.name.loc.contains_position(position) {
          return Some(LocationCoverSearchResult::TypedName(
            param.name.loc,
            param.name.name,
            Type::from_annotation(&param.annotation),
          ));
        }
      }
    }
    if let Toplevel::Class(c) = toplevel {
      for member in &c.members {
        if !member.decl.loc.contains_position(position) {
          continue;
        }
        if let Some(found) = search_expression(&member.body, position, stop_at_call) {
          return Some(found);
        }
      }
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      source::{expr, Id, NO_COMMENT_REFERENCE},
      Location, Position, Reason,
    },
    builtin_parsed_std_sources,
    checker::{type_::Type, type_check_sources},
    errors::ErrorSet,
    parser::parse_source_module_from_text,
    Heap, ModuleReference,
  };
  use std::rc::Rc;

  #[test]
  fn method_search_coverage_test() {
    let heap = &mut Heap::new();
    assert!(super::search_expression(
      &expr::E::MethodAccess(expr::MethodAccess {
        common: expr::ExpressionCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          type_: Rc::new(Type::Any(Reason::dummy(), false)),
        },
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(expr::E::LocalId(
          expr::ExpressionCommon {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            type_: Rc::new(Type::Any(Reason::dummy(), false)),
          },
          Id::from(heap.alloc_str_for_test("id")),
        )),
        method_name: Id {
          loc: Location {
            module_reference: ModuleReference::DUMMY,
            start: Position(10, 10),
            end: Position(10, 20),
          },
          associated_comments: NO_COMMENT_REFERENCE,
          name: heap.alloc_str_for_test("meth")
        },
      }),
      Position(10, 15),
      false,
    )
    .is_none());
  }

  #[test]
  fn searcher_coverage_test() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["foo".to_string()]);
    let source_code = r#"class Foo(val a: int) {
      function bar(): int = 3
    }

    class Option<T>(None(unit), Some(T)) {
      function none(): Option<int> = Option.None({})
      function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)
      function createSome2(): (int) -> Option<int> = (n) -> Option.Some(n)

      function run(): unit = Option.createSome()(1).matchExample()

      method matchExample(): unit =
        match (this) {
          None(_) -> {}
          Some(a) -> {}
        }
    }

    class Obj(val d: int, val e: int) {
      function valExample(): int = {
        let a: int = 1;
        let b = 2;
        let c = 3; // c = 3
        let { d as _, e as d } = Obj.init(5, 4); // d = 4
        let f = Obj.init(5, 4); // d = 4
        let g = Obj.init(d, 4); // d = 4
        let _ = if let { a as d3 } = Foo.init(5) then {} else {};
        let _ = if let Some(_) = Option.Some(1) then {} else {};
        let _ = if let [_, _] = [1,2] then {} else {};
        let _ = f.d;
        let [h, i] = [111, 122];
        // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
        a + b * c / d
      }
    }

    interface Interface

    class Main {
      function identity(a: int): int = a

      function random(): int = {
        let a = 42; // very random
        a
      }

      function oof(): int = 14

      function div(a: int, b: int): int =
        if b == 0 then (
          Process.panic("Division by zero is illegal!")
        ) else (
          a / b
        )

      function nestedVal(): int = {
        let a = {
          let b = 4;
          let c = {
            let c = b;
            b
          };
          c
        };
        a + -1
      }

      function main(): unit = Process.println(Str.fromInt(Main.identity(
        Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
      )))
    }"#;
    let parsed = parse_source_module_from_text(source_code, mod_ref, heap, &mut error_set);
    let mut sources = builtin_parsed_std_sources(heap);
    sources.insert(mod_ref, parsed);
    let (checked_sources, _) = type_check_sources(&sources, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame(heap));
    for m in checked_sources.values() {
      for (i, line) in source_code.lines().enumerate() {
        let i = i as i32;
        let mut l = 0;
        for (j, _) in line.char_indices() {
          let j = j as i32;
          l += 1;
          super::search_module_locally(mod_ref, m, Position(i, j), true);
          super::search_module_locally(mod_ref, m, Position(i, j), false);
        }
        super::search_module_locally(mod_ref, m, Position(i, l), true);
        super::search_module_locally(mod_ref, m, Position(i, l), false);
      }
    }
  }
}
