use super::{
  common_names,
  hir::{GlobalVariable, Operator},
};
use crate::common::{well_known_pstrs, Heap, PStr};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PrimitiveType {
  Int,
  Any,
}

impl ToString for PrimitiveType {
  fn to_string(&self) -> String {
    match self {
      PrimitiveType::Int => "number".to_string(),
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
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    format!(
      "({}) => {}",
      self
        .argument_types
        .iter()
        .enumerate()
        .map(|(i, t)| format!("t{}: {}", i, t.pretty_print(heap)))
        .join(", "),
      self.return_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Type {
  Primitive(PrimitiveType),
  Id(PStr),
  Fn(FunctionType),
}

impl Type {
  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub(crate) fn new_fn(argument_types: Vec<Type>, return_type: Type) -> Type {
    Type::Fn(Self::new_fn_unwrapped(argument_types, return_type))
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Type::Primitive(t) => t.to_string(),
      Type::Id(id) => id.as_str(heap).to_string(),
      Type::Fn(function) => function.pretty_print(heap),
    }
  }

  pub(crate) fn is_the_same_type(&self, other: &Type) -> bool {
    match (self, other) {
      (Type::Primitive(k1), Type::Primitive(k2)) => k1 == k2,
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

pub(crate) const INT_TYPE: Type = Type::Primitive(PrimitiveType::Int);
pub(crate) const STRING_TYPE: Type = Type::Id(well_known_pstrs::UNDERSCORE_STR);
pub(crate) const ANY_TYPE: Type = Type::Primitive(PrimitiveType::Any);

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Expression {
  IntLiteral(i32, Type),
  Name(PStr, Type),
  Variable(PStr, Type),
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

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Expression::IntLiteral(i, _) => i.to_string(),
      Expression::Name(n, _) | Expression::Variable(n, _) => n.as_str(heap).to_string(),
    }
  }
}

pub(crate) const ZERO: Expression = Expression::IntLiteral(0, INT_TYPE);
pub(crate) const ONE: Expression = Expression::IntLiteral(1, INT_TYPE);

pub(crate) struct GenenalLoopVariable {
  pub(crate) name: PStr,
  pub(crate) type_: Type,
  pub(crate) initial_value: Expression,
  pub(crate) loop_value: Expression,
}

pub(crate) enum Statement {
  Binary {
    name: PStr,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  },
  IndexedAccess {
    name: PStr,
    type_: Type,
    pointer_expression: Expression,
    index: usize,
  },
  IndexedAssign {
    assigned_expression: Expression,
    pointer_expression: Expression,
    index: usize,
  },
  Call {
    callee: Expression,
    arguments: Vec<Expression>,
    return_type: Type,
    return_collector: Option<PStr>,
  },
  IfElse {
    condition: Expression,
    s1: Vec<Statement>,
    s2: Vec<Statement>,
    final_assignments: Vec<(PStr, Type, Expression, Expression)>,
  },
  SingleIf {
    condition: Expression,
    invert_condition: bool,
    statements: Vec<Statement>,
  },
  Break(Expression),
  While {
    loop_variables: Vec<GenenalLoopVariable>,
    statements: Vec<Statement>,
    break_collector: Option<(PStr, Type)>,
  },
  Cast {
    name: PStr,
    type_: Type,
    assigned_expression: Expression,
  },
  StructInit {
    struct_variable_name: PStr,
    type_: Type,
    expression_list: Vec<Expression>,
  },
}

impl Statement {
  pub(crate) fn binary(
    name: PStr,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Statement {
    match (operator, &e2) {
      (Operator::MINUS, Expression::IntLiteral(n, _)) if *n != -2147483648 => {
        Statement::Binary { name, operator: Operator::PLUS, e1, e2: Expression::int(-n) }
      }
      _ => Statement::Binary { name, operator, e1, e2 },
    }
  }

  fn pretty_print_internal(
    &self,
    heap: &Heap,
    level: usize,
    break_collector: &Option<(PStr, Type)>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary { name, operator, e1, e2 } => {
        let e1 = e1.pretty_print(heap);
        let e2 = e2.pretty_print(heap);
        let expr_str = format!("{} {} {}", e1, operator.as_str(), e2);
        let wrapped = match *operator {
          Operator::DIV => {
            // Necessary to preserve semantics
            format!("Math.floor({expr_str})")
          }
          Operator::LT
          | Operator::LE
          | Operator::GT
          | Operator::GE
          | Operator::EQ
          | Operator::NE => {
            // Necessary to make TS happy
            format!("Number({expr_str})")
          }
          Operator::MUL
          | Operator::MOD
          | Operator::PLUS
          | Operator::MINUS
          | Operator::LAND
          | Operator::LOR
          | Operator::SHL
          | Operator::SHR
          | Operator::XOR => expr_str,
        };
        collector.push(format!("{}let {} = {};\n", "  ".repeat(level), name.as_str(heap), wrapped));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_.pretty_print(heap),
          pointer_expression.pretty_print(heap),
          index
        ));
      }
      Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        collector.push(format!(
          "{}{}[{}] = {};\n",
          "  ".repeat(level),
          pointer_expression.pretty_print(heap),
          index,
          assigned_expression.pretty_print(heap),
        ));
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector.as_str(heap), return_type.pretty_print(heap))
        } else {
          "".to_string()
        };
        collector.push(format!(
          "{}{}{}({});\n",
          "  ".repeat(level),
          collector_str,
          callee.pretty_print(heap),
          arguments.iter().map(|it| it.pretty_print(heap)).join(", ")
        ));
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            n.as_str(heap),
            t.pretty_print(heap)
          ));
        }
        collector.push(format!("{}if ({}) {{\n", "  ".repeat(level), condition.pretty_print(heap)));
        for s in s1 {
          s.pretty_print_internal(heap, level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v1.pretty_print(heap)
          ));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.pretty_print_internal(heap, level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v2.pretty_print(heap)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::SingleIf { condition, invert_condition, statements } => {
        let invert_str = if *invert_condition { "!" } else { "" };
        collector.push(format!(
          "{}if ({}{}) {{\n",
          "  ".repeat(level),
          invert_str,
          condition.pretty_print(heap)
        ));
        for s in statements {
          s.pretty_print_internal(heap, level + 1, break_collector, collector);
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Break(break_value) => {
        if let Some((break_collector_str, _)) = break_collector {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level),
            break_collector_str.as_str(heap),
            break_value.pretty_print(heap)
          ));
        }
        collector.push(format!("{}break;\n", "  ".repeat(level)));
      }
      Statement::While { loop_variables, statements, break_collector } => {
        for v in loop_variables {
          collector.push(format!(
            "{}let {}: {} = {};\n",
            "  ".repeat(level),
            v.name.as_str(heap),
            v.type_.pretty_print(heap),
            v.initial_value.pretty_print(heap)
          ));
        }
        if let Some((n, t)) = break_collector {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            n.as_str(heap),
            t.pretty_print(heap)
          ));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.pretty_print_internal(heap, level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name.as_str(heap),
            v.loop_value.pretty_print(heap)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Cast { name, type_, assigned_expression } => {
        collector.push(format!(
          "{}let {} = {} as {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.pretty_print(heap),
          type_.pretty_print(heap)
        ));
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name.as_str(heap),
          type_.pretty_print(heap),
          expression_list.iter().map(|it| it.pretty_print(heap)).join(", ")
        ));
      }
    }
  }
}

pub(crate) struct Function {
  pub(crate) name: PStr,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let header = format!(
      "function {}({}): {} {{",
      self.name.as_str(heap),
      self
        .parameters
        .iter()
        .zip(&self.type_.argument_types)
        .map(|(n, t)| format!("{}: {}", n.as_str(heap), t.pretty_print(heap)))
        .join(", "),
      self.type_.return_type.pretty_print(heap)
    );
    let mut collector = vec![];
    for s in &self.body {
      s.pretty_print_internal(heap, 1, &None, &mut collector);
    }
    collector.push(format!("  return {};", self.return_value.pretty_print(heap)));
    format!("{}\n{}\n}}\n", header, collector.join(""))
  }
}

pub(crate) struct TypeDefinition {
  pub(crate) name: PStr,
  pub(crate) mappings: Vec<Type>,
}

pub(crate) struct Sources {
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<PStr>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = vec![];
    collector.push(format!(
      r#"const {} = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const {} = (_: number, [, line]: _Str): number => {{ console.log(line); return 0; }};
const {} = (_: number, [, v]: _Str): number => parseInt(v, 10);
const {} = (_: number, v: number): _Str => [1, String(v)];
const {} = (_: number, [, v]: _Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
"#,
      common_names::encoded_fn_name_string_concat(),
      common_names::encoded_fn_name_println(),
      common_names::encoded_fn_name_string_to_int(),
      common_names::encoded_fn_name_int_to_string(),
      common_names::encoded_fn_name_panic(),
      common_names::ENCODED_FN_NAME_FREE
    )); // empty the array to mess up program code that uses after free.

    for v in &self.global_variables {
      collector.push(format!(
        "const {}: _Str = [0, `{}`];\n",
        v.name.as_str(heap),
        v.content.as_str(heap)
      ));
    }
    for d in &self.type_definitions {
      collector.push(format!(
        "type {} = [{}];\n",
        d.name.as_str(heap),
        d.mappings.iter().map(|it| it.pretty_print(heap)).join(", ")
      ));
    }
    for f in &self.functions {
      collector.push(f.pretty_print(heap));
    }
    collector.join("")
  }
}
