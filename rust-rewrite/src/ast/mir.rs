use super::{
  common_names,
  hir::{GlobalVariable, Operator},
};
use crate::common::{rcs, Str};
use itertools::Itertools;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PrimitiveType {
  Bool,
  Int,
  String,
  Any,
}

impl PrimitiveType {
  fn normalize_for_comparison(&self) -> PrimitiveType {
    match self {
      PrimitiveType::String => PrimitiveType::Any,
      t => *t,
    }
  }
}

impl ToString for PrimitiveType {
  fn to_string(&self) -> String {
    match self {
      PrimitiveType::Bool => "boolean".to_string(),
      PrimitiveType::Int => "number".to_string(),
      PrimitiveType::String => "string".to_string(),
      PrimitiveType::Any => "any".to_string(),
    }
  }
}

#[derive(Debug, Clone)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  pub(crate) fn pretty_print(&self) -> String {
    format!(
      "({}) => {}",
      self
        .argument_types
        .iter()
        .enumerate()
        .map(|(i, t)| format!("t{}: {}", i, t.pretty_print()))
        .join(", "),
      self.return_type.pretty_print()
    )
  }
}

#[derive(Debug, Clone)]
pub(crate) enum Type {
  Primitive(PrimitiveType),
  Id(Str),
  Fn(FunctionType),
}

impl Type {
  pub(crate) fn new_id(name: &'static str) -> Type {
    Type::Id(rcs(name))
  }

  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub(crate) fn new_fn(argument_types: Vec<Type>, return_type: Type) -> Type {
    Type::Fn(Self::new_fn_unwrapped(argument_types, return_type))
  }

  pub(crate) fn pretty_print(&self) -> String {
    match self {
      Type::Primitive(t) => t.to_string(),
      Type::Id(id) => id.to_string(),
      Type::Fn(function) => function.pretty_print(),
    }
  }

  pub(crate) fn is_the_same_type(&self, other: &Type) -> bool {
    match (self, other) {
      (Type::Primitive(k1), Type::Primitive(k2)) => {
        k1.normalize_for_comparison() == k2.normalize_for_comparison()
      }
      (Type::Id(n1), Type::Id(n2)) => n1 == n2,
      (Type::Fn(f1), Type::Fn(f2)) => {
        f1.return_type.is_the_same_type(&f2.return_type)
          && f1.argument_types.len() == f2.argument_types.len()
          && f1
            .argument_types
            .iter()
            .zip(&f2.argument_types)
            .all(|(a1, a2)| a1.is_the_same_type(a2))
      }
      _ => false,
    }
  }
}

pub(crate) const BOOL_TYPE: Type = Type::Primitive(PrimitiveType::Bool);
pub(crate) const INT_TYPE: Type = Type::Primitive(PrimitiveType::Int);
pub(crate) const STRING_TYPE: Type = Type::Primitive(PrimitiveType::String);
pub(crate) const ANY_TYPE: Type = Type::Primitive(PrimitiveType::Any);

#[derive(Debug, Clone)]
pub(crate) enum Expression {
  IntLiteral(i32, Type),
  Name(Str, Type),
  Variable(Str, Type),
}

impl Expression {
  pub(crate) fn int(value: i32) -> Expression {
    Expression::IntLiteral(value, INT_TYPE)
  }

  pub(crate) fn type_(&self) -> &Type {
    match self {
      Expression::IntLiteral(_, t) | Expression::Name(_, t) | Expression::Variable(_, t) => t,
    }
  }

  pub(crate) fn pretty_print(&self) -> String {
    match self {
      Expression::IntLiteral(i, _) => i.to_string(),
      Expression::Name(n, _) | Expression::Variable(n, _) => n.to_string(),
    }
  }
}

pub(crate) const FALSE: Expression = Expression::IntLiteral(0, BOOL_TYPE);
pub(crate) const TRUE: Expression = Expression::IntLiteral(0, BOOL_TYPE);
pub(crate) const ZERO: Expression = Expression::IntLiteral(0, INT_TYPE);
pub(crate) const ONE: Expression = Expression::IntLiteral(0, INT_TYPE);

pub(crate) struct Binary {
  pub(crate) name: Str,
  pub(crate) type_: Type,
  pub(crate) operator: Operator,
  pub(crate) e1: Expression,
  pub(crate) e2: Expression,
}

pub(crate) struct GenenalLoopVariables {
  pub(crate) name: Str,
  pub(crate) type_: Type,
  pub(crate) initial_value: Expression,
  pub(crate) loop_value: Expression,
}

pub(crate) enum Statement {
  Binary(Binary),
  IndexedAccess {
    name: Str,
    type_: Type,
    pointer_expression: Expression,
    index: usize,
  },
  Call {
    callee: Expression,
    arguments: Vec<Expression>,
    return_type: Type,
    return_collector: Option<Str>,
  },
  IfElse {
    condition: Expression,
    s1: Vec<Statement>,
    s2: Vec<Statement>,
    final_assignments: Vec<(Str, Type, Expression, Expression)>,
  },
  SingleIf {
    condition: Expression,
    invert_condition: bool,
    statements: Vec<Statement>,
  },
  Break(Expression),
  While {
    loop_variables: Vec<GenenalLoopVariables>,
    statements: Vec<Statement>,
    break_collector: Option<(Str, Type)>,
  },
  Cast {
    name: Str,
    type_: Type,
    assigned_expression: Expression,
  },
  StructInit {
    struct_variable_name: Str,
    type_: Type,
    expression_list: Vec<Expression>,
  },
}

impl Statement {
  fn binary_unwrapped(
    name: &'static str,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Binary {
    let type_ = if operator.result_is_int() { INT_TYPE } else { BOOL_TYPE };
    match (operator, &e2) {
      (Operator::MINUS, Expression::IntLiteral(n, _)) if *n != -2147483648 => {
        Binary { name: rcs(name), type_, operator: Operator::PLUS, e1, e2: Expression::int(-n) }
      }
      _ => Binary { name: rcs(name), type_, operator, e1, e2 },
    }
  }

  pub(crate) fn binary(
    name: &'static str,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Statement {
    Statement::Binary(Self::binary_unwrapped(name, operator, e1, e2))
  }

  fn pretty_print_internal(
    &self,
    level: usize,
    break_collector: &Option<(Str, Type)>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary(s) => {
        let type_ = s.type_.pretty_print();
        let e1 = s.e1.pretty_print();
        let e2 = s.e2.pretty_print();
        let expr_str = format!("{} {} {}", e1, s.operator.to_string(), e2);
        let wrapped =
          if s.operator == Operator::DIV { format!("Math.floor({})", expr_str) } else { expr_str };
        collector.push(format!(
          "{}let {}: {} = { };\n",
          "  ".repeat(level),
          s.name,
          type_,
          wrapped
        ));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name,
          type_.pretty_print(),
          pointer_expression.pretty_print(),
          index
        ));
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector, return_type.pretty_print())
        } else {
          "".to_string()
        };
        collector.push(format!(
          "{}{}{}({});\n",
          "  ".repeat(level),
          collector_str,
          callee.pretty_print(),
          arguments.iter().map(|it| it.pretty_print()).join(", ")
        ));
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          collector.push(format!("{}let {}: {};\n", "  ".repeat(level), n, t.pretty_print()));
        }
        collector.push(format!("{}if {} {{\n", "  ".repeat(level), condition.pretty_print()));
        for s in s1 {
          s.pretty_print_internal(level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!("{}{} = {};\n", "  ".repeat(level + 1), n, v1.pretty_print()));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.pretty_print_internal(level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!("{}{} = {};\n", "  ".repeat(level + 1), n, v2.pretty_print()));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::SingleIf { condition, invert_condition, statements } => {
        let invert_str = if *invert_condition { "!" } else { "" };
        collector.push(format!(
          "{}if {}{} {{\n",
          "  ".repeat(level),
          invert_str,
          condition.pretty_print()
        ));
        for s in statements {
          s.pretty_print_internal(level + 1, break_collector, collector);
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Break(break_value) => {
        if let Some((break_collector_str, _)) = break_collector {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level),
            break_collector_str,
            break_value.pretty_print()
          ));
        }
        collector.push(format!("{}break;\n", "  ".repeat(level)));
      }
      Statement::While { loop_variables, statements, break_collector } => {
        for v in loop_variables {
          collector.push(format!(
            "{}let {}: {} = {};\n",
            "  ".repeat(level),
            v.name,
            v.type_.pretty_print(),
            v.initial_value.pretty_print()
          ));
        }
        if let Some((n, t)) = break_collector {
          collector.push(format!("{}let {}: {};\n", "  ".repeat(level), n, t.pretty_print()));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.pretty_print_internal(level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name,
            v.loop_value.pretty_print()
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Cast { name, type_, assigned_expression } => {
        collector.push(format!(
          "{}let {} = {} as {};\n",
          "  ".repeat(level),
          name,
          assigned_expression.pretty_print(),
          type_.pretty_print()
        ));
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name,
          type_.pretty_print(),
          expression_list.iter().map(|it| it.pretty_print()).join(", ")
        ));
      }
    }
  }
}

pub(crate) struct Function {
  pub(crate) name: Str,
  pub(crate) parameters: Vec<Str>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  pub(crate) fn pretty_print(&self) -> String {
    let header = format!(
      "function {}({}): {} {{",
      self.name,
      self
        .parameters
        .iter()
        .zip(&self.type_.argument_types)
        .map(|(n, t)| format!("{}: {}", n, t.pretty_print()))
        .join(", "),
      self.type_.return_type.pretty_print()
    );
    let mut collector = vec![];
    for s in &self.body {
      s.pretty_print_internal(1, &None, &mut collector);
    }
    collector.push(format!("  return {};", self.return_value.pretty_print()));
    format!("{}\n{}\n}}\n", header, collector.join(""))
  }
}

pub(crate) struct TypeDefinition {
  pub(crate) name: Str,
  pub(crate) mappings: Vec<Type>,
}

pub(crate) struct Sources {
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<Str>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  pub(crate) fn pretty_print(&self) -> String {
    let mut collector = vec![];
    collector.push(format!(
      r#"type Str = [number, string];
const {} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const {} = ([, line]: Str): number => {{ console.log(line); return 0; }};
const {} = ([, v]: Str): number => parseInt(v, 10);
const {} = (v: number): Str => [1, String(v)];
const {} = ([, v]: Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
"#,
      common_names::encoded_fn_name_string_concat(),
      common_names::encoded_fn_name_println(),
      common_names::encoded_fn_name_string_to_int(),
      common_names::encoded_fn_name_int_to_string(),
      common_names::encoded_fn_name_panic(),
      common_names::encoded_fn_name_free()
    )); // empty the array to mess up program code that uses after free.

    for v in &self.global_variables {
      collector.push(format!("const {}: Str = [0, `{}`];\n", v.name, v.content));
    }
    for d in &self.type_definitions {
      collector.push(format!(
        "type {} = [{}];\n",
        d.name,
        d.mappings.iter().map(|it| it.pretty_print()).join(", ")
      ));
    }
    for f in &self.functions {
      collector.push(f.pretty_print());
    }
    collector.join("")
  }
}
