use super::{
  hir::{GlobalVariable, Operator},
  mir::{FunctionName, SymbolTable, TypeNameId},
};
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, PStr};

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
  pub(crate) fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
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

  fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    match self {
      Type::Primitive(t) => collector.push_str(t.as_str()),
      Type::Id(id) => id.write_encoded(collector, heap, table),
      Type::Fn(function) => function.pretty_print(collector, heap, table),
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

  fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    match self {
      Expression::IntLiteral(i) => collector.push_str(&i.to_string()),
      Expression::StringName(n) | Expression::Variable(n, _) => collector.push_str(n.as_str(heap)),
      Expression::FnName(n, _) => n.write_encoded(collector, heap, table),
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

  fn append_spaces(collector: &mut String, repeat: usize) {
    for _ in 0..repeat {
      collector.push_str("  ");
    }
  }

  fn print_expression_list(
    collector: &mut String,
    heap: &Heap,
    table: &SymbolTable,
    expressions: &[Expression],
  ) {
    let mut iter = expressions.iter();
    if let Some(e) = iter.next() {
      e.pretty_print(collector, heap, table);
      for e in iter {
        collector.push_str(", ");
        e.pretty_print(collector, heap, table);
      }
    }
  }

  fn pretty_print_internal(
    &self,
    heap: &Heap,
    table: &SymbolTable,
    level: usize,
    break_collector: &Option<(PStr, Type)>,
    collector: &mut String,
  ) {
    match self {
      Statement::Binary { name, operator, e1, e2 } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(" = ");
        match *operator {
          Operator::DIV => {
            // Necessary to preserve semantics
            collector.push_str("Math.floor(");
            e1.pretty_print(collector, heap, table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, table);
            collector.push(')');
          }
          Operator::LT
          | Operator::LE
          | Operator::GT
          | Operator::GE
          | Operator::EQ
          | Operator::NE => {
            // Necessary to make TS happy
            collector.push_str("Number(");
            e1.pretty_print(collector, heap, table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, table);
            collector.push(')');
          }
          Operator::MUL
          | Operator::MOD
          | Operator::PLUS
          | Operator::MINUS
          | Operator::LAND
          | Operator::LOR
          | Operator::SHL
          | Operator::SHR
          | Operator::XOR => {
            e1.pretty_print(collector, heap, table);
            collector.push(' ');
            collector.push_str(operator.as_str());
            collector.push(' ');
            e2.pretty_print(collector, heap, table);
          }
        };
        collector.push_str(";\n");
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, table);
        collector.push_str(" = ");
        pointer_expression.pretty_print(collector, heap, table);
        collector.push('[');
        collector.push_str(&index.to_string());
        collector.push_str("];\n");
      }
      Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        Self::append_spaces(collector, level);
        pointer_expression.pretty_print(collector, heap, table);
        collector.push('[');
        collector.push_str(&index.to_string());
        collector.push_str("] = ");
        assigned_expression.pretty_print(collector, heap, table);
        collector.push_str(";\n");
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        Self::append_spaces(collector, level);
        if let Some(c) = return_collector {
          collector.push_str("let ");
          collector.push_str(c.as_str(heap));
          collector.push_str(": ");
          return_type.pretty_print(collector, heap, table);
          collector.push_str(" = ");
        }
        callee.pretty_print(collector, heap, table);
        collector.push('(');
        Self::print_expression_list(collector, heap, table, arguments);
        collector.push_str(");\n");
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          Self::append_spaces(collector, level);
          collector.push_str("let ");
          collector.push_str(n.as_str(heap));
          collector.push_str(": ");
          t.pretty_print(collector, heap, table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("if (");
        condition.pretty_print(collector, heap, table);
        collector.push_str(") {\n");
        for s in s1 {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          Self::append_spaces(collector, level + 1);
          collector.push_str(n.as_str(heap));
          collector.push_str(" = ");
          v1.pretty_print(collector, heap, table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("} else {\n");
        for s in s2 {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          Self::append_spaces(collector, level + 1);
          collector.push_str(n.as_str(heap));
          collector.push_str(" = ");
          v2.pretty_print(collector, heap, table);
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
        condition.pretty_print(collector, heap, table);
        collector.push_str(") {\n");
        for s in statements {
          s.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        Self::append_spaces(collector, level);
        collector.push_str("}\n");
      }
      Statement::Break(break_value) => {
        if let Some((break_collector_str, _)) = break_collector {
          Self::append_spaces(collector, level);
          collector.push_str(break_collector_str.as_str(heap));
          collector.push_str(" = ");
          break_value.pretty_print(collector, heap, table);
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
          v.type_.pretty_print(collector, heap, table);
          collector.push_str(" = ");
          v.initial_value.pretty_print(collector, heap, table);
          collector.push_str(";\n");
        }
        if let Some((n, t)) = break_collector {
          Self::append_spaces(collector, level);
          collector.push_str("let ");
          collector.push_str(n.as_str(heap));
          collector.push_str(": ");
          t.pretty_print(collector, heap, table);
          collector.push_str(";\n");
        }
        Self::append_spaces(collector, level);
        collector.push_str("while (true) {\n");
        for nested in statements {
          nested.pretty_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for v in loop_variables {
          Self::append_spaces(collector, level + 1);
          collector.push_str(v.name.as_str(heap));
          collector.push_str(" = ");
          v.loop_value.pretty_print(collector, heap, table);
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
        assigned_expression.pretty_print(collector, heap, table);
        collector.push_str(" as unknown as ");
        type_.pretty_print(collector, heap, table);
        collector.push_str(";\n");
      }
      Statement::LateInitDeclaration { name, type_ } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, table);
        collector.push_str("undefined as any;\n");
      }
      Statement::LateInitAssignment { name, assigned_expression } => {
        Self::append_spaces(collector, level);
        collector.push_str(name.as_str(heap));
        collector.push_str(" = ");
        assigned_expression.pretty_print(collector, heap, table);
        collector.push_str(";\n");
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        Self::append_spaces(collector, level);
        collector.push_str("let ");
        collector.push_str(struct_variable_name.as_str(heap));
        collector.push_str(": ");
        type_.pretty_print(collector, heap, table);
        collector.push_str(" = [");
        Self::print_expression_list(collector, heap, table, expression_list);
        collector.push_str("];\n");
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
  fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    collector.push_str("function ");
    self.name.write_encoded(collector, heap, table);
    collector.push('(');
    let mut iter = self.parameters.iter().zip(&self.type_.argument_types);
    if let Some((n, t)) = iter.next() {
      collector.push_str(n.as_str(heap));
      collector.push_str(": ");
      t.pretty_print(collector, heap, table);
      for (n, t) in iter {
        collector.push_str(", ");
        collector.push_str(n.as_str(heap));
        collector.push_str(": ");
        t.pretty_print(collector, heap, table);
      }
    }
    collector.push_str("): ");
    self.type_.return_type.pretty_print(collector, heap, table);
    collector.push_str(" {\n");
    for s in &self.body {
      s.pretty_print_internal(heap, table, 1, &None, collector);
    }
    collector.push_str("  return ");
    self.return_value.pretty_print(collector, heap, table);
    collector.push_str(";\n}\n");
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

pub(crate) fn ts_prolog() -> String {
  let heap = &Heap::new();
  let table = &SymbolTable::new();
  let mut collector = String::new();

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
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = ts_prolog();

    for v in &self.global_variables {
      collector.push_str("const ");
      collector.push_str(v.name.as_str(heap));
      collector.push_str(": _Str = [0, `");
      collector.push_str(v.content.as_str(heap));
      collector.push_str("` as unknown as number];\n");
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
      f.pretty_print(&mut collector, heap, &self.symbol_table);
    }
    collector
  }
}
