use crate::{
  ast::source::{annotation, expr, Id, Literal, Module, Toplevel, TypeDefinition, TypeParameter},
  checker::type_::{FunctionType, NominalType, Type},
  Heap, ModuleReference,
};
use std::{collections::HashMap, rc::Rc};

fn mark_annot(heap: &mut Heap, type_: &annotation::T) {
  match type_ {
    annotation::T::Primitive(_, _, _) => {}
    annotation::T::Id(annot) => mark_id_annot(heap, annot),
    annotation::T::Generic(_, id) => heap.mark(id.name),
    annotation::T::Fn(annot) => mark_fn_annot(heap, annot),
  }
}

fn mark_id_annot(heap: &mut Heap, annot: &annotation::Id) {
  heap.mark(annot.id.name);
  mark_annotations(heap, &annot.type_arguments);
}

fn mark_fn_annot(heap: &mut Heap, annot: &annotation::Function) {
  mark_annotations(heap, &annot.argument_types);
  mark_annot(heap, &annot.return_type);
}

fn mark_annotations(heap: &mut Heap, annotations: &Vec<annotation::T>) {
  for annot in annotations {
    mark_annot(heap, annot);
  }
}

fn mark_annot_opt(heap: &mut Heap, opt_t: &Option<annotation::T>) {
  if let Some(t) = opt_t {
    mark_annot(heap, t);
  }
}

fn mark_type(heap: &mut Heap, type_: &Type) {
  match type_ {
    Type::Any(_, _) | Type::Primitive(_, _) => {}
    Type::Nominal(t) => mark_nominal_type(heap, t),
    Type::Generic(_, id) => heap.mark(*id),
    Type::Fn(t) => mark_fn_type(heap, t),
  }
}

fn mark_nominal_type(heap: &mut Heap, type_: &NominalType) {
  heap.mark(type_.id);
  mark_types(heap, &type_.type_arguments);
}

fn mark_fn_type(heap: &mut Heap, type_: &FunctionType) {
  mark_types(heap, &type_.argument_types);
  mark_type(heap, &type_.return_type);
}

fn mark_types(heap: &mut Heap, types: &Vec<Rc<Type>>) {
  for t in types {
    mark_type(heap, t);
  }
}

fn mark_id(heap: &mut Heap, id: &Id) {
  heap.mark(id.name);
}

fn mark_expression(heap: &mut Heap, expr: &expr::E<Rc<Type>>) {
  mark_type(heap, &expr.common().type_);
  match expr {
    expr::E::Literal(_, Literal::String(s)) => heap.mark(*s),
    expr::E::Literal(_, _) => {}
    expr::E::LocalId(_, id) | expr::E::ClassId(_, _, id) => mark_id(heap, id),
    expr::E::FieldAccess(e) => {
      mark_expression(heap, &e.object);
      mark_id(heap, &e.field_name);
      mark_annotations(heap, &e.explicit_type_arguments);
      mark_types(heap, &e.inferred_type_arguments);
    }
    expr::E::MethodAccess(e) => {
      mark_expression(heap, &e.object);
      mark_id(heap, &e.method_name);
      mark_annotations(heap, &e.explicit_type_arguments);
      mark_types(heap, &e.inferred_type_arguments);
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
        for (v, t) in case.data_variables.iter().filter_map(|it| it.as_ref()) {
          mark_id(heap, v);
          mark_type(heap, t);
        }
        mark_expression(heap, &case.body);
      }
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters {
        mark_id(heap, &param.name);
        mark_annot_opt(heap, &param.annotation);
      }
      mark_expression(heap, &e.body);
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        mark_expression(heap, &stmt.assigned_expression);
        mark_annot_opt(heap, &stmt.annotation);
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
    if let Some(annot) = &tparam.bound {
      mark_id_annot(heap, annot);
    }
  }
}

fn mark_module(heap: &mut Heap, module: &Module<Rc<Type>>) {
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
      mark_id_annot(heap, t);
    }
    for m in toplevel.members_iter() {
      mark_id(heap, &m.name);
      mark_type_parameters(heap, &m.type_parameters);
      mark_fn_annot(heap, &m.type_);
    }
    if let Toplevel::Class(c) = toplevel {
      match &c.type_definition {
        TypeDefinition::Struct { loc: _, fields } => {
          for field in fields {
            mark_id(heap, &field.name);
            mark_annot(heap, &field.annotation);
          }
        }
        TypeDefinition::Enum { loc: _, variants } => {
          for variant in variants {
            mark_id(heap, &variant.name);
            for annot in &variant.associated_data_types {
              mark_annot(heap, annot);
            }
          }
        }
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
  all_modules: &HashMap<ModuleReference, Module<Rc<Type>>>,
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
  all_modules: &HashMap<ModuleReference, Module<Rc<Type>>>,
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
  use crate::{
    checker::type_check_sources, errors::ErrorSet, parser::parse_source_module_from_text, Heap,
    ModuleReference,
  };
  use std::collections::HashMap;

  #[test]
  fn mark_coverage_test() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let parsed = parse_source_module_from_text(
      r#"import {Foo, Bar} from Module.Reference

      class Foo(val a: int) {
        function bar(): int = 3
        function baz(): Str = "3"
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
      }"#,
      ModuleReference::dummy(),
      heap,
      &mut error_set,
    );
    let (checked_sources, _) = type_check_sources(
      &HashMap::from([(ModuleReference::dummy(), parsed)]),
      heap,
      &mut error_set,
    );
    super::perform_gc_after_recheck(heap, &checked_sources, vec![ModuleReference::root()]);
    super::perform_gc_after_recheck(heap, &checked_sources, vec![ModuleReference::dummy()]);
    assert_eq!("", heap.debug_unmarked_strings());

    super::perform_gc_after_recheck_internal(
      heap,
      1,
      &checked_sources,
      vec![ModuleReference::dummy()],
    );
  }
}
