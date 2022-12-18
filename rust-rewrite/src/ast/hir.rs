use crate::common::{rcs, Str};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum PrimitiveType {
  Bool,
  Int,
  String,
}

impl ToString for PrimitiveType {
  fn to_string(&self) -> String {
    match self {
      PrimitiveType::Bool => "bool".to_string(),
      PrimitiveType::Int => "int".to_string(),
      PrimitiveType::String => "string".to_string(),
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct IdType {
  pub(crate) name: Str,
  pub(crate) type_arguments: Vec<Type>,
}

impl IdType {
  pub(crate) fn pretty_print(&self) -> String {
    if self.type_arguments.is_empty() {
      self.name.to_string()
    } else {
      format!(
        "{}<{}>",
        self.name,
        self.type_arguments.iter().map(|it| it.pretty_print()).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  pub(crate) fn pretty_print(&self) -> String {
    format!(
      "({}) -> {}",
      self.argument_types.iter().map(|it| it.pretty_print()).join(", "),
      self.return_type.pretty_print()
    )
  }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, EnumAsInner)]
pub(crate) enum Type {
  Primitive(PrimitiveType),
  Id(IdType),
  Fn(FunctionType),
}

impl Type {
  pub(crate) fn new_id_unwrapped(name: &'static str, type_arguments: Vec<Type>) -> IdType {
    IdType { name: rcs(name), type_arguments }
  }

  pub(crate) fn new_id_no_targs_unwrapped(name: &'static str) -> IdType {
    Self::new_id_unwrapped(name, vec![])
  }

  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub(crate) fn new_id(name: &'static str, type_arguments: Vec<Type>) -> Type {
    Type::Id(Self::new_id_unwrapped(name, type_arguments))
  }

  pub(crate) fn new_id_str(name: Str, type_arguments: Vec<Type>) -> Type {
    Type::Id(IdType { name, type_arguments })
  }

  pub(crate) fn new_id_no_targs(name: &'static str) -> Type {
    Type::Id(IdType { name: rcs(name), type_arguments: vec![] })
  }

  pub(crate) fn new_id_str_no_targs(name: Str) -> Type {
    Type::Id(IdType { name, type_arguments: vec![] })
  }

  pub(crate) fn new_fn(argument_types: Vec<Type>, return_type: Type) -> Type {
    Type::Fn(Self::new_fn_unwrapped(argument_types, return_type))
  }

  pub(crate) fn pretty_print(&self) -> String {
    match self {
      Type::Primitive(t) => t.to_string(),
      Type::Id(id) => id.pretty_print(),
      Type::Fn(function) => function.pretty_print(),
    }
  }
}

pub(crate) const BOOL_TYPE: Type = Type::Primitive(PrimitiveType::Bool);
pub(crate) const INT_TYPE: Type = Type::Primitive(PrimitiveType::Int);
pub(crate) const STRING_TYPE: Type = Type::Primitive(PrimitiveType::String);

#[derive(Debug, Clone)]
pub(crate) struct ClosureTypeDefinition {
  pub(crate) identifier: Str,
  pub(crate) type_parameters: Vec<Str>,
  pub(crate) function_type: FunctionType,
}

fn name_with_tparams(identifier: &Str, tparams: &Vec<Str>) -> String {
  if tparams.is_empty() {
    identifier.to_string()
  } else {
    format!("{}<{}>", identifier, tparams.iter().map(|it| it.to_string()).join(", "))
  }
}

impl ClosureTypeDefinition {
  pub(crate) fn pretty_print(&self) -> String {
    format!(
      "closure type {} = {}",
      name_with_tparams(&self.identifier, &self.type_parameters),
      self.function_type.pretty_print()
    )
  }
}

#[derive(Debug, Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) identifier: Str,
  pub(crate) is_object: bool,
  pub(crate) type_parameters: Vec<Str>,
  pub(crate) names: Vec<Str>,
  pub(crate) mappings: Vec<Type>,
}

impl TypeDefinition {
  pub(crate) fn pretty_print(&self) -> String {
    let type_ = if self.is_object { "object" } else { "variant" };
    let id_part = name_with_tparams(&self.identifier, &self.type_parameters);
    format!(
      "{} type {} = [{}]",
      type_,
      id_part,
      self.mappings.iter().map(|it| it.pretty_print()).join(", ")
    )
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum Operator {
  MUL,
  DIV,
  MOD,
  PLUS,
  MINUS,
  XOR,
  LT,
  LE,
  GT,
  GE,
  EQ,
  NE,
}

impl Operator {
  pub(super) fn result_is_int(&self) -> bool {
    match self {
      Operator::MUL | Operator::DIV | Operator::MOD | Operator::PLUS | Operator::MINUS => true,
      Operator::XOR
      | Operator::LT
      | Operator::LE
      | Operator::GT
      | Operator::GE
      | Operator::EQ
      | Operator::NE => false,
    }
  }
}

impl ToString for Operator {
  fn to_string(&self) -> String {
    match self {
      Operator::MUL => "*".to_string(),
      Operator::DIV => "/".to_string(),
      Operator::MOD => "%".to_string(),
      Operator::PLUS => "+".to_string(),
      Operator::MINUS => "-".to_string(),
      Operator::XOR => "^".to_string(),
      Operator::LT => "<".to_string(),
      Operator::LE => "<=".to_string(),
      Operator::GT => ">".to_string(),
      Operator::GE => ">=".to_string(),
      Operator::EQ => "==".to_string(),
      Operator::NE => "!=".to_string(),
    }
  }
}

#[derive(Debug, Clone, Hash)]
pub(crate) struct VariableName {
  pub(crate) name: Str,
  pub(crate) type_: Type,
}

impl VariableName {
  pub(crate) fn new(name: &'static str, type_: Type) -> VariableName {
    VariableName { name: rcs(name), type_ }
  }

  pub(crate) fn debug_print(&self) -> String {
    format!("({}: {})", self.name, self.type_.pretty_print())
  }
}

#[derive(Debug, Clone, Hash)]
pub(crate) struct FunctionName {
  pub(crate) name: Str,
  pub(crate) type_: FunctionType,
  pub(crate) type_arguments: Vec<Type>,
}

impl FunctionName {
  pub(crate) fn new(name: &'static str, type_: FunctionType) -> FunctionName {
    FunctionName { name: rcs(name), type_, type_arguments: vec![] }
  }

  pub(crate) fn debug_print(&self) -> String {
    if self.type_arguments.is_empty() {
      self.name.to_string()
    } else {
      format!(
        "{}<{}>",
        self.name,
        self.type_arguments.iter().map(|it| it.pretty_print()).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, Hash, EnumAsInner)]
pub(crate) enum Expression {
  IntLiteral(i32, /* is_int */ bool),
  StringName(Str),
  FunctionName(FunctionName),
  Variable(VariableName),
}

impl Ord for Expression {
  fn cmp(&self, other: &Self) -> Ordering {
    match self {
      Expression::IntLiteral(i1, _) => match other {
        Expression::IntLiteral(i2, _) => i1.cmp(i2),
        _ => Ordering::Less,
      },
      Expression::StringName(n1) | Expression::FunctionName(FunctionName { name: n1, .. }) => {
        match other {
          Expression::IntLiteral(_, _) => Ordering::Greater,
          Expression::StringName(n2) | Expression::FunctionName(FunctionName { name: n2, .. }) => {
            n1.cmp(n2)
          }
          Expression::Variable(_) => Ordering::Less,
        }
      }
      Expression::Variable(v1) => match other {
        Expression::Variable(v2) => v1.name.cmp(&v2.name),
        _ => Ordering::Greater,
      },
    }
  }
}

impl Eq for Expression {}

impl PartialOrd for Expression {
  fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
    Some(self.cmp(other))
  }
}

impl PartialEq for Expression {
  fn eq(&self, other: &Self) -> bool {
    self.cmp(other).is_eq()
  }
}

impl Expression {
  pub(crate) fn int(value: i32) -> Expression {
    Expression::IntLiteral(value, true)
  }

  pub(crate) fn var_name(name: &'static str, type_: Type) -> Expression {
    Expression::Variable(VariableName::new(name, type_))
  }

  pub(crate) fn var_name_str(name: Str, type_: Type) -> Expression {
    Expression::Variable(VariableName { name, type_ })
  }

  pub(crate) fn fn_name(name: &'static str, type_: FunctionType) -> Expression {
    Expression::FunctionName(FunctionName::new(name, type_))
  }

  pub(crate) fn type_(&self) -> Type {
    match self {
      Expression::IntLiteral(_, false) => BOOL_TYPE,
      Expression::IntLiteral(_, true) => INT_TYPE,
      Expression::StringName(_) => STRING_TYPE,
      Expression::FunctionName(f) => Type::Fn(f.type_.clone()),
      Expression::Variable(v) => v.type_.clone(),
    }
  }

  pub(crate) fn debug_print(&self) -> String {
    match self {
      Expression::IntLiteral(i, _) => i.to_string(),
      Expression::StringName(n) => n.to_string(),
      Expression::FunctionName(f) => f.debug_print(),
      Expression::Variable(v) => v.debug_print(),
    }
  }

  pub(crate) fn as_callee(self) -> Option<Callee> {
    match self {
      Expression::IntLiteral(_, _) | Expression::StringName(_) => None,
      Expression::FunctionName(n) => Some(Callee::FunctionName(n)),
      Expression::Variable(v) => Some(Callee::Variable(v)),
    }
  }
}

pub(crate) const FALSE: Expression = Expression::IntLiteral(0, false);
pub(crate) const TRUE: Expression = Expression::IntLiteral(1, false);
pub(crate) const ZERO: Expression = Expression::IntLiteral(0, true);
pub(crate) const ONE: Expression = Expression::IntLiteral(1, true);

#[derive(Debug, Clone)]
pub(crate) struct Binary {
  pub(crate) name: Str,
  pub(crate) type_: Type,
  pub(crate) operator: Operator,
  pub(crate) e1: Expression,
  pub(crate) e2: Expression,
}

#[derive(Debug, Clone)]
pub(crate) enum Callee {
  FunctionName(FunctionName),
  Variable(VariableName),
}

impl Callee {
  pub(crate) fn debug_print(&self) -> String {
    match self {
      Callee::FunctionName(f) => f.debug_print(),
      Callee::Variable(v) => v.debug_print(),
    }
  }
}

#[derive(Debug, Clone)]
pub(crate) struct GenenalLoopVariable {
  pub(crate) name: Str,
  pub(crate) type_: Type,
  pub(crate) initial_value: Expression,
  pub(crate) loop_value: Expression,
}

impl ToString for GenenalLoopVariable {
  fn to_string(&self) -> String {
    format!(
      "{{name: {}, initial_value: {}, loop_value: {}}}",
      self.name,
      self.initial_value.debug_print(),
      self.loop_value.debug_print()
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Statement {
  Binary(Binary),
  IndexedAccess {
    name: Str,
    type_: Type,
    pointer_expression: Expression,
    index: usize,
  },
  Call {
    callee: Callee,
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
    loop_variables: Vec<GenenalLoopVariable>,
    statements: Vec<Statement>,
    break_collector: Option<VariableName>,
  },
  StructInit {
    struct_variable_name: Str,
    type_: IdType,
    expression_list: Vec<Expression>,
  },
  ClosureInit {
    closure_variable_name: Str,
    closure_type: IdType,
    function_name: FunctionName,
    context: Expression,
  },
}

impl Statement {
  pub(crate) fn binary_unwrapped(
    name: Str,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Binary {
    let type_ = if operator.result_is_int() { INT_TYPE } else { BOOL_TYPE };
    match (operator, &e2) {
      (Operator::MINUS, Expression::IntLiteral(n, _)) if *n != -2147483648 => {
        Binary { name, type_, operator: Operator::PLUS, e1, e2: Expression::int(-n) }
      }
      _ => Binary { name, type_, operator, e1, e2 },
    }
  }

  pub(crate) fn binary(
    name: &'static str,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Statement {
    Statement::Binary(Self::binary_unwrapped(rcs(name), operator, e1, e2))
  }

  pub(crate) fn flexible_order_binary(
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> (Operator, Expression, Expression) {
    let Binary { name: _, type_: _, operator: op, e1: normalized_e1, e2: normalized_e2 } =
      Self::binary_unwrapped(rcs(""), operator, e1, e2);
    match op {
      Operator::DIV | Operator::MOD | Operator::MINUS => (op, normalized_e1, normalized_e2),
      Operator::MUL | Operator::PLUS | Operator::XOR | Operator::EQ | Operator::NE => {
        if normalized_e1 > normalized_e2 {
          (op, normalized_e1, normalized_e2)
        } else {
          (op, normalized_e2, normalized_e1)
        }
      }
      Operator::LT => {
        if normalized_e1 < normalized_e2 {
          (Operator::GT, normalized_e2, normalized_e1)
        } else {
          (op, normalized_e1, normalized_e2)
        }
      }
      Operator::LE => {
        if normalized_e1 < normalized_e2 {
          (Operator::GE, normalized_e2, normalized_e1)
        } else {
          (op, normalized_e1, normalized_e2)
        }
      }
      Operator::GT => {
        if normalized_e1 < normalized_e2 {
          (Operator::LT, normalized_e2, normalized_e1)
        } else {
          (op, normalized_e1, normalized_e2)
        }
      }
      Operator::GE => {
        if normalized_e1 < normalized_e2 {
          (Operator::LE, normalized_e2, normalized_e1)
        } else {
          (op, normalized_e1, normalized_e2)
        }
      }
    }
  }

  fn debug_print_internal(
    &self,
    level: usize,
    break_collector: &Option<VariableName>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary(s) => {
        let type_ = s.type_.pretty_print();
        let e1 = s.e1.debug_print();
        let e2 = s.e2.debug_print();
        collector.push(format!(
          "{}let {}: {} = {} {} {};\n",
          "  ".repeat(level),
          s.name,
          type_,
          e1,
          s.operator.to_string(),
          e2
        ));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let type_ = type_.pretty_print();
        let pointer_expr = pointer_expression.debug_print();
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name,
          type_,
          pointer_expr,
          index
        ));
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        let fun_str = callee.debug_print();
        let args_str = arguments.iter().map(|it| it.debug_print()).join(", ");
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector, return_type.pretty_print())
        } else {
          "".to_string()
        };
        collector.push(format!(
          "{}{}{}({});\n",
          "  ".repeat(level),
          collector_str,
          fun_str,
          args_str
        ));
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, t, _, _) in final_assignments {
          collector.push(format!("{}let {}: {};\n", "  ".repeat(level), n, t.pretty_print()));
        }
        collector.push(format!("{}if {} {{\n", "  ".repeat(level), condition.debug_print()));
        for s in s1 {
          s.debug_print_internal(level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!("{}{} = {};\n", "  ".repeat(level + 1), n, v1.debug_print()));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.debug_print_internal(level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!("{}{} = {};\n", "  ".repeat(level + 1), n, v2.debug_print()));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::SingleIf { condition, invert_condition, statements } => {
        let invert_str = if *invert_condition { "!" } else { "" };
        collector.push(format!(
          "{}if {}{} {{\n",
          "  ".repeat(level),
          invert_str,
          condition.debug_print()
        ));
        for s in statements {
          s.debug_print_internal(level + 1, break_collector, collector);
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Break(break_value) => {
        let break_collector_str =
          if let Some(s) = break_collector { s.name.to_string() } else { "undefined".to_string() };
        collector.push(format!(
          "{}{} = {};\n",
          "  ".repeat(level),
          break_collector_str,
          break_value.debug_print()
        ));
        collector.push(format!("{}break;\n", "  ".repeat(level)));
      }
      Statement::While { loop_variables, break_collector, statements } => {
        for v in loop_variables {
          collector.push(format!(
            "{}let {}: {} = {};\n",
            "  ".repeat(level),
            v.name,
            v.type_.pretty_print(),
            v.initial_value.debug_print()
          ));
        }
        if let Some(c) = break_collector {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            c.name,
            c.type_.pretty_print()
          ));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.debug_print_internal(level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name,
            v.loop_value.debug_print()
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let expression_str = expression_list.iter().map(|it| it.debug_print()).join(", ");
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name,
          type_.pretty_print(),
          expression_str
        ));
      }
      Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
        let closure_name_type =
          format!("{}: {}", closure_variable_name, closure_type.pretty_print());
        let function_name_type =
          format!("{}: {}", function_name.name, function_name.type_.pretty_print());
        collector.push(format!(
          "{}let {} = Closure {{ fun: ({}), context: {} }};\n",
          "  ".repeat(level),
          closure_name_type,
          function_name_type,
          context.debug_print()
        ));
      }
    }
  }

  fn debug_print_leveled(&self, level: usize) -> String {
    let mut collector = vec![];
    self.debug_print_internal(level, &None, &mut collector);
    collector.join("").trim_end().to_string()
  }

  pub(crate) fn debug_print(&self) -> String {
    self.debug_print_leveled(0)
  }
}

#[derive(Debug)]
pub(crate) struct Function {
  pub(crate) name: Str,
  pub(crate) parameters: Vec<Str>,
  pub(crate) type_parameters: Vec<Str>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  pub(crate) fn debug_print(&self) -> String {
    let typed_parameters = self
      .parameters
      .iter()
      .zip(&self.type_.argument_types)
      .map(|(n, t)| format!("{}: {}", n, t.pretty_print()))
      .join(", ");
    let type_param_str = if self.type_parameters.is_empty() {
      "".to_string()
    } else {
      format!("<{}>", self.type_parameters.iter().map(|it| it.to_string()).join(", "))
    };
    let header = format!(
      "function {}{}({}): {} {{",
      self.name,
      type_param_str,
      typed_parameters,
      self.type_.return_type.pretty_print()
    );
    let mut lines = vec![];
    lines.push(header);
    for s in &self.body {
      lines.push(s.debug_print_leveled(1));
    }
    lines.push(format!("  return {};", self.return_value.debug_print()));
    lines.push("}".to_string());
    lines.join("\n") + "\n"
  }
}

#[derive(Debug, Clone)]
pub(crate) struct GlobalVariable {
  pub(crate) name: Str,
  pub(crate) content: Str,
}

#[derive(Debug)]
pub(crate) struct Sources {
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) closure_types: Vec<ClosureTypeDefinition>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<Str>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  pub(crate) fn debug_print(&self) -> String {
    let mut lines = vec![];
    for v in &self.global_variables {
      lines.push(format!("const {} = '{}';\n", v.name, v.content));
    }
    for d in &self.closure_types {
      lines.push(d.pretty_print());
    }
    for d in &self.type_definitions {
      lines.push(d.pretty_print());
    }
    for f in &self.functions {
      lines.push(f.debug_print());
    }
    if !self.main_function_names.is_empty() {
      lines.push(format!(
        "sources.mains = [{}]",
        self.main_function_names.iter().map(|it| it.to_string()).join(", ")
      ));
    }
    lines.join("\n")
  }
}
