use crate::{
  ast::{
    source::{annotation, expr, Module, Toplevel, TypeDefinition},
    Location,
  },
  checker::type_::Type,
  common::{ModuleReference, PStr},
};
use std::{collections::HashMap, rc::Rc};

pub(super) enum GlobalNameSearchRequest {
  Toplevel(ModuleReference, PStr),
  Property(ModuleReference, PStr, PStr),
  InterfaceMember(ModuleReference, PStr, PStr, bool /* is method */),
}

fn search_annot(
  annotation: &annotation::T,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match annotation {
    annotation::T::Primitive(_, _, _) => {}
    annotation::T::Id(annot) => search_id_annot(annot, request, collector),
    annotation::T::Fn(annot) => {
      for a in &annot.argument_types {
        search_annot(a, request, collector);
      }
      search_annot(&annot.return_type, request, collector);
    }
  }
}

fn search_id_annot(
  annotation: &annotation::Id,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match request {
    GlobalNameSearchRequest::Toplevel(mod_ref, name)
      if mod_ref.eq(&annotation.module_reference) && name.eq(&annotation.id.name) =>
    {
      collector.push(annotation.location);
    }
    _ => {}
  }
  for annot in &annotation.type_arguments {
    search_annot(annot, request, collector);
  }
}

fn search_expression(
  expr: &expr::E<Rc<Type>>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match expr {
    expr::E::Literal(_, _) | expr::E::Id(_, _) => {}
    expr::E::ClassFn(e) => match request {
      GlobalNameSearchRequest::Toplevel(mod_ref, toplevel_name)
        if mod_ref.eq(&e.module_reference) && toplevel_name.eq(&e.class_name.name) =>
      {
        collector.push(e.class_name.loc);
      }
      GlobalNameSearchRequest::InterfaceMember(mod_ref, toplevel_name, fn_name, false)
        if mod_ref.eq(&e.module_reference)
          && toplevel_name.eq(&e.class_name.name)
          && fn_name.eq(&e.fn_name.name) =>
      {
        collector.push(e.fn_name.loc);
      }
      _ => {}
    },
    expr::E::FieldAccess(e) => {
      match (request, e.object.type_().as_ref()) {
        (
          GlobalNameSearchRequest::Property(mod_ref, toplevel_name, field_name),
          Type::Id(id_type),
        ) if mod_ref.eq(&id_type.module_reference)
          && toplevel_name.eq(&id_type.id)
          && field_name.eq(&e.field_name.name) =>
        {
          collector.push(e.field_name.loc);
        }
        _ => {}
      }
      search_expression(&e.object, request, collector);
    }
    expr::E::MethodAccess(e) => {
      match (request, e.object.type_().as_ref()) {
        (
          GlobalNameSearchRequest::InterfaceMember(mod_ref, toplevel_name, method_name, true),
          Type::Id(id_type),
        ) if mod_ref.eq(&id_type.module_reference)
          && toplevel_name.eq(&id_type.id)
          && method_name.eq(&e.method_name.name) =>
        {
          collector.push(e.method_name.loc);
        }
        _ => {}
      }
      search_expression(&e.object, request, collector);
    }
    expr::E::Unary(e) => search_expression(&e.argument, request, collector),
    expr::E::Call(e) => {
      search_expression(&e.callee, request, collector);
      for e in &e.arguments {
        search_expression(e, request, collector);
      }
    }
    expr::E::Binary(e) => {
      search_expression(&e.e1, request, collector);
      search_expression(&e.e2, request, collector);
    }
    expr::E::IfElse(e) => {
      search_expression(&e.condition, request, collector);
      search_expression(&e.e1, request, collector);
      search_expression(&e.e2, request, collector);
    }
    expr::E::Match(e) => {
      search_expression(&e.matched, request, collector);
      let type_ = e.matched.type_().as_ref();
      for case in &e.cases {
        match (request, type_) {
          (
            GlobalNameSearchRequest::InterfaceMember(mod_ref, toplevel_name, fn_name, false),
            Type::Id(id_type),
          ) if mod_ref.eq(&id_type.module_reference)
            && toplevel_name.eq(&id_type.id)
            && fn_name.eq(&case.tag.name) =>
          {
            collector.push(case.tag.loc);
          }
          _ => {}
        }
        search_expression(&case.body, request, collector);
      }
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters {
        if let Some(annot) = &param.annotation {
          search_annot(annot, request, collector);
        }
      }
      search_expression(&e.body, request, collector)
    }
    expr::E::Block(e) => {
      for stmt in &e.statements {
        if let Some(annot) = &stmt.annotation {
          search_annot(annot, request, collector);
        }
        match (&stmt.pattern, request, stmt.assigned_expression.type_().as_ref()) {
          (
            expr::Pattern::Object(_, destructured_names),
            GlobalNameSearchRequest::Property(mod_ref, toplevel_name, field_name),
            Type::Id(id_type),
          ) if mod_ref.eq(&id_type.module_reference) && toplevel_name.eq(&id_type.id) => {
            for n in destructured_names {
              if field_name.eq(&n.field_name.name) {
                collector.push(n.field_name.loc);
              }
            }
          }
          _ => {}
        }
        search_expression(&stmt.assigned_expression, request, collector);
      }
      if let Some(e) = &e.expression {
        search_expression(e, request, collector);
      }
    }
  }
}

pub(super) fn search_modules_globally(
  modules: &HashMap<ModuleReference, Module<Rc<Type>>>,
  request: &GlobalNameSearchRequest,
) -> Vec<Location> {
  let mut collector = vec![];
  for (mod_ref, module) in modules {
    for toplevel in &module.toplevels {
      let toplevel_name = toplevel.name();
      match request {
        GlobalNameSearchRequest::Toplevel(req_mod_ref, req_name)
          if mod_ref.eq(req_mod_ref) && toplevel_name.name.eq(req_name) =>
        {
          collector.push(toplevel_name.loc);
        }
        _ => {}
      }
      for member in toplevel.members_iter() {
        for param in member.parameters.iter() {
          search_annot(&param.annotation, request, &mut collector);
        }
        search_annot(&member.type_.return_type, request, &mut collector);
        match request {
          GlobalNameSearchRequest::InterfaceMember(
            req_mod_ref,
            req_toplevel_name,
            req_member_name,
            req_is_method,
          ) if mod_ref.eq(req_mod_ref)
            && toplevel_name.name.eq(req_toplevel_name)
            && member.name.name.eq(req_member_name)
            && member.is_method.eq(req_is_method) =>
          {
            collector.push(member.name.loc);
          }
          _ => {}
        }
      }
      if let Toplevel::Class(c) = toplevel {
        match (&c.type_definition, request) {
          (
            TypeDefinition::Struct { loc: _, fields },
            GlobalNameSearchRequest::Property(req_mod_ref, req_toplevel_name, req_prop),
          ) if mod_ref.eq(req_mod_ref) && toplevel_name.name.eq(req_toplevel_name) => {
            for field in fields {
              if field.name.name.eq(req_prop) {
                collector.push(field.name.loc);
              }
            }
          }
          _ => {}
        }
        for member in &c.members {
          search_expression(&member.body, request, &mut collector);
        }
      }
    }
  }
  collector
}

#[cfg(test)]
mod tests {
  use std::collections::HashMap;

  use crate::{
    checker::type_check_sources, errors::ErrorSet, parser::parse_source_module_from_text, Heap,
  };

  #[test]
  fn searcher_coverage_test() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["foo".to_string()]);
    let parsed = parse_source_module_from_text(
      r#"class Foo(val a: int, val b: bool) {
      function bar(): int = 3

      method foo(): unit = {
        val _ = (f: Foo, b: Option<Foo>, a: (Foo)->Foo) -> this.a;
        val {a, b} = this;
      }
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

      function main(): unit = {
        val _ = Builtins.println(Builtins.intToString(Main.identity(
          Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
        )));
        Main.main()
      }
    }"#,
      mod_ref,
      heap,
      &mut error_set,
    );
    let (checked_sources, _) =
      type_check_sources(&HashMap::from([(mod_ref, parsed)]), heap, &mut error_set);
    assert!(error_set.into_errors().is_empty());
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str("Foo")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str("Option")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str("Obj")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str("Interface")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str("Main")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        heap.alloc_str("Main"),
        heap.alloc_str("main"),
        false,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        heap.alloc_str("Option"),
        heap.alloc_str("matchExample"),
        true,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        heap.alloc_str("Option"),
        heap.alloc_str("None"),
        false,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Property(
        mod_ref,
        heap.alloc_str("Foo"),
        heap.alloc_str("a"),
      ),
    );
  }
}
