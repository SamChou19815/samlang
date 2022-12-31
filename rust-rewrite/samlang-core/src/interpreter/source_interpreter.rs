// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/35

use crate::{
  ast::source::{expr, Literal, Module, Toplevel},
  common::{rc_string, rcs, LocalStackedContext, Str},
};
use itertools::Itertools;
use std::{collections::HashMap, ops::Deref};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Value {
  Unit,
  Int(i32),
  Boolean(bool),
  StringPointer(i32),
  ObjectPointer(i32),
  VariantPointer(i32),
  FunctionPointer(i32),
}

impl Value {
  fn int_value(&self) -> i32 {
    if let Value::Int(i) = self {
      *i
    } else {
      panic!("Expect int but nope")
    }
  }

  fn bool_value(&self) -> bool {
    if let Value::Boolean(b) = self {
      *b
    } else {
      panic!("Expect bool but nope")
    }
  }

  fn string_value<'a>(&self, cx: &'a InterpretationContext) -> &'a Str {
    if let Value::StringPointer(s) = self {
      cx.string_heap.get(s).unwrap()
    } else {
      panic!("Expect string but nope")
    }
  }

  fn object_value<'a>(&self, cx: &'a InterpretationContext) -> &'a HashMap<Str, Value> {
    if let Value::ObjectPointer(s) = self {
      cx.object_heap.get(s).unwrap()
    } else {
      panic!("Expect object but nope")
    }
  }

  fn variant_value<'a>(&self, cx: &'a InterpretationContext) -> &'a (Str, Value) {
    if let Value::VariantPointer(s) = self {
      cx.variant_heap.get(s).unwrap()
    } else {
      panic!("Expect object but nope")
    }
  }

  fn function_value<'a>(&self, cx: &'a InterpretationContext) -> &'a FunctionValue {
    if let Value::FunctionPointer(s) = self {
      cx.function_heap.get(s).unwrap()
    } else {
      panic!("Expect object but nope")
    }
  }
}

#[derive(Clone)]
enum FunctionImpl {
  Expr(expr::E),
  InitObject(Vec<Str>),
  InitVariant(Str),
  StringToInt,
  IntToString,
  Println,
  Panic,
}

#[derive(Clone)]
struct FunctionValue {
  parameters: Vec<Str>,
  body: FunctionImpl,
  captured: HashMap<Str, Value>,
}

struct ClassValue {
  functions: HashMap<Str, FunctionValue>,
  methods: HashMap<Str, FunctionValue>,
}

struct InterpretationContext {
  classes: HashMap<Str, ClassValue>,
  local_values: LocalStackedContext<Value>,
  heap_counter: i32,
  string_heap: HashMap<i32, Str>,
  object_heap: HashMap<i32, HashMap<Str, Value>>,
  variant_heap: HashMap<i32, (Str, Value)>,
  function_heap: HashMap<i32, FunctionValue>,
  printed: Vec<String>,
}

fn new_str(cx: &mut InterpretationContext, str: Str) -> Value {
  let id = cx.heap_counter;
  cx.heap_counter += 1;
  cx.string_heap.insert(id, str);
  Value::StringPointer(id)
}

fn new_obj(cx: &mut InterpretationContext, map: HashMap<Str, Value>) -> Value {
  let id = cx.heap_counter;
  cx.heap_counter += 1;
  cx.object_heap.insert(id, map);
  Value::ObjectPointer(id)
}

fn new_variant(cx: &mut InterpretationContext, tag: Str, data: Value) -> Value {
  let id = cx.heap_counter;
  cx.heap_counter += 1;
  cx.variant_heap.insert(id, (tag, data));
  Value::VariantPointer(id)
}

fn new_fn(cx: &mut InterpretationContext, f: FunctionValue) -> Value {
  let id = cx.heap_counter;
  cx.heap_counter += 1;
  cx.function_heap.insert(id, f);
  Value::FunctionPointer(id)
}

fn eval_expr(cx: &mut InterpretationContext, expr: &expr::E) -> Value {
  match expr {
    expr::E::Literal(_, l) => match l {
      Literal::Bool(b) => Value::Boolean(*b),
      Literal::Int(i) => Value::Int(*i),
      Literal::String(s) => new_str(cx, s.clone()),
    },
    expr::E::This(_) => *cx.local_values.get(&rcs("this")).expect("Missing `this`"),
    expr::E::Id(_, id) => {
      *cx.local_values.get(&id.name).expect(&format!("Missing variable {}", id.name))
    }
    expr::E::ClassFn(e) => new_fn(
      cx,
      cx.classes
        .get(&e.class_name.name)
        .expect(&format!("Missing class: {}", e.class_name.name))
        .functions
        .get(&e.fn_name.name)
        .expect(&format!("Missing function: {}", e.fn_name.name))
        .clone(),
    ),
    expr::E::FieldAccess(e) => *eval_expr(cx, &e.object)
      .object_value(cx)
      .get(&e.field_name.name)
      .expect(&format!("Missing field: {}", e.field_name.name))
      .deref(),
    expr::E::MethodAccess(e) => {
      let obj_type = e.object.type_();
      let id_type = obj_type.as_id().unwrap();
      let this_value = eval_expr(cx, &e.object);
      let method_value = cx
        .classes
        .get(&id_type.id)
        .expect(&format!("Missing class: {}", id_type.id))
        .methods
        .get(&e.method_name.name)
        .expect(&format!("Missing method: {} from class {}", e.method_name.name, id_type.id));
      new_fn(
        cx,
        FunctionValue {
          parameters: method_value.parameters.clone(),
          body: method_value.body.clone(),
          captured: HashMap::from([(rcs("this"), this_value)]),
        },
      )
    }
    expr::E::Unary(e) => {
      let v = eval_expr(cx, &e.argument);
      match e.operator {
        expr::UnaryOperator::NOT => Value::Boolean(!v.bool_value()),
        expr::UnaryOperator::NEG => Value::Int(-v.int_value()),
      }
    }
    expr::E::Call(e) => {
      let argument_values = e.arguments.iter().map(|arg| eval_expr(cx, arg)).collect_vec();
      cx.local_values.push_scope();
      let fun_val = eval_expr(cx, &e.callee).function_value(cx).clone();
      for (param, arg) in fun_val.parameters.iter().zip(argument_values) {
        cx.local_values.insert(param, arg);
      }
      for (name, value) in fun_val.captured {
        cx.local_values.insert(&name, value);
      }
      let v = match fun_val.body {
        FunctionImpl::Expr(body) => eval_expr(cx, &body),
        FunctionImpl::InitObject(names) => {
          let mut map = HashMap::new();
          for name in names {
            let v = cx.local_values.get(&name).cloned().unwrap();
            map.insert(name, v);
          }
          new_obj(cx, map)
        }
        FunctionImpl::InitVariant(tag) => {
          let data = cx.local_values.get(&rcs("data")).cloned().unwrap();
          new_variant(cx, tag, data)
        }
        FunctionImpl::StringToInt => {
          let v = cx.local_values.get(&rcs("v")).cloned().unwrap();
          let s = v.string_value(cx);
          Value::Int(s.parse::<i32>().unwrap())
        }
        FunctionImpl::IntToString => {
          let v = cx.local_values.get(&rcs("v")).unwrap().int_value().to_string();
          new_str(cx, rc_string(v))
        }
        FunctionImpl::Println => {
          let v = cx.local_values.get(&rcs("v")).cloned().unwrap();
          let s = v.string_value(cx);
          cx.printed.push(s.to_string());
          Value::Unit
        }
        FunctionImpl::Panic => {
          let v = cx.local_values.get(&rcs("v")).cloned().unwrap();
          panic!("{}", v.string_value(cx))
        }
      };
      cx.local_values.pop_scope();
      v
    }
    expr::E::Binary(e) => match e.operator {
      expr::BinaryOperator::MUL => {
        Value::Int(eval_expr(cx, &e.e1).int_value() * eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::DIV => {
        Value::Int(eval_expr(cx, &e.e1).int_value() / eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::MOD => {
        Value::Int(eval_expr(cx, &e.e1).int_value() % eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::PLUS => {
        Value::Int(eval_expr(cx, &e.e1).int_value() + eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::MINUS => {
        Value::Int(eval_expr(cx, &e.e1).int_value() - eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::LT => {
        Value::Boolean(eval_expr(cx, &e.e1).int_value() < eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::LE => {
        Value::Boolean(eval_expr(cx, &e.e1).int_value() <= eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::GT => {
        Value::Boolean(eval_expr(cx, &e.e1).int_value() > eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::GE => {
        Value::Boolean(eval_expr(cx, &e.e1).int_value() >= eval_expr(cx, &e.e2).int_value())
      }
      expr::BinaryOperator::EQ => Value::Boolean(eval_expr(cx, &e.e1) == eval_expr(cx, &e.e2)),
      expr::BinaryOperator::NE => Value::Boolean(eval_expr(cx, &e.e1) != eval_expr(cx, &e.e2)),
      expr::BinaryOperator::AND => {
        Value::Boolean(eval_expr(cx, &e.e1).bool_value() && eval_expr(cx, &e.e2).bool_value())
      }
      expr::BinaryOperator::OR => {
        Value::Boolean(eval_expr(cx, &e.e1).bool_value() || eval_expr(cx, &e.e2).bool_value())
      }
      expr::BinaryOperator::CONCAT => {
        let v1 = eval_expr(cx, &e.e1);
        let v2 = eval_expr(cx, &e.e2);
        let s1 = v1.string_value(cx);
        let s2 = v2.string_value(cx);
        new_str(cx, rc_string(format!("{}{}", s1, s2)))
      }
    },
    expr::E::IfElse(e) => {
      if eval_expr(cx, &e.condition).bool_value() {
        eval_expr(cx, &e.e1)
      } else {
        eval_expr(cx, &e.e2)
      }
    }
    expr::E::Match(e) => {
      let (tag, data) = eval_expr(cx, &e.matched).variant_value(cx).clone();
      let matched_pattern =
        e.cases.iter().find(|el| el.tag.name.eq(&tag)).expect(&format!("Missing tag {}", tag));
      if let Some(data_variable) = &matched_pattern.data_variable {
        cx.local_values.push_scope();
        cx.local_values.insert(&data_variable.0.name, data);
        let v = eval_expr(cx, &matched_pattern.body);
        cx.local_values.pop_scope();
        v
      } else {
        eval_expr(cx, &matched_pattern.body)
      }
    }
    expr::E::Lambda(e) => {
      let mut captured = HashMap::new();
      for name in e.captured.keys() {
        captured
          .insert(name.clone(), *cx.local_values.get(name).expect(&format!("Missing {}", name)));
      }
      new_fn(
        cx,
        FunctionValue {
          parameters: e.parameters.iter().map(|it| it.name.name.clone()).collect_vec(),
          body: FunctionImpl::Expr(e.body.deref().clone()),
          captured,
        },
      )
    }
    expr::E::Block(e) => {
      cx.local_values.push_scope();
      for stmt in &e.statements {
        let assigned_value = eval_expr(cx, &stmt.assigned_expression);
        match &stmt.pattern {
          expr::Pattern::Object(_, destructured_names) => {
            for destructured_name in destructured_names {
              let k = if let Some(n) = &destructured_name.alias {
                &n.name
              } else {
                &destructured_name.field_name.name
              };
              let v = assigned_value
                .object_value(cx)
                .get(&destructured_name.field_name.name)
                .expect(&format!("Missing field {}", destructured_name.field_name.name));
              cx.local_values.insert(k, *v);
            }
          }
          expr::Pattern::Id(_, n) => {
            cx.local_values.insert(n, assigned_value);
          }
          expr::Pattern::Wildcard(_) => {}
        }
      }
      let v =
        if let Some(final_expr) = &e.expression { eval_expr(cx, final_expr) } else { Value::Unit };
      cx.local_values.pop_scope();
      v
    }
  }
}

fn new_cx(module: &Module) -> InterpretationContext {
  let mut classes = HashMap::new();
  for toplevel in &module.toplevels {
    if let Toplevel::Class(c) = toplevel {
      let mut functions = HashMap::new();
      let mut methods = HashMap::new();
      for member in &c.members {
        let v = FunctionValue {
          parameters: member.decl.parameters.iter().map(|it| it.name.name.clone()).collect_vec(),
          body: FunctionImpl::Expr(member.body.clone()),
          captured: HashMap::new(),
        };
        if member.decl.is_method {
          methods.insert(member.decl.name.name.clone(), v);
        } else {
          functions.insert(member.decl.name.name.clone(), v);
        }
      }
      if c.type_definition.is_object {
        let parameters = c.type_definition.names.iter().map(|it| it.name.clone()).collect_vec();
        let body = FunctionImpl::InitObject(parameters.clone());
        functions.insert(rcs("init"), FunctionValue { parameters, body, captured: HashMap::new() });
      } else {
        for name in &c.type_definition.names {
          let body = FunctionImpl::InitVariant(name.name.clone());
          functions.insert(
            name.name.clone(),
            FunctionValue { parameters: vec![rcs("data")], body, captured: HashMap::new() },
          );
        }
      }
      classes.insert(c.name.name.clone(), ClassValue { functions, methods });
    }
  }
  classes.insert(
    rcs("Builtins"),
    ClassValue {
      functions: HashMap::from([
        (
          rcs("stringToInt"),
          FunctionValue {
            parameters: vec![rcs("v")],
            body: FunctionImpl::StringToInt,
            captured: HashMap::new(),
          },
        ),
        (
          rcs("intToString"),
          FunctionValue {
            parameters: vec![rcs("v")],
            body: FunctionImpl::IntToString,
            captured: HashMap::new(),
          },
        ),
        (
          rcs("println"),
          FunctionValue {
            parameters: vec![rcs("v")],
            body: FunctionImpl::Println,
            captured: HashMap::new(),
          },
        ),
        (
          rcs("panic"),
          FunctionValue {
            parameters: vec![rcs("v")],
            body: FunctionImpl::Panic,
            captured: HashMap::new(),
          },
        ),
      ]),
      methods: HashMap::new(),
    },
  );
  InterpretationContext {
    classes,
    local_values: LocalStackedContext::new(),
    heap_counter: 0,
    string_heap: HashMap::new(),
    object_heap: HashMap::new(),
    variant_heap: HashMap::new(),
    function_heap: HashMap::new(),
    printed: vec![],
  }
}

fn eval_main_function(cx: &mut InterpretationContext, body: FunctionImpl) {
  if let FunctionImpl::Expr(e) = body {
    eval_expr(cx, &e);
  } else {
    panic!()
  }
}

pub(super) fn run(module: &Module) -> String {
  let mut cx = new_cx(module);
  let main_fun_body =
    cx.classes.get(&rcs("Main")).unwrap().functions.get(&rcs("main")).unwrap().body.clone();
  eval_main_function(&mut cx, main_fun_body);
  let mut sb = String::new();
  for printed in cx.printed {
    sb.push_str(&printed);
    sb.push('\n');
  }
  sb
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::{
      source::{Id, InterfaceDeclarationCommon, Type},
      Location, ModuleReference, Reason,
    },
    checker::type_check_single_module_source,
    errors::ErrorSet,
    parser::parse_source_module_from_text,
  };
  use pretty_assertions::assert_eq;
  use std::sync::Arc;

  fn empty_cx() -> InterpretationContext {
    InterpretationContext {
      classes: HashMap::new(),
      local_values: LocalStackedContext::new(),
      heap_counter: 0,
      string_heap: HashMap::new(),
      object_heap: HashMap::new(),
      variant_heap: HashMap::new(),
      function_heap: HashMap::new(),
      printed: vec![],
    }
  }

  fn dummy_expr_common() -> expr::ExpressionCommon {
    expr::ExpressionCommon {
      loc: Location::dummy(),
      associated_comments: Arc::new(vec![]),
      type_: Arc::new(Type::int_type(Reason::dummy())),
    }
  }

  fn eval_expr_simple(expr: &expr::E) -> Value {
    let cx = &mut empty_cx();
    eval_expr(cx, expr)
  }

  #[test]
  fn value_tests() {
    assert!(!format!("{:?}", Value::Int(1)).is_empty());
  }

  #[should_panic]
  #[test]
  fn value_panic_test_1() {
    Value::Int(1).bool_value();
  }

  #[should_panic]
  #[test]
  fn value_panic_test_2() {
    Value::Boolean(true).int_value();
  }

  #[should_panic]
  #[test]
  fn value_panic_test_3() {
    Value::Int(1).string_value(&empty_cx());
  }

  #[should_panic]
  #[test]
  fn value_panic_test_4() {
    Value::Int(1).object_value(&empty_cx());
  }

  #[should_panic]
  #[test]
  fn value_panic_test_5() {
    Value::Int(1).variant_value(&empty_cx());
  }

  #[should_panic]
  #[test]
  fn value_panic_test_6() {
    Value::Int(1).function_value(&empty_cx());
  }

  #[test]
  fn literal_tests() {
    assert_eq!(
      Value::Int(1),
      eval_expr_simple(&expr::E::Literal(dummy_expr_common(), Literal::Int(1)))
    );
    assert_eq!(
      Value::Boolean(true),
      eval_expr_simple(&expr::E::Literal(dummy_expr_common(), Literal::Bool(true)))
    );
    eval_expr_simple(&expr::E::Literal(dummy_expr_common(), Literal::String(rcs("a"))));
  }

  #[should_panic]
  #[test]
  fn this_panic_tests() {
    eval_expr_simple(&expr::E::This(dummy_expr_common()));
  }

  #[should_panic]
  #[test]
  fn variable_panic_tests() {
    eval_expr_simple(&expr::E::Id(dummy_expr_common(), Id::from("a")));
  }

  #[test]
  fn this_variable_passing_tests() {
    let mut cx = empty_cx();
    cx.local_values.insert(&rcs("a"), Value::Int(1));
    cx.local_values.insert(&rcs("this"), Value::Int(1));
    assert_eq!(Value::Int(1), eval_expr(&mut cx, &expr::E::This(dummy_expr_common())));
    assert_eq!(Value::Int(1), eval_expr(&mut cx, &expr::E::Id(dummy_expr_common(), Id::from("a"))));
  }

  #[should_panic]
  #[test]
  fn run_without_main_test() {
    run(&Module {
      imports: vec![],
      toplevels: vec![Toplevel::Interface(InterfaceDeclarationCommon {
        loc: Location::dummy(),
        associated_comments: Arc::new(vec![]),
        name: Id::from(""),
        type_parameters: vec![],
        extends_or_implements_nodes: vec![],
        type_definition: (),
        members: vec![],
      })],
    });
  }

  #[should_panic]
  #[test]
  fn no_main_fun_panic_test() {
    let mut cx = empty_cx();
    eval_main_function(&mut cx, FunctionImpl::Panic);
  }

  #[should_panic]
  #[test]
  fn panic_call_test() {
    let mut error_set = ErrorSet::new();
    let parsed_module = parse_source_module_from_text(
      r#"class Main {
        function main(): unit = {
          val a = 3;
          val _ = () -> a;
          Builtins.panic(\"\")
        }
      }"#,
      &ModuleReference::ordinary(vec![rcs("Test")]),
      &mut error_set,
    );
    run(&type_check_single_module_source(parsed_module, &mut error_set));
  }
}
