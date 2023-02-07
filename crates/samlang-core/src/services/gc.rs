use crate::{
  ast::source::{expr, Id, Module, Toplevel, TypeParameter},
  checker::type_::{FunctionType, IdType, Type},
  Heap, ModuleReference,
};
use std::{collections::HashMap, rc::Rc};

fn mark_type(heap: &mut Heap, type_: &Type) {
  match type_ {
    Type::Unknown(_) | Type::Primitive(_, _) => {}
    Type::Id(t) => mark_id_type(heap, t),
    Type::Fn(t) => mark_fn_type(heap, t),
  }
}

fn mark_id_type(heap: &mut Heap, type_: &IdType) {
  heap.mark(type_.id);
  mark_types(heap, &type_.type_arguments);
}

fn mark_fn_type(heap: &mut Heap, type_: &FunctionType) {
  mark_types(heap, &type_.argument_types);
  mark_type(heap, &type_.return_type);
}

fn mark_type_opt(heap: &mut Heap, opt_t: &Option<Rc<Type>>) {
  if let Some(t) = opt_t {
    mark_type(heap, t);
  }
}

fn mark_types(heap: &mut Heap, types: &Vec<Rc<Type>>) {
  for t in types {
    mark_type(heap, t);
  }
}

fn mark_id(heap: &mut Heap, id: &Id) {
  heap.mark(id.name);
}

fn mark_expression(heap: &mut Heap, expr: &expr::E) {
  mark_type(heap, &expr.common().type_);
  match expr {
    expr::E::Literal(_, _) => {}
    expr::E::Id(_, id) => mark_id(heap, id),
    expr::E::ClassFn(e) => {
      mark_id(heap, &e.class_name);
      mark_id(heap, &e.fn_name);
      mark_types(heap, &e.type_arguments);
    }
    expr::E::FieldAccess(e) => {
      mark_expression(heap, &e.object);
      mark_id(heap, &e.field_name);
      mark_types(heap, &e.type_arguments);
    }
    expr::E::MethodAccess(e) => {
      mark_expression(heap, &e.object);
      mark_id(heap, &e.method_name);
      mark_types(heap, &e.type_arguments);
    }
    expr::E::Unary(e) => mark_expression(heap, &e.argument),
    expr::E::Call(e) => {
      mark_expression(heap, &e.callee);
      for e in &e.arguments {
        mark_expression(heap, e);
      }
    }
    expr::E::Binary(e) => {
      mark_expression(heap, &e.e1);
      mark_expression(heap, &e.e2);
    }
    expr::E::IfElse(e) => {
      mark_expression(heap, &e.condition);
      mark_expression(heap, &e.e1);
      mark_expression(heap, &e.e2);
    }
    expr::E::Match(e) => {
      mark_expression(heap, &e.matched);
      for case in &e.cases {
        mark_id(heap, &case.tag);
        if let Some((v, t)) = &case.data_variable {
          mark_id(heap, v);
          mark_type(heap, t);
        }
        mark_expression(heap, &case.body);
      }
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters {
        mark_id(heap, &param.name);
        mark_type_opt(heap, &param.annotation);
      }
      mark_expression(heap, &e.body);
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        mark_expression(heap, &stmt.assigned_expression);
        mark_type_opt(heap, &stmt.annotation);
        match &stmt.pattern {
          expr::Pattern::Object(_, names) => {
            for n in names {
              mark_type(heap, &n.type_);
              mark_id(heap, &n.field_name);
              if let Some(alias) = &n.alias {
                mark_id(heap, alias);
              }
            }
          }
          expr::Pattern::Id(_, n) => heap.mark(*n),
          expr::Pattern::Wildcard(_) => {}
        };
      }
      if let Some(e) = &e.expression {
        mark_expression(heap, e);
      }
    }
  }
}

fn mark_type_parameters(heap: &mut Heap, type_parameters: &Vec<TypeParameter>) {
  for tparam in type_parameters {
    mark_id(heap, &tparam.name);
    if let Some(t) = &tparam.bound {
      mark_id_type(heap, t);
    }
  }
}

fn mark_module(heap: &mut Heap, module: &Module) {
  for comment_text in
    module.comment_store.all_comments().iter().flat_map(|it| it.iter()).map(|it| it.text)
  {
    heap.mark(comment_text);
  }
  for import in &module.imports {
    for id in &import.imported_members {
      mark_id(heap, id);
    }
  }
  for toplevel in &module.toplevels {
    mark_id(heap, toplevel.name());
    mark_type_parameters(heap, toplevel.type_parameters());
    for t in toplevel.extends_or_implements_nodes() {
      mark_id_type(heap, t);
    }
    for m in toplevel.members_iter() {
      mark_id(heap, &m.name);
      mark_type_parameters(heap, &m.type_parameters);
      mark_fn_type(heap, &m.type_);
    }
    if let Toplevel::Class(c) = toplevel {
      for (name, field_type) in &c.type_definition.mappings {
        heap.mark(*name);
        mark_type(heap, &field_type.type_);
      }
      for m in &c.members {
        mark_expression(heap, &m.body);
      }
    }
  }
}

const NUM_MODULE_MARKED_PER_SLICE: usize = 100;
const NUM_SWEEP_UNIT: usize = 10000;

fn perform_gc_after_recheck_internal(
  heap: &mut Heap,
  mut remaining_slice: usize,
  all_modules: &HashMap<ModuleReference, Module>,
  changed_modules: Vec<ModuleReference>,
) {
  for mod_ref in changed_modules {
    heap.add_unmarked_module_reference(mod_ref);
  }
  while remaining_slice > 0 {
    if let Some(mod_ref_to_mark) = heap.pop_unmarked_module_reference() {
      if let Some(module) = all_modules.get(&mod_ref_to_mark) {
        mark_module(heap, module);
        remaining_slice -= 1;
      }
    } else {
      break;
    }
  }
  heap.sweep(NUM_SWEEP_UNIT);
}

pub(super) fn perform_gc_after_recheck(
  heap: &mut Heap,
  all_modules: &HashMap<ModuleReference, Module>,
  changed_modules: Vec<ModuleReference>,
) {
  perform_gc_after_recheck_internal(
    heap,
    NUM_MODULE_MARKED_PER_SLICE,
    all_modules,
    changed_modules,
  );
}

#[cfg(test)]
mod tests {
  use crate::{checker::type_check_source_handles, Heap, ModuleReference};

  #[test]
  fn mark_coverage_test() {
    let heap = &mut Heap::new();
    let r = type_check_source_handles(
      heap,
      vec![(
        ModuleReference::dummy(),
        r#"import {Foo, Bar} from Module.Reference

  class Foo(val a: int) {
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
      val a: int = 1;
      val b = 2;
      val c = 3; // c = 3
      val { d } = Obj.init(5, 4);
      val { e as d2 } = Obj.init(5, 4); // d = 4
      val f = Obj.init(5, 4); // d = 4
      val g = Obj.init(d, 4); // d = 4
      val _ = f.d;
      // 1 + 2 * 3 / 4 = 1 + 6/4 = 1 + 1 = 2
      a + b * c / d
    }
  }

  interface Interface

  interface Generic<T: Interface> : Interface {}

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
    super::perform_gc_after_recheck(heap, &r.checked_sources, vec![ModuleReference::root()]);
    super::perform_gc_after_recheck(heap, &r.checked_sources, vec![ModuleReference::dummy()]);
    assert_eq!("", heap.debug_unmarked_strings());

    super::perform_gc_after_recheck_internal(
      heap,
      1,
      &r.checked_sources,
      vec![ModuleReference::dummy()],
    );
  }
}
