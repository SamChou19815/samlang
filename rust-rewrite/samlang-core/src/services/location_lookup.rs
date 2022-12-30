use crate::{
  ast::{
    source::{expr, Id, IdType, Module, Toplevel, Type},
    Location, ModuleReference, Position, Reason,
  },
  common::{rc, rc_string, rcs},
};
use std::collections::HashMap;

pub(super) struct LocationLookup<E>(HashMap<ModuleReference, HashMap<Location, E>>);

impl<E> LocationLookup<E> {
  pub(super) fn new() -> LocationLookup<E> {
    LocationLookup(HashMap::new())
  }

  pub(super) fn get(&self, module_reference: &ModuleReference, position: Position) -> Option<&E> {
    let location = self.get_best_location(module_reference, position)?;
    self.0.get(&location.module_reference).unwrap().get(location)
  }

  pub(super) fn set(&mut self, location: Location, entity: E) {
    if let Some(local_map) = self.0.get_mut(&location.module_reference) {
      local_map.insert(location, entity);
    } else {
      self.0.insert(location.module_reference.clone(), HashMap::from([(location, entity)]));
    }
  }

  pub(super) fn purge(&mut self, module_reference: &ModuleReference) {
    self.0.remove(module_reference);
  }

  /// Returns the narrowest possible location correspond to given [position] at [moduleReference].
  /// If there is no location that contains the given position, None is returned.
  fn get_best_location(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<&Location> {
    let file_location_map = self.0.get(module_reference)?;
    file_location_map.keys().filter(|loc| loc.contains_position(position)).min_by_key(|location| {
      (location.end.0 - location.start.0) * 1000 + (location.end.1 - location.start.1)
    })
  }
}

fn build_expression_lookup_from_expr_single(lookup: &mut LocationLookup<expr::E>, expr: &expr::E) {
  lookup.set(expr.loc().clone(), expr.clone());
}

fn build_synthetic_class_name_id(
  lookup: &mut LocationLookup<expr::E>,
  class_id_module_reference: &ModuleReference,
  class_id: &Id,
) {
  build_expression_lookup_from_expr_single(
    lookup,
    &expr::E::Id(
      expr::ExpressionCommon {
        loc: class_id.loc.clone(),
        associated_comments: class_id.associated_comments.clone(),
        type_: rc(Type::Id(IdType {
          reason: Reason::new(class_id.loc.clone(), Some(class_id.loc.clone())),
          module_reference: class_id.loc.module_reference.clone(),
          id: rc_string(format!(
            "class {}.{}",
            class_id_module_reference.to_string(),
            class_id.name
          )),
          type_arguments: vec![],
        })),
      },
      class_id.clone(),
    ),
  )
}

fn build_expression_lookup_from_expr_recursive(
  lookup: &mut LocationLookup<expr::E>,
  expr: &expr::E,
) {
  match expr {
    expr::E::Literal(_, _) | expr::E::This(_) | expr::E::Id(_, _) => {
      build_expression_lookup_from_expr_single(lookup, expr)
    }
    expr::E::ClassFn(e) => {
      build_expression_lookup_from_expr_single(lookup, expr);
      build_synthetic_class_name_id(lookup, &e.module_reference, &e.class_name);
    }
    expr::E::FieldAccess(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.object);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::MethodAccess(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.object);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Unary(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.argument);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Call(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.callee);
      for e in &e.arguments {
        build_expression_lookup_from_expr_recursive(lookup, e);
      }
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Binary(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.e1);
      build_expression_lookup_from_expr_recursive(lookup, &e.e2);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::IfElse(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.condition);
      build_expression_lookup_from_expr_recursive(lookup, &e.e1);
      build_expression_lookup_from_expr_recursive(lookup, &e.e2);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Match(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.matched);
      for case in &e.cases {
        build_expression_lookup_from_expr_recursive(lookup, &case.body);
      }
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Lambda(e) => {
      build_expression_lookup_from_expr_recursive(lookup, &e.body);
      build_expression_lookup_from_expr_single(lookup, expr);
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        build_expression_lookup_from_expr_recursive(lookup, &stmt.assigned_expression);
        let type_ = stmt.assigned_expression.type_().clone();
        let (pat_loc, name) = match &stmt.pattern {
          expr::Pattern::Object(_, _) => {
            continue;
          }
          expr::Pattern::Id(pat_loc, n) => (pat_loc, n.clone()),
          expr::Pattern::Wildcard(pat_loc) => (pat_loc, rcs("_")),
        };
        build_expression_lookup_from_expr_single(
          lookup,
          &expr::E::Id(
            expr::ExpressionCommon { loc: pat_loc.clone(), associated_comments: rc(vec![]), type_ },
            Id { loc: pat_loc.clone(), associated_comments: rc(vec![]), name },
          ),
        );
      }
      if let Some(f) = &e.expression {
        build_expression_lookup_from_expr_recursive(lookup, f);
      }
    }
  }
}

pub(super) fn rebuild_expression_lookup_for_module(
  lookup: &mut LocationLookup<expr::E>,
  module_reference: &ModuleReference,
  module: &Module,
) {
  lookup.purge(module_reference);
  for toplevel in &module.toplevels {
    if let Toplevel::Class(c) = toplevel {
      build_synthetic_class_name_id(lookup, module_reference, &c.name);
      for member in &c.members {
        build_expression_lookup_from_expr_single(
          lookup,
          &expr::E::Id(
            expr::ExpressionCommon {
              loc: member.decl.name.loc.clone(),
              associated_comments: rc(vec![]),
              type_: rc(Type::Fn(member.decl.type_.clone())),
            },
            member.decl.name.clone(),
          ),
        );
        build_expression_lookup_from_expr_recursive(lookup, &member.body);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::checker::type_check_source_handles;
  use pretty_assertions::assert_eq;
  use std::ops::Deref;

  #[test]
  fn self_consistency_tests() {
    let mut lookup = LocationLookup::new();
    let far_pos = Position(100, 100);
    let mod_ref = ModuleReference::ordinary(vec![rcs("foo")]);
    let loc =
      Location { module_reference: mod_ref.clone(), start: Position(1, 1), end: Position(2, 2) };
    lookup.set(loc.clone(), "exist");

    assert_eq!(&loc, lookup.get_best_location(&mod_ref, loc.start).unwrap());
    assert_eq!(&loc, lookup.get_best_location(&mod_ref, loc.end).unwrap());
    assert_eq!(None, lookup.get_best_location(&mod_ref, far_pos));
    assert_eq!(
      None,
      lookup.get_best_location(&ModuleReference::ordinary(vec![rcs("oof")]), far_pos)
    );
    assert_eq!("exist", lookup.get(&mod_ref, loc.start).unwrap().deref());
    assert_eq!("exist", lookup.get(&mod_ref, loc.end).unwrap().deref());
    assert_eq!(None, lookup.get(&mod_ref, far_pos));
  }

  #[test]
  fn lookup_favors_small_range_tests() {
    let mut lookup = LocationLookup::new();
    let mod_ref = ModuleReference::ordinary(vec![rcs("foo")]);
    let small_loc =
      Location { module_reference: mod_ref.clone(), start: Position(2, 1), end: Position(3, 2) };
    let big_loc =
      Location { module_reference: mod_ref.clone(), start: Position(1, 1), end: Position(30, 2) };
    lookup.set(small_loc, 1);
    lookup.set(big_loc, 2);
    assert_eq!(1, *lookup.get(&mod_ref, Position(3, 1)).unwrap());
    assert_eq!(2, *lookup.get(&mod_ref, Position(30, 1)).unwrap());
    assert_eq!(None, lookup.get(&ModuleReference::ordinary(vec![rcs("oof")]), Position(3, 1)));
    assert_eq!(None, lookup.get(&mod_ref, Position(100, 1)));
  }

  #[test]
  fn builder_coverage_test() {
    let mod_ref = ModuleReference::ordinary(vec![rcs("foo")]);
    let r = type_check_source_handles(vec![(
      mod_ref.clone(),
      r#"class Foo(val a: int) {
    function bar(): int = 3
  }

  class Option<T>(None(unit), Some(T)) {
    function none(): Option<int> = Option.None({})
    function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)

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
    )]);

    assert!(r.compile_time_errors.is_empty());

    let mut lookup = LocationLookup::new();
    rebuild_expression_lookup_for_module(
      &mut lookup,
      &mod_ref,
      r.checked_sources.get(&mod_ref).unwrap(),
    );
  }
}
