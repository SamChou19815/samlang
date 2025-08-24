use samlang_ast::{
  Location, Position, Reason,
  source::{Module, Toplevel, annotation, expr, pattern},
};
use samlang_checker::type_::{FunctionType, NominalType, Type};
use samlang_heap::{ModuleReference, PStr};
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
  TypedName(Location, Type, bool), // bool: binding
}

fn search_matching_pattern(
  pattern: &'_ pattern::MatchingPattern<Rc<Type>>,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  match pattern {
    pattern::MatchingPattern::Tuple(pattern::TuplePattern { elements, .. }) => {
      elements.iter().find_map(|p| search_matching_pattern(&p.pattern, position))
    }
    pattern::MatchingPattern::Object { elements, .. } => {
      elements.iter().find_map(|p| search_matching_pattern(&p.pattern, position))
    }
    pattern::MatchingPattern::Variant(variant_pattern) => variant_pattern
      .data_variables
      .iter()
      .flat_map(|it| &it.elements)
      .find_map(|p| search_matching_pattern(&p.pattern, position)),
    pattern::MatchingPattern::Id(id, type_) if id.loc.contains_position(position) => {
      Some(LocationCoverSearchResult::TypedName(id.loc, type_.as_ref().clone(), true))
    }
    pattern::MatchingPattern::Id(_, _) | pattern::MatchingPattern::Wildcard { .. } => None,
  }
}

fn search_parenthesized_expression_list(
  expr_list: &'_ expr::ParenthesizedExpressionList<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult<'_>> {
  expr_list.expressions.iter().find_map(|e| search_expression(e, position, stop_at_call))
}

fn search_optional_type_parameters(
  tparams_opt: Option<&'_ annotation::TypeParameters>,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  tparams_opt.iter().flat_map(|it| &it.parameters).find_map(|tparam| {
    if tparam.name.loc.contains_position(position) {
      return Some(LocationCoverSearchResult::TypedName(
        tparam.name.loc,
        Type::Generic(Reason::new(tparam.name.loc, Some(tparam.name.loc)), tparam.name.name),
        true,
      ));
    }
    search_optional_id_annotation(tparam.bound.as_ref(), position)
  })
}

fn search_optional_type_arguments(
  targs_opt: Option<&'_ annotation::TypeArguments>,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  targs_opt.iter().flat_map(|it| &it.arguments).find_map(|it| search_annotation(it, position))
}

fn search_id_annotation(
  id_annot: &'_ annotation::Id,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  if id_annot.id.loc.contains_position(position) {
    return Some(LocationCoverSearchResult::TypedName(
      id_annot.id.loc,
      Type::Nominal(NominalType::from_annotation(id_annot)),
      false,
    ));
  }
  search_optional_type_arguments(id_annot.type_arguments.as_ref(), position)
}

fn search_optional_id_annotation(
  id_annot_opt: Option<&'_ annotation::Id>,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  if let Some(id_annot) = id_annot_opt { search_id_annotation(id_annot, position) } else { None }
}

fn search_annotation(
  annotation: &'_ annotation::T,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  match annotation {
    annotation::T::Primitive(_, _, _) => None,
    annotation::T::Id(id_annot) => search_id_annotation(id_annot, position),
    annotation::T::Generic(loc, _) => {
      if loc.contains_position(position) {
        Some(LocationCoverSearchResult::TypedName(*loc, Type::from_annotation(annotation), false))
      } else {
        None
      }
    }
    annotation::T::Fn(fn_annot) => fn_annot
      .parameters
      .annotations
      .iter()
      .find_map(|it| search_annotation(it, position))
      .or_else(|| search_annotation(&fn_annot.return_type, position)),
  }
}

fn search_optional_annotation(
  annotation_opt: Option<&'_ annotation::T>,
  position: Position,
) -> Option<LocationCoverSearchResult<'_>> {
  if let Some(annot) = annotation_opt { search_annotation(annot, position) } else { None }
}

fn search_if_else(
  if_else: &'_ expr::IfElse<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult<'_>> {
  (match if_else.condition.as_ref() {
    expr::IfElseCondition::Expression(e) => search_expression(e, position, stop_at_call),
    expr::IfElseCondition::Guard(p, e) => {
      search_matching_pattern(p, position).or_else(|| search_expression(e, position, stop_at_call))
    }
  })
  .or_else(|| search_block(&if_else.e1, position, stop_at_call))
  .or_else(|| search_if_else_or_block(&if_else.e2, position, stop_at_call))
}

fn search_if_else_or_block(
  if_else_or_block: &'_ expr::IfElseOrBlock<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult<'_>> {
  match if_else_or_block {
    expr::IfElseOrBlock::IfElse(e) => search_if_else(e, position, stop_at_call),
    expr::IfElseOrBlock::Block(e) => search_block(e, position, stop_at_call),
  }
}

fn search_block(
  block: &'_ expr::Block<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult<'_>> {
  for stmt in &block.statements {
    if let Some(found) = search_optional_annotation(stmt.annotation.as_ref(), position) {
      return Some(found);
    }
    if let Some(found) = search_expression(&stmt.assigned_expression, position, stop_at_call) {
      return Some(found);
    }
    if let Some(found) = search_matching_pattern(&stmt.pattern, position) {
      return Some(found);
    }
  }
  if let Some(e) = &block.expression {
    return search_expression(e, position, stop_at_call);
  }
  None
}

fn search_expression(
  expr: &'_ expr::E<Rc<Type>>,
  position: Position,
  stop_at_call: bool,
) -> Option<LocationCoverSearchResult<'_>> {
  if !expr.loc().contains_position(position) {
    return None;
  }
  let found_from_children = match expr {
    expr::E::Literal(_, _) => None,
    expr::E::LocalId(common, id) => {
      Some(LocationCoverSearchResult::TypedName(id.loc, common.type_.as_ref().clone(), false))
    }
    expr::E::ClassId(_, mod_ref, id) => {
      // We already checked at the start whether the expression contains the target.
      Some(LocationCoverSearchResult::ToplevelName(id.loc, *mod_ref, id.name))
    }
    expr::E::Tuple(_, expressions) => {
      search_parenthesized_expression_list(expressions, position, stop_at_call)
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
        })
        .or_else(|| search_optional_type_arguments(e.explicit_type_arguments.as_ref(), position));
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
        })
        .or_else(|| search_optional_type_arguments(e.explicit_type_arguments.as_ref(), position));
      if found.is_some() {
        return found;
      }
      search_expression(&e.object, position, stop_at_call)
    }
    expr::E::Unary(e) => search_expression(&e.argument, position, stop_at_call),
    expr::E::Call(e) => {
      let mut found = search_expression(&e.callee, position, stop_at_call);
      for e in &e.arguments.expressions {
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
    expr::E::IfElse(e) => search_if_else(e, position, stop_at_call),
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
      for param in &e.parameters.parameters {
        if param.name.loc.contains_position(position) {
          return if let Some(annot) = &param.annotation {
            Some(LocationCoverSearchResult::TypedName(
              param.name.loc,
              Type::from_annotation(annot),
              true,
            ))
          } else {
            Some(LocationCoverSearchResult::TypedName(
              param.name.loc,
              param.type_.as_ref().clone(),
              false,
            ))
          };
        }
        if let Some(found) = search_optional_annotation(param.annotation.as_ref(), position) {
          return Some(found);
        }
      }
      search_expression(&e.body, position, stop_at_call)
    }
    expr::E::Block(e) => search_block(e, position, stop_at_call),
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
) -> Option<LocationCoverSearchResult<'_>> {
  for toplevel in &module.toplevels {
    let name = toplevel.name();
    if !toplevel.loc().contains_position(position) {
      continue;
    }
    if name.loc.contains_position(position) {
      return Some(LocationCoverSearchResult::ToplevelName(name.loc, module_reference, name.name));
    }
    if let Some(found) = search_optional_type_parameters(toplevel.type_parameters(), position) {
      return Some(found);
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
          type_: Rc::new(Type::Fn(FunctionType::from_function(member))),
        });
      }
      if let Some(found) =
        search_optional_type_parameters(member.type_parameters.as_ref(), position)
      {
        return Some(found);
      }
      for param in member.parameters.parameters.iter() {
        if param.name.loc.contains_position(position) {
          return Some(LocationCoverSearchResult::TypedName(
            param.name.loc,
            Type::from_annotation(&param.annotation),
            true,
          ));
        }
        if let Some(found) = search_annotation(&param.annotation, position) {
          return Some(found);
        }
      }
      if let Some(found) = search_annotation(&member.return_type, position) {
        return Some(found);
      }
    }
    if let Toplevel::Class(c) = toplevel {
      for member in &c.members.members {
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
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    Location, Position, Reason,
    source::{Id, NO_COMMENT_REFERENCE, expr},
  };
  use samlang_heap::{Heap, ModuleReference};
  use std::rc::Rc;

  #[test]
  fn method_search_coverage_test() {
    let heap = &mut Heap::new();
    assert!(
      super::search_expression(
        &expr::E::MethodAccess(expr::MethodAccess {
          common: expr::ExpressionCommon {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            type_: Rc::new(samlang_checker::type_::Type::Any(Reason::dummy(), false)),
          },
          explicit_type_arguments: None,
          inferred_type_arguments: Vec::new(),
          object: Box::new(expr::E::LocalId(
            expr::ExpressionCommon {
              loc: Location::dummy(),
              associated_comments: NO_COMMENT_REFERENCE,
              type_: Rc::new(samlang_checker::type_::Type::Any(Reason::dummy(), false)),
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
      .is_none()
    );
  }

  #[test]
  fn searcher_coverage_test() {
    let heap = &mut Heap::new();
    let mut error_set = samlang_errors::ErrorSet::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["foo".to_string()]);
    let source_code = r#"class Foo(val a: int) {
      function bar(): int = 3
    }

    class Option<T>(None(unit), Some(T)) {
      function none(): Option<int> = Option.None({})
      function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)
      function createSome2(): (int) -> Option<int> = (n) -> Option.Some(n)
      function createSome3(): (Obj) -> Option<Obj> = (n: Obj) -> Option.Some(n)

      function run(): unit = Option.createSome()(1).matchExample()

      method matchExample(): unit =
        match (this) {
          None(_) -> {},
          Some(a) -> {},
        }
    }

    class Obj(val d: int, val e: int) {
      function valExample(): int = {
        let a: int = 1;
        let b = 2;
        let c = 3; // c = 3
        let { d as _, e as d }: Obj = Obj.init(5, 4); // d = 4
        let f = Obj.init(5, 4); // d = 4
        let g = Obj.init(d, 4); // d = 4
        let _ = if let Some({ a as d3 }) = Option.Some(Foo.init(5)) {} else {};
        let _ = if let Some(_) = Option.Some(1) {} else {};
        let _ = if let Some((_, _)) = Option.Some((1,2)) {} else {};
        let _ = f.d;
        let (h, i) = (111, 122);
        // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
        a + b * c / d
      }
    }

    interface Interface {}

    class Main {
      function identity(a: int): int = a

      function random(): int = {
        let a = 42; // very random
        a
      }

      function oof(): int = 14

      function div(a: int, b: int): int =
        if b == 0 {
          Process.panic("Division by zero is illegal!")
        } else {
          a / b
        }

      function nestedVal(): int = {
        let a: int = {
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
    let parsed =
      samlang_parser::parse_source_module_from_text(source_code, mod_ref, heap, &mut error_set);
    let mut sources = samlang_parser::builtin_parsed_std_sources_for_tests(heap);
    sources.insert(mod_ref, parsed);
    let (checked_sources, _) = samlang_checker::type_check_sources(&sources, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(heap));
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
