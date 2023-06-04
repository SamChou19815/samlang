use crate::{
  common::{well_known_pstrs, PStr, INVALID_PSTR},
  Heap,
};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use std::{cmp::Ordering, hash::Hash};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PrimitiveType {
  Int,
}

impl ToString for PrimitiveType {
  fn to_string(&self) -> String {
    match self {
      PrimitiveType::Int => "int".to_string(),
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IdType {
  pub(crate) name: PStr,
  pub(crate) type_arguments: Vec<Type>,
}

impl IdType {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    if self.type_arguments.is_empty() {
      self.name.as_str(heap).to_string()
    } else {
      format!(
        "{}<{}>",
        self.name.as_str(heap),
        self.type_arguments.iter().map(|it| it.pretty_print(heap)).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    format!(
      "({}) -> {}",
      self.argument_types.iter().map(|it| it.pretty_print(heap)).join(", "),
      self.return_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, PartialEq, Eq, EnumAsInner)]
pub(crate) enum Type {
  Primitive(PrimitiveType),
  Id(IdType),
}

impl Type {
  pub(crate) fn new_id_unwrapped(name: PStr, type_arguments: Vec<Type>) -> IdType {
    IdType { name, type_arguments }
  }

  pub(crate) fn new_id_no_targs_unwrapped(name: PStr) -> IdType {
    Self::new_id_unwrapped(name, vec![])
  }

  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub(crate) fn new_id(name: PStr, type_arguments: Vec<Type>) -> Type {
    Type::Id(IdType { name, type_arguments })
  }

  pub(crate) const fn new_id_no_targs(name: PStr) -> Type {
    Type::Id(IdType { name, type_arguments: vec![] })
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Type::Primitive(t) => t.to_string(),
      Type::Id(id) => id.pretty_print(heap),
    }
  }
}

pub(crate) const INT_TYPE: Type = Type::Primitive(PrimitiveType::Int);
pub(crate) const STRING_TYPE: Type = Type::new_id_no_targs(well_known_pstrs::UNDERSCORE_STR);
pub(crate) const STRING_TYPE_REF: &Type = &Type::new_id_no_targs(well_known_pstrs::UNDERSCORE_STR);

#[derive(Debug, Clone)]
pub(crate) struct ClosureTypeDefinition {
  pub(crate) identifier: PStr,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) function_type: FunctionType,
}

fn name_with_tparams(heap: &Heap, identifier: PStr, tparams: &Vec<PStr>) -> String {
  if tparams.is_empty() {
    identifier.as_str(heap).to_string()
  } else {
    format!("{}<{}>", identifier.as_str(heap), tparams.iter().map(|it| it.as_str(heap)).join(", "))
  }
}

impl ClosureTypeDefinition {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    format!(
      "closure type {} = {}",
      name_with_tparams(heap, self.identifier, &self.type_parameters),
      self.function_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum TypeDefinitionMappings {
  Struct(Vec<Type>),
  Enum,
}

#[derive(Debug, Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) identifier: PStr,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) names: Vec<PStr>,
  pub(crate) mappings: TypeDefinitionMappings,
}

impl TypeDefinition {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let id_part = name_with_tparams(heap, self.identifier, &self.type_parameters);
    match &self.mappings {
      TypeDefinitionMappings::Struct(types) => {
        format!(
          "object type {} = [{}]",
          id_part,
          types.iter().map(|it| it.pretty_print(heap)).join(", ")
        )
      }
      TypeDefinitionMappings::Enum => format!("variant type {}", id_part),
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum Operator {
  MUL,
  DIV,
  MOD,
  PLUS,
  MINUS,
  LAND,
  LOR,
  SHL,
  SHR,
  XOR,
  LT,
  LE,
  GT,
  GE,
  EQ,
  NE,
}

impl ToString for Operator {
  fn to_string(&self) -> String {
    match self {
      Operator::MUL => "*".to_string(),
      Operator::DIV => "/".to_string(),
      Operator::MOD => "%".to_string(),
      Operator::PLUS => "+".to_string(),
      Operator::MINUS => "-".to_string(),
      Operator::LAND => "&".to_string(),
      Operator::LOR => "|".to_string(),
      Operator::SHL => "<<".to_string(),
      Operator::SHR => ">>>".to_string(),
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

#[derive(Debug, Clone)]
pub(crate) struct VariableName {
  pub(crate) name: PStr,
  pub(crate) type_: Type,
}

impl VariableName {
  pub(crate) fn new(name: PStr, type_: Type) -> VariableName {
    VariableName { name, type_ }
  }

  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    format!("({}: {})", self.name.as_str(heap), self.type_.pretty_print(heap))
  }
}

#[derive(Debug, Clone)]
pub(crate) struct FunctionName {
  pub(crate) name: PStr,
  pub(crate) type_: FunctionType,
  pub(crate) type_arguments: Vec<Type>,
}

impl FunctionName {
  pub(crate) fn new(name: PStr, type_: FunctionType) -> FunctionName {
    FunctionName { name, type_, type_arguments: vec![] }
  }

  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    if self.type_arguments.is_empty() {
      self.name.as_str(heap).to_string()
    } else {
      format!(
        "{}<{}>",
        self.name.as_str(heap),
        self.type_arguments.iter().map(|it| it.pretty_print(heap)).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Expression {
  IntLiteral(i32),
  StringName(PStr),
  Variable(VariableName),
}

impl Ord for Expression {
  fn cmp(&self, other: &Self) -> Ordering {
    match self {
      Expression::IntLiteral(i1) => match other {
        Expression::IntLiteral(i2) => i1.cmp(i2),
        _ => Ordering::Less,
      },
      Expression::StringName(n1) => match other {
        Expression::IntLiteral(_) => Ordering::Greater,
        Expression::StringName(n2) => n1.cmp(n2),
        Expression::Variable(_) => Ordering::Less,
      },
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
    Expression::IntLiteral(value)
  }

  pub(crate) fn var_name(name: PStr, type_: Type) -> Expression {
    Expression::Variable(VariableName { name, type_ })
  }

  pub(crate) fn type_(&self) -> &Type {
    match self {
      Expression::IntLiteral(_) => &INT_TYPE,
      Expression::StringName(_) => STRING_TYPE_REF,
      Expression::Variable(v) => &v.type_,
    }
  }

  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    match self {
      Expression::IntLiteral(i) => i.to_string(),
      Expression::StringName(n) => n.as_str(heap).to_string(),
      Expression::Variable(v) => v.debug_print(heap),
    }
  }

  pub(crate) fn dump_to_string(&self) -> String {
    match self {
      Expression::IntLiteral(i) => i.to_string(),
      Expression::StringName(n) => n.debug_string(),
      Expression::Variable(v) => v.name.debug_string(),
    }
  }

  pub(crate) fn convert_to_callee(self) -> Option<Callee> {
    match self {
      Expression::IntLiteral(_) | Expression::StringName(_) => None,
      Expression::Variable(v) => Some(Callee::Variable(v)),
    }
  }
}

pub(crate) const ZERO: Expression = Expression::IntLiteral(0);
pub(crate) const ONE: Expression = Expression::IntLiteral(1);

#[derive(Debug, Clone)]
pub(crate) struct Binary {
  pub(crate) name: PStr,
  pub(crate) operator: Operator,
  pub(crate) e1: Expression,
  pub(crate) e2: Expression,
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Callee {
  FunctionName(FunctionName),
  Variable(VariableName),
}

impl Callee {
  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    match self {
      Callee::FunctionName(f) => f.debug_print(heap),
      Callee::Variable(v) => v.debug_print(heap),
    }
  }
}

#[derive(Debug, Clone)]
pub(crate) struct GenenalLoopVariable {
  pub(crate) name: PStr,
  pub(crate) type_: Type,
  pub(crate) initial_value: Expression,
  pub(crate) loop_value: Expression,
}

impl GenenalLoopVariable {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    format!(
      "{{name: {}, initial_value: {}, loop_value: {}}}",
      self.name.as_str(heap),
      self.initial_value.debug_print(heap),
      self.loop_value.debug_print(heap)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Statement {
  Binary(Binary),
  IndexedAccess {
    name: PStr,
    type_: Type,
    pointer_expression: Expression,
    index: usize,
  },
  Call {
    callee: Callee,
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
    break_collector: Option<VariableName>,
  },
  Cast {
    name: PStr,
    type_: Type,
    assigned_expression: Expression,
  },
  StructInit {
    struct_variable_name: PStr,
    type_: IdType,
    expression_list: Vec<Expression>,
  },
  ClosureInit {
    closure_variable_name: PStr,
    closure_type: IdType,
    function_name: FunctionName,
    context: Expression,
  },
}

impl Statement {
  pub(crate) fn binary_unwrapped(
    name: PStr,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Binary {
    match (operator, &e2) {
      (Operator::MINUS, Expression::IntLiteral(n)) if *n != -2147483648 => {
        Binary { name, operator: Operator::PLUS, e1, e2: Expression::int(-n) }
      }
      _ => Binary { name, operator, e1, e2 },
    }
  }

  pub(crate) fn binary_flexible_unwrapped(
    name: PStr,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Binary {
    let (operator, e1, e2) = Self::flexible_order_binary(operator, e1, e2);
    Self::binary_unwrapped(name, operator, e1, e2)
  }

  pub(crate) fn binary(
    name: PStr,
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> Statement {
    Statement::Binary(Self::binary_unwrapped(name, operator, e1, e2))
  }

  pub(crate) fn flexible_order_binary(
    operator: Operator,
    e1: Expression,
    e2: Expression,
  ) -> (Operator, Expression, Expression) {
    let Binary { name: _, operator: op, e1: normalized_e1, e2: normalized_e2 } =
      Self::binary_unwrapped(INVALID_PSTR, operator, e1, e2);
    match op {
      Operator::DIV | Operator::MOD | Operator::MINUS | Operator::SHL | Operator::SHR => {
        (op, normalized_e1, normalized_e2)
      }
      Operator::MUL
      | Operator::PLUS
      | Operator::LAND
      | Operator::LOR
      | Operator::XOR
      | Operator::EQ
      | Operator::NE => {
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
    heap: &Heap,
    level: usize,
    break_collector: &Option<VariableName>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary(s) => {
        let e1 = s.e1.debug_print(heap);
        let e2 = s.e2.debug_print(heap);
        collector.push(format!(
          "{}let {} = {} {} {};\n",
          "  ".repeat(level),
          s.name.as_str(heap),
          e1,
          s.operator.to_string(),
          e2
        ));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let type_ = type_.pretty_print(heap);
        let pointer_expr = pointer_expression.debug_print(heap);
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_,
          pointer_expr,
          index
        ));
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        let fun_str = callee.debug_print(heap);
        let args_str = arguments.iter().map(|it| it.debug_print(heap)).join(", ");
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector.as_str(heap), return_type.pretty_print(heap))
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
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            n.as_str(heap),
            t.pretty_print(heap)
          ));
        }
        collector.push(format!("{}if {} {{\n", "  ".repeat(level), condition.debug_print(heap)));
        for s in s1 {
          s.debug_print_internal(heap, level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v1.debug_print(heap)
          ));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.debug_print_internal(heap, level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v2.debug_print(heap)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::SingleIf { condition, invert_condition, statements } => {
        let invert_str = if *invert_condition { "!" } else { "" };
        collector.push(format!(
          "{}if {}{} {{\n",
          "  ".repeat(level),
          invert_str,
          condition.debug_print(heap)
        ));
        for s in statements {
          s.debug_print_internal(heap, level + 1, break_collector, collector);
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Break(break_value) => {
        let break_collector_str =
          if let Some(s) = break_collector { s.name.as_str(heap) } else { "undefined" };
        collector.push(format!(
          "{}{} = {};\n",
          "  ".repeat(level),
          break_collector_str,
          break_value.debug_print(heap)
        ));
        collector.push(format!("{}break;\n", "  ".repeat(level)));
      }
      Statement::While { loop_variables, break_collector, statements } => {
        for v in loop_variables {
          collector.push(format!(
            "{}let {}: {} = {};\n",
            "  ".repeat(level),
            v.name.as_str(heap),
            v.type_.pretty_print(heap),
            v.initial_value.debug_print(heap)
          ));
        }
        if let Some(c) = break_collector {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            c.name.as_str(heap),
            c.type_.pretty_print(heap)
          ));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.debug_print_internal(heap, level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name.as_str(heap),
            v.loop_value.debug_print(heap)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Cast { name, type_, assigned_expression } => {
        collector.push(format!(
          "{}let {} = {} as {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.debug_print(heap),
          type_.pretty_print(heap),
        ));
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let expression_str = expression_list.iter().map(|it| it.debug_print(heap)).join(", ");
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name.as_str(heap),
          type_.pretty_print(heap),
          expression_str
        ));
      }
      Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
        let closure_name_type =
          format!("{}: {}", closure_variable_name.as_str(heap), closure_type.pretty_print(heap));
        let function_name_type = format!(
          "{}: {}",
          function_name.name.as_str(heap),
          function_name.type_.pretty_print(heap)
        );
        collector.push(format!(
          "{}let {} = Closure {{ fun: ({}), context: {} }};\n",
          "  ".repeat(level),
          closure_name_type,
          function_name_type,
          context.debug_print(heap)
        ));
      }
    }
  }

  fn debug_print_leveled(&self, heap: &Heap, level: usize) -> String {
    let mut collector = vec![];
    self.debug_print_internal(heap, level, &None, &mut collector);
    collector.join("").trim_end().to_string()
  }

  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    self.debug_print_leveled(heap, 0)
  }
}

#[derive(Debug, Clone)]
pub(crate) struct Function {
  pub(crate) name: PStr,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    let typed_parameters = self
      .parameters
      .iter()
      .zip(&self.type_.argument_types)
      .map(|(n, t)| format!("{}: {}", n.as_str(heap), t.pretty_print(heap)))
      .join(", ");
    let type_param_str = if self.type_parameters.is_empty() {
      "".to_string()
    } else {
      format!("<{}>", self.type_parameters.iter().map(|it| it.as_str(heap)).join(", "))
    };
    let header = format!(
      "function {}{}({}): {} {{",
      self.name.as_str(heap),
      type_param_str,
      typed_parameters,
      self.type_.return_type.pretty_print(heap)
    );
    let mut lines = vec![];
    lines.push(header);
    for s in &self.body {
      lines.push(s.debug_print_leveled(heap, 1));
    }
    lines.push(format!("  return {};", self.return_value.debug_print(heap)));
    lines.push("}".to_string());
    lines.join("\n") + "\n"
  }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct GlobalVariable {
  pub(crate) name: PStr,
  pub(crate) content: PStr,
}

#[derive(Debug)]
pub(crate) struct Sources {
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) closure_types: Vec<ClosureTypeDefinition>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<PStr>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    for v in &self.global_variables {
      lines.push(format!("const {} = '{}';\n", v.name.as_str(heap), v.content.as_str(heap)));
    }
    for d in &self.closure_types {
      lines.push(d.pretty_print(heap));
    }
    for d in &self.type_definitions {
      lines.push(d.pretty_print(heap));
    }
    for f in &self.functions {
      lines.push(f.debug_print(heap));
    }
    if !self.main_function_names.is_empty() {
      lines.push(format!(
        "sources.mains = [{}]",
        self.main_function_names.iter().map(|it| it.as_str(heap)).join(", ")
      ));
    }
    lines.join("\n")
  }
}
