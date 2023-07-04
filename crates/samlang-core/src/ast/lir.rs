use super::{
  hir::{GlobalVariable, Operator},
  mir::{FunctionName, SymbolTable, TypeNameId},
};
use crate::common::{Heap, PStr};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PrimitiveType {
  Int,
  Any,
}

impl PrimitiveType {
  fn as_str(&self) -> &'static str {
    match self {
      PrimitiveType::Int => "number",
      PrimitiveType::Any => "any",
    }
  }
}

#[derive(Debug, Clone)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    format!(
      "({}) => {}",
      self
        .argument_types
        .iter()
        .enumerate()
        .map(|(i, t)| format!("t{}: {}", i, t.pretty_print(heap, table)))
        .join(", "),
      self.return_type.pretty_print(heap, table)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Type {
  Primitive(PrimitiveType),
  Id(TypeNameId),
  Fn(FunctionType),
}

impl Type {
  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub(crate) fn new_fn(argument_types: Vec<Type>, return_type: Type) -> Type {
    Type::Fn(Self::new_fn_unwrapped(argument_types, return_type))
  }

  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    match self {
      Type::Primitive(t) => t.as_str().to_string(),
      Type::Id(id) => id.encoded(heap, table),
      Type::Fn(function) => function.pretty_print(heap, table),
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
pub(crate) const ANY_TYPE: Type = Type::Primitive(PrimitiveType::Any);

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Expression {
  IntLiteral(i32),
  StringName(PStr),
  Variable(PStr, Type),
  FnName(FunctionName, Type),
}

impl Expression {
  pub(crate) fn int(value: i32) -> Expression {
    Expression::IntLiteral(value)
  }

  pub(crate) fn ref_countable(&self) -> bool {
    match self {
      Expression::IntLiteral(_) | Expression::FnName(_, _) => false,
      Expression::StringName(_) => true,
      Expression::Variable(_, t) => t.as_id().is_some(),
    }
  }

  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    match self {
      Expression::IntLiteral(i) => i.to_string(),
      Expression::StringName(n) | Expression::Variable(n, _) => n.as_str(heap).to_string(),
      Expression::FnName(n, _) => n.encoded(heap, table),
    }
  }
}

pub(crate) const ZERO: Expression = Expression::IntLiteral(0);
pub(crate) const ONE: Expression = Expression::IntLiteral(1);

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
      (Operator::MINUS, Expression::IntLiteral(n)) if *n != -2147483648 => {
        Statement::Binary { name, operator: Operator::PLUS, e1, e2: Expression::int(-n) }
      }
      _ => Statement::Binary { name, operator, e1, e2 },
    }
  }

  fn pretty_print_internal(
    &self,
    heap: &Heap,
    table: &SymbolTable,
    level: usize,
    break_collector: &Option<(PStr, Type)>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary { name, operator, e1, e2 } => {
        let e1 = e1.pretty_print(heap, table);
        let e2 = e2.pretty_print(heap, table);
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
          type_.pretty_print(heap, table),
          pointer_expression.pretty_print(heap, table),
          index
        ));
      }
      Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        collector.push(format!(
          "{}{}[{}] = {};\n",
          "  ".repeat(level),
          pointer_expression.pretty_print(heap, table),
          index,
          assigned_expression.pretty_print(heap, table),
        ));
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector.as_str(heap), return_type.pretty_print(heap, table))
        } else {
          "".to_string()
        };
        collector.push(format!(
          "{}{}{}({});\n",
          "  ".repeat(level),
          collector_str,
          callee.pretty_print(heap, table),
          arguments.iter().map(|it| it.pretty_print(heap, table)).join(", ")
        ));
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            n.as_str(heap),
            t.pretty_print(heap, table)
          ));
        }
        collector.push(format!(
          "{}if ({}) {{\n",
          "  ".repeat(level),
          condition.pretty_print(heap, table)
        ));
        for s in s1 {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v1.pretty_print(heap, table)
          ));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v2.pretty_print(heap, table)
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
          condition.pretty_print(heap, table)
        ));
        for s in statements {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Break(break_value) => {
        if let Some((break_collector_str, _)) = break_collector {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level),
            break_collector_str.as_str(heap),
            break_value.pretty_print(heap, table)
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
            v.type_.pretty_print(heap, table),
            v.initial_value.pretty_print(heap, table)
          ));
        }
        if let Some((n, t)) = break_collector {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            n.as_str(heap),
            t.pretty_print(heap, table)
          ));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name.as_str(heap),
            v.loop_value.pretty_print(heap, table)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Cast { name, type_, assigned_expression } => {
        collector.push(format!(
          "{}let {} = {} as {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.pretty_print(heap, table),
          type_.pretty_print(heap, table)
        ));
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name.as_str(heap),
          type_.pretty_print(heap, table),
          expression_list.iter().map(|it| it.pretty_print(heap, table)).join(", ")
        ));
      }
    }
  }
}

pub(crate) struct Function {
  pub(crate) name: FunctionName,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  pub(super) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    let header = format!(
      "function {}({}): {} {{",
      self.name.encoded(heap, table),
      self
        .parameters
        .iter()
        .zip(&self.type_.argument_types)
        .map(|(n, t)| format!("{}: {}", n.as_str(heap), t.pretty_print(heap, table)))
        .join(", "),
      self.type_.return_type.pretty_print(heap, table)
    );
    let mut collector = vec![];
    for s in &self.body {
      s.pretty_print_internal(heap, table, 1, &None, &mut collector);
    }
    collector.push(format!("  return {};", self.return_value.pretty_print(heap, table)));
    format!("{}\n{}\n}}\n", header, collector.join(""))
  }
}

pub(crate) struct TypeDefinition {
  pub(crate) name: TypeNameId,
  pub(crate) mappings: Vec<Type>,
}

pub(crate) struct Sources {
  pub(crate) symbol_table: SymbolTable,
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<FunctionName>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = vec![];
    collector.push(format!(
      r#"const {} = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const {} = (_: number, [, line]: _Str): number => {{ console.log(line); return 0; }};
const {} = ([, v]: _Str): number => parseInt(v, 10);
const {} = (_: number, v: number): _Str => [1, String(v)];
const {} = (_: number, [, v]: _Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
"#,
      FunctionName::STR_CONCAT.encoded(heap, &self.symbol_table),
      FunctionName::PROCESS_PRINTLN.encoded(heap, &self.symbol_table),
      FunctionName::STR_TO_INT.encoded(heap, &self.symbol_table),
      FunctionName::STR_FROM_INT.encoded(heap, &self.symbol_table),
      FunctionName::PROCESS_PANIC.encoded(heap, &self.symbol_table),
      FunctionName::BUILTIN_FREE.encoded(heap, &self.symbol_table),
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
        d.name.encoded(heap, &self.symbol_table),
        d.mappings.iter().map(|it| it.pretty_print(heap, &self.symbol_table)).join(", ")
      ));
    }
    for f in &self.functions {
      collector.push(f.pretty_print(heap, &self.symbol_table));
    }
    collector.join("")
  }
}
