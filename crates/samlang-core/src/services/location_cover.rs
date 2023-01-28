use crate::{
  ast::{
    source::{expr, Module, Toplevel, Type},
    Location, Position,
  },
  common::PStr,
  ModuleReference,
};
use std::ops::Deref;

pub(super) enum LocationCoverSearchResult<'a> {
  Expression(&'a expr::E),
  ClassName(Location, ModuleReference, PStr),
  ClassMemberName(Location, ModuleReference, PStr, PStr, bool /* is method */),
  TypedName(Location, PStr, &'a Type),
}

fn search_expression(expr: &expr::E, position: Position) -> Option<LocationCoverSearchResult> {
  let found_from_children = match expr {
    expr::E::Literal(_, _) | expr::E::Id(_, _) => None,
    expr::E::ClassFn(e) => {
      if e.class_name.loc.contains_position(position) {
        Some(LocationCoverSearchResult::ClassName(
          e.class_name.loc,
          e.module_reference,
          e.class_name.name,
        ))
      } else if e.fn_name.loc.contains_position(position) {
        Some(LocationCoverSearchResult::ClassMemberName(
          e.fn_name.loc,
          e.module_reference,
          e.class_name.name,
          e.fn_name.name,
          false,
        ))
      } else {
        None
      }
    }
    expr::E::FieldAccess(e) => search_expression(&e.object, position),
    expr::E::MethodAccess(e) => {
      if e.method_name.loc.contains_position(position) {
        if let Type::Id(id_type) = e.object.common().type_.deref() {
          return Some(LocationCoverSearchResult::ClassMemberName(
            e.method_name.loc,
            id_type.module_reference,
            id_type.id,
            e.method_name.name,
            true,
          ));
        }
      }
      search_expression(&e.object, position)
    }
    expr::E::Unary(e) => search_expression(&e.argument, position),
    expr::E::Call(e) => {
      let mut found = search_expression(&e.callee, position);
      for e in &e.arguments {
        if Option::is_some(&found) {
          return found;
        }
        found = search_expression(e, position);
      }
      found
    }
    expr::E::Binary(e) => {
      search_expression(&e.e1, position).or_else(|| search_expression(&e.e2, position))
    }
    expr::E::IfElse(e) => search_expression(&e.condition, position)
      .or_else(|| search_expression(&e.e1, position))
      .or_else(|| search_expression(&e.e2, position)),
    expr::E::Match(e) => {
      let mut found = search_expression(&e.matched, position);
      for case in &e.cases {
        if Option::is_some(&found) {
          return found;
        }
        found = search_expression(&case.body, position);
      }
      found
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters {
        if param.name.loc.contains_position(position) {
          if let Some(t) = &param.annotation {
            return Some(LocationCoverSearchResult::TypedName(param.name.loc, param.name.name, t));
          }
        }
      }
      search_expression(&e.body, position)
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        if let Some(found) = search_expression(&stmt.assigned_expression, position) {
          return Some(found);
        }
        match &stmt.pattern {
          expr::Pattern::Id(pat_loc, n) if pat_loc.contains_position(position) => {
            return Some(LocationCoverSearchResult::TypedName(
              *pat_loc,
              *n,
              &stmt.assigned_expression.common().type_,
            ))
          }
          _ => {}
        };
      }
      if let Some(e) = &e.expression {
        return search_expression(e, position);
      }
      None
    }
  };
  if let Some(e) = found_from_children {
    Some(e)
  } else if expr.loc().contains_position(position) {
    Some(LocationCoverSearchResult::Expression(expr))
  } else {
    None
  }
}

pub(super) fn search_module(
  module_reference: ModuleReference,
  module: &Module,
  position: Position,
) -> Option<LocationCoverSearchResult> {
  for toplevel in &module.toplevels {
    let name = toplevel.name();
    if name.loc.contains_position(position) {
      return Some(LocationCoverSearchResult::ClassName(name.loc, module_reference, name.name));
    }
    for member in toplevel.members_iter() {
      if member.name.loc.contains_position(position) {
        return Some(LocationCoverSearchResult::ClassMemberName(
          member.name.loc,
          module_reference,
          name.name,
          member.name.name,
          member.is_method,
        ));
      }
      for param in member.parameters.iter() {
        if param.name.loc.contains_position(position) {
          return Some(LocationCoverSearchResult::TypedName(
            param.name.loc,
            param.name.name,
            &param.annotation,
          ));
        }
      }
    }
    if let Toplevel::Class(c) = toplevel {
      for member in &c.members {
        if let Some(found) = search_expression(&member.body, position) {
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
      source::{expr, Id, Type, NO_COMMENT_REFERENCE},
      Location, Position, Reason,
    },
    checker::type_check_source_handles,
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
          type_: Rc::new(Type::Unknown(Reason::dummy())),
        },
        type_arguments: vec![],
        object: Box::new(expr::E::Id(
          expr::ExpressionCommon {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            type_: Rc::new(Type::Unknown(Reason::dummy())),
          },
          Id::from(heap.alloc_str("id")),
        )),
        method_name: Id {
          loc: Location {
            module_reference: ModuleReference::dummy(),
            start: Position(10, 10),
            end: Position(10, 20),
          },
          associated_comments: NO_COMMENT_REFERENCE,
          name: heap.alloc_str("meth")
        },
      }),
      Position(10, 15),
    )
    .is_none());
  }

  #[test]
  fn searcher_coverage_test() {
    let heap = &mut Heap::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["foo".to_string()]);
    let r = type_check_source_handles(
      heap,
      vec![(
        mod_ref,
        r#"class Foo(val a: int) {
    function bar(): int = 3
  }

  class Option<T>(None(unit), Some(T)) {
    function none(): Option<int> = Option.None({})
    function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)
    function createSome2(): (int) -> Option<int> = (n) -> Option.Some(n)

    function run(): unit = Option.createSome()(1).matchExample()

    method matchExample(): unit =
      match (this) {
        | None _ -> {}
        | Some a -> {}
      }
  }

  class Obj(val d: int, val e: int) {
    function valExample(): int = {
      val a: int = 1;
      val b = 2;
      val c = 3; // c = 3
      val { e as d } = Obj.init(5, 4); // d = 4
      val f = Obj.init(5, 4); // d = 4
      val g = Obj.init(d, 4); // d = 4
      val _ = f.d;
      // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
      a + b * c / d
    }
  }

  interface Interface

  class Main {
    function identity(a: int): int = a

    function random(): int = {
      val a = 42; // very random
      a
    }

    function oof(): int = 14

    function div(a: int, b: int): int =
      if b == 0 then (
        Builtins.panic("Division by zero is illegal!")
      ) else (
        a / b
      )

    function nestedVal(): int = {
      val a = {
        val b = 4;
        val c = {
          val c = b;
          b
        };
        c
      };
      a + -1
    }

    function main(): unit = Builtins.println(Builtins.intToString(Main.identity(
      Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
    )))
  }"#
          .to_string(),
      )],
    );
    assert!(r.compile_time_errors.is_empty());
    for m in r.checked_sources.values() {
      for i in 0..80 {
        for j in 0..80 {
          super::search_module(mod_ref, m, Position(i, j));
        }
      }
    }
  }
}
