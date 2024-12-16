use super::{
  hir::{BinaryOperator, GlobalString},
  mir::{FunctionName, SymbolTable, TypeNameId},
};
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, PStr};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct FunctionType {
  pub argument_types: Vec<Type>,
  pub return_type: Box<Type>,
}

impl FunctionType {
  pub fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    collector.push('(');
    let mut iter = self.argument_types.iter().enumerate();
    if let Some((_, t)) = iter.next() {
      collector.push_str("t0: ");
      t.pretty_print(collector, heap, table);
      for (i, t) in iter {
        collector.push_str(", t");
        collector.push_str(&i.to_string());
        collector.push_str(": ");
        t.pretty_print(collector, heap, table);
      }
    }
    collector.push_str(") => ");
    self.return_type.pretty_print(collector, heap, table);
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub enum Type {
  Int32,
  Int31,
  AnyPointer,
  Id(TypeNameId),
  Fn(FunctionType),
}

impl Type {
  pub fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub fn new_fn(argument_types: Vec<Type>, return_type: Type) -> Type {
    Type::Fn(Self::new_fn_unwrapped(argument_types, return_type))
  }

  pub fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    match self {
      Type::Int32 => collector.push_str("number"),
      Type::Int31 => collector.push_str("i31"),
      Type::AnyPointer => collector.push_str("any"),
      Type::Id(id) => id.write_encoded(collector, heap, table),
      Type::Fn(function) => function.pretty_print(collector, heap, table),
    }
  }

  pub fn is_the_same_type(&self, other: &Type) -> bool {
    match (self, other) {
      (Type::Int32, Type::Int32)
      | (Type::Int31, Type::Int31)
      | (Type::AnyPointer, Type::AnyPointer) => true,
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

pub const INT_32_TYPE: Type = Type::Int32;
pub const INT_31_TYPE: Type = Type::Int31;
pub const ANY_POINTER_TYPE: Type = Type::AnyPointer;

#[derive(Debug, Clone, EnumAsInner)]
pub enum Expression {
  Int32Literal(i32),
  Int31Literal(i32),
  StringName(PStr),
  Variable(PStr, Type),
  FnName(FunctionName, Type),
}

impl Expression {
  pub fn int32(value: i32) -> Expression {
    Expression::Int32Literal(value)
  }

  pub fn ref_countable(&self) -> bool {
    match self {
      Expression::Int32Literal(_) | Expression::Int31Literal(_) | Expression::FnName(_, _) => false,
      Expression::StringName(_) => true,
      Expression::Variable(_, t) => t.as_id().is_some(),
    }
  }

  fn pretty_print(
    &self,
    collector: &mut String,
    heap: &Heap,
    symbol_table: &SymbolTable,
    str_table: &HashMap<PStr, usize>,
  ) {
    match self {
      Expression::Int32Literal(i) => collector.push_str(&i.to_string()),
      Expression::Int31Literal(i) => {
        let i32_form = i * 2 + 1;
        collector.push_str(&i32_form.to_string())
      }
      Expression::Variable(n, _) => collector.push_str(n.as_str(heap)),
      Expression::StringName(n) => {
        collector.push_str("GLOBAL_STRING_");
        collector.push_str(&str_table.get(n).unwrap().to_string());
      }
      Expression::FnName(n, _) => n.write_encoded(collector, heap, symbol_table),
    }
  }
}

pub const ZERO: Expression = Expression::Int32Literal(0);
pub const ONE: Expression = Expression::Int32Literal(1);

pub struct GenenalLoopVariable {
  pub name: PStr,
  pub type_: Type,
  pub initial_value: Expression,
  pub loop_value: Expression,
}

pub enum Statement {
  IsPointer {
    name: PStr,
    pointer_type: TypeNameId,
    operand: Expression,
  },
  Not {
    name: PStr,
    operand: Expression,
  },
  Binary {
    name: PStr,
    operator: BinaryOperator,
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
  LateInitDeclaration {
    name: PStr,
    type_: Type,
  },
  LateInitAssignment {
    name: PStr,
    assigned_expression: Expression,
  },
  StructInit {
    struct_variable_name: PStr,
    type_: Type,
    expression_list: Vec<Expression>,
  },
}

impl Statement {
  pub fn binary(name: PStr, operator: BinaryOperator, e1: Expression, e2: Expression) -> Statement {
    match (operator, &e2) {
      (BinaryOperator::MINUS, Expression::Int32Literal(n)) if *n != -2147483648 => {
        Statement::Binary { name, operator: BinaryOperator::PLUS, e1, e2: Expression::int32(-n) }
      }
      _ => Statement::Binary { name, operator, e1, e2 },
    }
  }

  fn append_spaces(collector: &mut String, repeat: usize) {
    for _ in 0..repeat {
      collector.push_str("  ");
    }
  }

  fn print_expression_list(
    collector: &mut String,
    heap: &Heap,
    symbol_table: &SymbolTable,
    str_table: &HashMap<PStr, usize>,
    expressions: &[Expression],
  ) {
    let mut iter = expressions.iter();
    if let Some(e) = iter.next() {
      e.pretty_print(collector, heap, symbol_table, str_table);
      for e in iter {
        collector.push_str(", ");
        e.pretty_print(collector, heap, symbol_table, str_table);
      }
    }
  }

  fn pretty_print_internal(
    &self,
    heap: &Heap,
    symbol_table: &SymbolTable,
    str_table: &HashMap<PStr, usize>,
    level: usize,
    break_collector: &Option<(PStr, Type)>,
    collector: &mut String,
  ) {
    match self {
      Statement::IsPointer { name, pointer_type: _, operand } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(" = typeof ");
        operand.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(" === 'object';\n");
      }
      Statement::Not { name, operand } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(" = !");
        operand.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(";\n");
      }
      Statement::Binary { name, operator, e1, e2 } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(" = ");
        match *operator {
          BinaryOperator::DIV => {
            // Necessary to preserve semantics
            collector.push_str("Math.floor(");
            e1.pretty_print(collector, heap, symbol_table, str_table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, symbol_table, str_table);
            collector.push(')');
          }
          BinaryOperator::LT
          | BinaryOperator::LE
          | BinaryOperator::GT
          | BinaryOperator::GE
          | BinaryOperator::EQ
          | BinaryOperator::NE => {
            // Necessary to make TS happy
            collector.push_str("Number(");
            e1.pretty_print(collector, heap, symbol_table, str_table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, symbol_table, str_table);
            collector.push(')');
          }
          BinaryOperator::MUL
          | BinaryOperator::MOD
          | BinaryOperator::PLUS
          | BinaryOperator::MINUS
          | BinaryOperator::LAND
          | BinaryOperator::LOR
          | BinaryOperator::SHL
          | BinaryOperator::SHR
          | BinaryOperator::XOR => {
            e1.pretty_print(collector, heap, symbol_table, str_table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, symbol_table, str_table);
          }
        };
        collector.push_str(";\n");
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, symbol_table);
        collector.push_str(" = ");
        pointer_expression.pretty_print(collector, heap, symbol_table, str_table);
        collector.push('[');
        collector.push_str(&index.to_string());
        collector.push_str("];\n");
      }
      Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        Self::append_spaces(collector, level);
        pointer_expression.pretty_print(collector, heap, symbol_table, str_table);
        collector.push('[');
        collector.push_str(&index.to_string());
        collector.push_str("] = ");
        assigned_expression.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(";\n");
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        Self::append_spaces(collector, level);
        if let Some(c) = return_collector {
          collector.push_str("let ");
          collector.push_str(c.as_str(heap));
          collector.push_str(": ");
          return_type.pretty_print(collector, heap, symbol_table);
          collector.push_str(" = ");
        }
        callee.pretty_print(collector, heap, symbol_table, str_table);
        collector.push('(');
        Self::print_expression_list(collector, heap, symbol_table, str_table, arguments);
        collector.push_str(");\n");
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          Self::append_spaces(collector, level);
          collector.push_str("let ");
          collector.push_str(n.as_str(heap));
          collector.push_str(": ");
          t.pretty_print(collector, heap, symbol_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("if (");
        condition.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(") {\n");
        for s in s1 {
          s.pretty_print_internal(
            heap,
            symbol_table,
            str_table,
            level + 1,
            break_collector,
            collector,
          );
        }
        for (n, _, v1, _) in final_assignments {
          Self::append_spaces(collector, level + 1);
          collector.push_str(n.as_str(heap));
          collector.push_str(" = ");
          v1.pretty_print(collector, heap, symbol_table, str_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("} else {\n");
        for s in s2 {
          s.pretty_print_internal(
            heap,
            symbol_table,
            str_table,
            level + 1,
            break_collector,
            collector,
          );
        }
        for (n, _, _, v2) in final_assignments {
          Self::append_spaces(collector, level + 1);
          collector.push_str(n.as_str(heap));
          collector.push_str(" = ");
          v2.pretty_print(collector, heap, symbol_table, str_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("}\n");
      }
      Statement::SingleIf { condition, invert_condition, statements } => {
        Self::append_spaces(collector, level);
        collector.push_str("if (");
        if *invert_condition {
          collector.push('!');
        }
        condition.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(") {\n");
        for s in statements {
          s.pretty_print_internal(
            heap,
            symbol_table,
            str_table,
            level + 1,
            break_collector,
            collector,
          );
        }
        Self::append_spaces(collector, level);
        collector.push_str("}\n");
      }
      Statement::Break(break_value) => {
        if let Some((break_collector_str, _)) = break_collector {
          Self::append_spaces(collector, level);
          collector.push_str(break_collector_str.as_str(heap));
          collector.push_str(" = ");
          break_value.pretty_print(collector, heap, symbol_table, str_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("break;\n");
      }
      Statement::While { loop_variables, statements, break_collector } => {
        for v in loop_variables {
          Self::append_spaces(collector, level);
          collector.push_str("let ");
          collector.push_str(v.name.as_str(heap));
          collector.push_str(": ");
          v.type_.pretty_print(collector, heap, symbol_table);
          collector.push_str(" = ");
          v.initial_value.pretty_print(collector, heap, symbol_table, str_table);
          collector.push_str(";\n");
        }
        if let Some((n, t)) = break_collector {
          Self::append_spaces(collector, level);
          collector.push_str("let ");
          collector.push_str(n.as_str(heap));
          collector.push_str(": ");
          t.pretty_print(collector, heap, symbol_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("while (true) {\n");
        for nested in statements {
          nested.pretty_print_internal(
            heap,
            symbol_table,
            str_table,
            level + 1,
            break_collector,
            collector,
          );
        }
        for v in loop_variables {
          Self::append_spaces(collector, level + 1);
          collector.push_str(v.name.as_str(heap));
          collector.push_str(" = ");
          v.loop_value.pretty_print(collector, heap, symbol_table, str_table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("}\n");
      }
      Statement::Cast { name, type_, assigned_expression } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(" = ");
        assigned_expression.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(" as unknown as ");
        type_.pretty_print(collector, heap, symbol_table);
        collector.push_str(";\n");
      }
      Statement::LateInitDeclaration { name, type_ } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, symbol_table);
        collector.push_str(" = undefined as any;\n");
      }
      Statement::LateInitAssignment { name, assigned_expression } => {
        Self::append_spaces(collector, level);
        collector.push_str(name.as_str(heap));
        collector.push_str(" = ");
        assigned_expression.pretty_print(collector, heap, symbol_table, str_table);
        collector.push_str(";\n");
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(struct_variable_name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, symbol_table);
        collector.push_str(" = [");
        Self::print_expression_list(collector, heap, symbol_table, str_table, expression_list);
        collector.push_str("];\n");
      }
    }
  }
}

pub struct Function {
  pub name: FunctionName,
  pub parameters: Vec<PStr>,
  pub type_: FunctionType,
  pub body: Vec<Statement>,
  pub return_value: Expression,
}

impl Function {
  fn pretty_print(
    &self,
    collector: &mut String,
    heap: &Heap,
    symbol_table: &SymbolTable,
    str_table: &HashMap<PStr, usize>,
  ) {
    collector.push_str("function ");
    self.name.write_encoded(collector, heap, symbol_table);
    collector.push('(');
    let mut iter = self.parameters.iter().zip(&self.type_.argument_types);
    if let Some((n, t)) = iter.next() {
      collector.push_str(n.as_str(heap));
      collector.push_str(": ");
      t.pretty_print(collector, heap, symbol_table);
      for (n, t) in iter {
        collector.push_str(", ");
        collector.push_str(n.as_str(heap));
        collector.push_str(": ");
        t.pretty_print(collector, heap, symbol_table);
      }
    }
    collector.push_str("): ");
    self.type_.return_type.pretty_print(collector, heap, symbol_table);
    collector.push_str(" {\n");
    for s in &self.body {
      s.pretty_print_internal(heap, symbol_table, str_table, 1, &None, collector);
    }
    collector.push_str("  return ");
    self.return_value.pretty_print(collector, heap, symbol_table, str_table);
    collector.push_str(";\n}\n");
  }
}

pub struct TypeDefinition {
  pub name: TypeNameId,
  pub mappings: Vec<Type>,
}

pub struct Sources {
  pub symbol_table: SymbolTable,
  pub global_variables: Vec<GlobalString>,
  pub type_definitions: Vec<TypeDefinition>,
  pub main_function_names: Vec<FunctionName>,
  pub functions: Vec<Function>,
}

pub fn ts_prolog() -> String {
  let heap = &Heap::new();
  let table = &SymbolTable::new();
  let mut collector = String::new();

  collector.push_str("type i31 = number;\n");
  collector.push_str("const ");
  FunctionName::STR_CONCAT.write_encoded(&mut collector, heap, table);
  collector.push_str(" = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];\n");

  collector.push_str("const ");
  FunctionName::PROCESS_PRINTLN.write_encoded(&mut collector, heap, table);
  collector.push_str(" = (_: number, [, l]: _Str): number => { console.log(l); return 0; };\n");

  collector.push_str("const ");
  FunctionName::STR_TO_INT.write_encoded(&mut collector, heap, table);
  collector.push_str(" = ([, v]: _Str): number => parseInt(v as unknown as string, 10);\n");

  collector.push_str("const ");
  FunctionName::STR_FROM_INT.write_encoded(&mut collector, heap, table);
  collector.push_str(" = (_: number, v: number): _Str => [1, String(v) as unknown as number];\n");

  collector.push_str("const ");
  FunctionName::PROCESS_PANIC.write_encoded(&mut collector, heap, table);
  collector
    .push_str(" = (_: number, [, v]: _Str): never => { throw Error(v as unknown as string); };\n");

  collector.push_str("// empty the array to mess up program code that uses after free.\n");
  collector.push_str("const ");
  FunctionName::BUILTIN_FREE.write_encoded(&mut collector, heap, table);
  collector.push_str(" = (v: any): number => { v.length = 0; return 0 };\n");

  collector
}

impl Sources {
  pub fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = ts_prolog();

    let mut str_lookup_table = HashMap::new();
    for (i, GlobalString(s)) in self.global_variables.iter().enumerate() {
      collector.push_str("const GLOBAL_STRING_");
      collector.push_str(&i.to_string());
      collector.push_str(": _Str = [0, `");
      collector.push_str(s.as_str(heap));
      collector.push_str("` as unknown as number];\n");
      str_lookup_table.insert(*s, i);
    }
    for d in &self.type_definitions {
      collector.push_str("type ");
      d.name.write_encoded(&mut collector, heap, &self.symbol_table);
      collector.push_str(" = [");
      let mut iter = d.mappings.iter();
      if let Some(t) = iter.next() {
        t.pretty_print(&mut collector, heap, &self.symbol_table);
        for t in iter {
          collector.push_str(", ");
          t.pretty_print(&mut collector, heap, &self.symbol_table);
        }
      }
      collector.push_str("];\n");
    }
    for f in &self.functions {
      f.pretty_print(&mut collector, heap, &self.symbol_table, &str_lookup_table);
    }
    collector
  }
}
