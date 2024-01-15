use samlang_ast::{
  source::{annotation, expr, pattern, Module, Toplevel, TypeDefinition},
  Location,
};
use samlang_checker::type_::Type;
use samlang_heap::{ModuleReference, PStr};
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
    annotation::T::Primitive(_, _, _) | annotation::T::Generic(_, _) => {}
    annotation::T::Id(annot) => search_id_annot(annot, request, collector),
    annotation::T::Fn(annot) => {
      for a in &annot.parameters.annotations {
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
  for annot in annotation.type_arguments.iter().flat_map(|it| &it.arguments) {
    search_annot(annot, request, collector);
  }
}

fn search_matching_pattern(
  pattern: &pattern::MatchingPattern<Rc<Type>>,
  pattern_type: &Rc<Type>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match pattern {
    pattern::MatchingPattern::Tuple(pattern::TuplePattern { elements, .. }) => {
      for p in elements {
        search_matching_pattern(&p.pattern, &p.type_, request, collector)
      }
    }
    pattern::MatchingPattern::Object { elements, .. } => {
      match (pattern_type.as_ref(), request) {
        (
          Type::Nominal(nominal_type),
          GlobalNameSearchRequest::Property(mod_ref, toplevel_name, field_name),
        ) if mod_ref.eq(&nominal_type.module_reference) && toplevel_name.eq(&nominal_type.id) => {
          for n in elements {
            if field_name.eq(&n.field_name.name) {
              collector.push(n.field_name.loc);
            }
          }
        }
        _ => {}
      }
      for p in elements {
        search_matching_pattern(&p.pattern, &p.type_, request, collector)
      }
    }
    pattern::MatchingPattern::Variant(_)
    | pattern::MatchingPattern::Id(_, _)
    | pattern::MatchingPattern::Wildcard { .. } => {}
  }
}

fn search_if_else(
  if_else: &expr::IfElse<Rc<Type>>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match if_else.condition.as_ref() {
    expr::IfElseCondition::Expression(e) => search_expression(e, request, collector),
    expr::IfElseCondition::Guard(p, e) => {
      search_matching_pattern(p, e.type_(), request, collector);
      search_expression(e, request, collector);
    }
  }
  search_block(&if_else.e1, request, collector);
  search_if_else_or_block(&if_else.e2, request, collector);
}

fn search_if_else_or_block(
  if_else_or_block: &expr::IfElseOrBlock<Rc<Type>>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match if_else_or_block {
    expr::IfElseOrBlock::IfElse(e) => search_if_else(e, request, collector),
    expr::IfElseOrBlock::Block(e) => search_block(e, request, collector),
  }
}

fn search_block(
  block: &expr::Block<Rc<Type>>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  for stmt in &block.statements {
    if let Some(annot) = &stmt.annotation {
      search_annot(annot, request, collector);
    }
    search_matching_pattern(&stmt.pattern, stmt.assigned_expression.type_(), request, collector);
    search_expression(&stmt.assigned_expression, request, collector);
  }
  if let Some(e) = &block.expression {
    search_expression(e, request, collector);
  }
}

fn search_expression(
  expr: &expr::E<Rc<Type>>,
  request: &GlobalNameSearchRequest,
  collector: &mut Vec<Location>,
) {
  match expr {
    expr::E::Literal(_, _) | expr::E::LocalId(_, _) => {}
    expr::E::ClassId(_, class_mod_ref, id) => match request {
      GlobalNameSearchRequest::Toplevel(mod_ref, toplevel_name)
        if mod_ref.eq(class_mod_ref) && id.name.eq(toplevel_name) =>
      {
        collector.push(id.loc);
      }
      _ => {}
    },
    expr::E::Tuple(_, expressions) => {
      for e in &expressions.expressions {
        search_expression(e, request, collector);
      }
    }
    expr::E::FieldAccess(e) => {
      match (request, e.object.type_().as_nominal()) {
        (
          GlobalNameSearchRequest::Property(mod_ref, toplevel_name, field_name),
          Some(nominal_type),
        ) if mod_ref.eq(&nominal_type.module_reference)
          && toplevel_name.eq(&nominal_type.id)
          && field_name.eq(&e.field_name.name) =>
        {
          collector.push(e.field_name.loc);
        }
        _ => {}
      }
      search_expression(&e.object, request, collector);
    }
    expr::E::MethodAccess(e) => {
      match (request, e.object.type_().as_nominal()) {
        (
          GlobalNameSearchRequest::InterfaceMember(mod_ref, toplevel_name, method_name, is_method),
          Some(nominal_type),
        ) if mod_ref.eq(&nominal_type.module_reference)
          && toplevel_name.eq(&nominal_type.id)
          && method_name.eq(&e.method_name.name)
          && is_method.ne(&nominal_type.is_class_statics) =>
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
      for e in &e.arguments.expressions {
        search_expression(e, request, collector);
      }
    }
    expr::E::Binary(e) => {
      search_expression(&e.e1, request, collector);
      search_expression(&e.e2, request, collector);
    }
    expr::E::IfElse(e) => search_if_else(e, request, collector),
    expr::E::Match(e) => {
      search_expression(&e.matched, request, collector);
      for case in &e.cases {
        search_matching_pattern(&case.pattern, e.matched.type_(), request, collector);
        search_expression(&case.body, request, collector);
      }
    }
    expr::E::Lambda(e) => {
      for param in &e.parameters.parameters {
        if let Some(annot) = &param.annotation {
          search_annot(annot, request, collector);
        }
      }
      search_expression(&e.body, request, collector)
    }
    expr::E::Block(e) => search_block(e, request, collector),
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
        for param in member.parameters.parameters.iter() {
          search_annot(&param.annotation, request, &mut collector);
        }
        search_annot(&member.return_type, request, &mut collector);
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
            Some(TypeDefinition::Struct {
              loc: _,
              start_associated_comments: _,
              ending_associated_comments: _,
              fields,
            }),
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
        for member in &c.members.members {
          search_expression(&member.body, request, &mut collector);
        }
      }
    }
  }
  collector
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, PStr};
  use std::collections::HashMap;

  #[test]
  fn searcher_coverage_test() {
    let heap = &mut Heap::new();
    let mut error_set = ErrorSet::new();
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["foo".to_string()]);
    let source = r#"class Foo(val a: int, val b: bool) {
      function bar(): int = 3

      method foo(): unit = {
        let _ = (f: Foo, b: Option<Foo>, a: (Foo)->Foo) -> this.a;
        let {a, b} = this;
        let (c, d) = (1, 2);
      }
    }

    class Option<T>(None(unit), Some(T)) {
      function none(): Option<int> = Option.None({})
      function createSome(): (int) -> Option<int> = (n: int) -> Option.Some(n)
      function createSome2(): (int) -> Option<int> = (n) -> Option.Some(n)

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
        let { d as _, e as d } = Obj.init(5, 4); // d = 4
        let f = Obj.init(5, 4); // d = 4
        let g = Obj.init(d, 4); // d = 4
        let _ = if let { a as d3, b as d4 } = Foo.init(5, false) {} else {};
        let _ = if let Some(_) = Option.Some(1) {} else {};
        let _ = if let (_, _) = (1,2) {} else {};
        let _ = f.d;
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

      function main(): unit = {
        let _ = Process.println(Str.fromInt(Main.identity(
          Foo.bar() * Main.oof() * Obj.valExample() / Main.div(4, 2) + Main.nestedVal() - 5
        )));
        Main.main()
      }
    }"#;
    let parsed =
      samlang_parser::parse_source_module_from_text(source, mod_ref, heap, &mut error_set);
    let mut modules = samlang_parser::builtin_parsed_std_sources_for_tests(heap);
    modules.insert(mod_ref, parsed);
    let (checked_sources, _) = samlang_checker::type_check_sources(&modules, &mut error_set);
    assert_eq!(
      r#"
Error ---------------------------------- foo.sam:33:24-33:44

The pattern is irrefutable.

  33|         let _ = if let { a as d3, b as d4 } = Foo.init(5, false) {} else {};
                             ^^^^^^^^^^^^^^^^^^^^


Error ---------------------------------- foo.sam:35:24-35:30

The pattern is irrefutable.

  35|         let _ = if let (_, _) = (1,2) {} else {};
                             ^^^^^^


Found 2 errors.
"#
      .trim(),
      error_set
        .pretty_print_error_messages(heap, &HashMap::from([(mod_ref, source.to_string())]))
        .trim()
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str_for_test("Foo")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str_for_test("Option")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str_for_test("Obj")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, heap.alloc_str_for_test("Interface")),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Toplevel(mod_ref, PStr::MAIN_FN),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        PStr::MAIN_FN,
        PStr::MAIN_FN,
        false,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        heap.alloc_str_for_test("Option"),
        heap.alloc_str_for_test("matchExample"),
        true,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::InterfaceMember(
        mod_ref,
        heap.alloc_str_for_test("Option"),
        heap.alloc_str_for_test("None"),
        false,
      ),
    );
    super::search_modules_globally(
      &checked_sources,
      &super::GlobalNameSearchRequest::Property(
        mod_ref,
        heap.alloc_str_for_test("Foo"),
        PStr::LOWER_A,
      ),
    );
  }
}
