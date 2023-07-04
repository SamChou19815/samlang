use crate::common::{well_known_pstrs, ModuleReference, PStr};
use enum_as_inner::EnumAsInner;
#[cfg(test)]
use itertools::Itertools;
use std::hash::Hash;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct TypeName {
  /// When it is None, it is a generic type
  pub(crate) module_reference: Option<ModuleReference>,
  pub(crate) type_name: PStr,
}

impl TypeName {
  #[cfg(test)]
  pub(crate) fn new_for_test(name: PStr) -> TypeName {
    TypeName { module_reference: Some(ModuleReference::dummy()), type_name: name }
  }

  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    if let Some(mod_ref) = self.module_reference {
      format!("{}_{}", mod_ref.encoded(heap), self.type_name.as_str(heap))
    } else {
      self.type_name.as_str(heap).to_string()
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct IdType {
  pub(crate) name: TypeName,
  pub(crate) type_arguments: Vec<Type>,
}

impl IdType {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    if self.type_arguments.is_empty() {
      self.name.pretty_print(heap)
    } else {
      format!(
        "{}<{}>",
        self.name.pretty_print(heap),
        self.type_arguments.iter().map(|it| it.pretty_print(heap)).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    format!(
      "({}) -> {}",
      self.argument_types.iter().map(|it| it.pretty_print(heap)).join(", "),
      self.return_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, EnumAsInner)]
pub(crate) enum Type {
  Int,
  Id(IdType),
}

impl Type {
  pub(crate) const fn new_generic_type(name: PStr) -> Type {
    Type::Id(IdType {
      name: TypeName { module_reference: None, type_name: name },
      type_arguments: vec![],
    })
  }

  #[cfg(test)]
  pub(crate) const fn new_id_unwrapped(name: PStr, type_arguments: Vec<Type>) -> IdType {
    IdType {
      name: TypeName { module_reference: Some(ModuleReference::dummy()), type_name: name },
      type_arguments,
    }
  }

  #[cfg(test)]
  pub(crate) const fn new_id_no_targs_unwrapped(name: PStr) -> IdType {
    Self::new_id_unwrapped(name, vec![])
  }

  #[cfg(test)]
  pub(crate) fn new_id(name: PStr, type_arguments: Vec<Type>) -> Type {
    Type::Id(Self::new_id_unwrapped(name, type_arguments))
  }

  #[cfg(test)]
  pub(crate) const fn new_id_no_targs(name: PStr) -> Type {
    Type::Id(Self::new_id_no_targs_unwrapped(name))
  }

  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    match self {
      Type::Int => "int".to_string(),
      Type::Id(id) => id.pretty_print(heap),
    }
  }
}

pub(crate) const INT_TYPE: Type = Type::Int;
pub(crate) const STRING_TYPE: Type = Type::Id(IdType {
  name: TypeName {
    module_reference: Some(ModuleReference::root()),
    type_name: well_known_pstrs::STR_TYPE,
  },
  type_arguments: vec![],
});
pub(crate) const STRING_TYPE_REF: &Type = &Type::Id(IdType {
  name: TypeName {
    module_reference: Some(ModuleReference::root()),
    type_name: well_known_pstrs::STR_TYPE,
  },
  type_arguments: vec![],
});

#[derive(Debug, Clone)]
pub(crate) struct ClosureTypeDefinition {
  pub(crate) name: TypeName,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) function_type: FunctionType,
}

#[cfg(test)]
fn name_with_tparams(heap: &crate::common::Heap, name: TypeName, tparams: &Vec<PStr>) -> String {
  if tparams.is_empty() {
    name.pretty_print(heap)
  } else {
    format!("{}<{}>", name.pretty_print(heap), tparams.iter().map(|it| it.as_str(heap)).join(", "))
  }
}

impl ClosureTypeDefinition {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    format!(
      "closure type {} = {}",
      name_with_tparams(heap, self.name, &self.type_parameters),
      self.function_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum TypeDefinitionMappings {
  Struct(Vec<Type>),
  Enum(Vec<(PStr, Vec<Type>)>),
}

#[derive(Debug, Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) name: TypeName,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) mappings: TypeDefinitionMappings,
}

impl TypeDefinition {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    let id_part = name_with_tparams(heap, self.name, &self.type_parameters);
    match &self.mappings {
      TypeDefinitionMappings::Struct(types) => {
        format!(
          "object type {} = [{}]",
          id_part,
          types.iter().map(|it| it.pretty_print(heap)).join(", ")
        )
      }
      TypeDefinitionMappings::Enum(variants) => format!(
        "variant type {} = [{}]",
        id_part,
        variants
          .iter()
          .map(|(n, types)| format!(
            "({}: [{}])",
            n.as_str(heap),
            types.iter().map(|it| it.pretty_print(heap)).join(", ")
          ))
          .join(", ")
      ),
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

impl Operator {
  pub(crate) fn as_str(&self) -> &'static str {
    match self {
      Operator::MUL => "*",
      Operator::DIV => "/",
      Operator::MOD => "%",
      Operator::PLUS => "+",
      Operator::MINUS => "-",
      Operator::LAND => "&",
      Operator::LOR => "|",
      Operator::SHL => "<<",
      Operator::SHR => ">>>",
      Operator::XOR => "^",
      Operator::LT => "<",
      Operator::LE => "<=",
      Operator::GT => ">",
      Operator::GE => ">=",
      Operator::EQ => "==",
      Operator::NE => "!=",
    }
  }
}

#[derive(Debug, Clone)]
pub(crate) struct VariableName {
  pub(crate) name: PStr,
  pub(crate) type_: Type,
}

impl PartialEq for VariableName {
  fn eq(&self, other: &Self) -> bool {
    self.name == other.name
  }
}

impl Eq for VariableName {}

impl VariableName {
  pub(crate) fn new(name: PStr, type_: Type) -> VariableName {
    VariableName { name, type_ }
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
    format!("({}: {})", self.name.as_str(heap), self.type_.pretty_print(heap))
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct FunctionName {
  pub(crate) type_name: TypeName,
  pub(crate) fn_name: PStr,
}

impl FunctionName {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &crate::common::Heap) -> String {
    format!("{}${}", self.type_name.pretty_print(heap), self.fn_name.as_str(heap))
  }
}

#[derive(Debug, Clone)]
pub(crate) struct FunctionNameExpression {
  pub(crate) name: FunctionName,
  pub(crate) type_: FunctionType,
  pub(crate) type_arguments: Vec<Type>,
}

impl FunctionNameExpression {
  #[cfg(test)]
  pub(super) fn new(name: FunctionName, type_: FunctionType) -> FunctionNameExpression {
    FunctionNameExpression { name, type_, type_arguments: vec![] }
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
    if self.type_arguments.is_empty() {
      self.name.pretty_print(heap)
    } else {
      format!(
        "{}<{}>",
        self.name.pretty_print(heap),
        self.type_arguments.iter().map(|it| it.pretty_print(heap)).join(", ")
      )
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, EnumAsInner)]
pub(crate) enum Expression {
  IntLiteral(i32),
  StringName(PStr),
  Variable(VariableName),
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

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
    match self {
      Expression::IntLiteral(i) => i.to_string(),
      Expression::StringName(n) => n.as_str(heap).to_string(),
      Expression::Variable(v) => v.debug_print(heap),
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

#[derive(Debug, Clone, EnumAsInner)]
pub(crate) enum Callee {
  FunctionName(FunctionNameExpression),
  Variable(VariableName),
}

impl Callee {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
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

#[derive(Debug, Clone)]
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
  Call {
    callee: Callee,
    arguments: Vec<Expression>,
    return_type: Type,
    return_collector: Option<PStr>,
  },
  ConditionalDestructure {
    test_expr: Expression,
    tag: usize,
    bindings: Vec<Option<(PStr, Type)>>,
    s1: Vec<Statement>,
    s2: Vec<Statement>,
    final_assignments: Vec<(PStr, Type, Expression, Expression)>,
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
  EnumInit {
    enum_variable_name: PStr,
    enum_type: IdType,
    tag: usize,
    associated_data_list: Vec<Expression>,
  },
  ClosureInit {
    closure_variable_name: PStr,
    closure_type: IdType,
    function_name: FunctionNameExpression,
    context: Expression,
  },
}

impl Statement {
  #[cfg(test)]
  fn debug_print_internal(
    &self,
    heap: &crate::common::Heap,
    level: usize,
    break_collector: &Option<VariableName>,
    collector: &mut Vec<String>,
  ) {
    match self {
      Statement::Binary { name, operator, e1, e2 } => {
        collector.push(format!(
          "{}let {} = {} {} {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          e1.debug_print(heap),
          operator.as_str(),
          e2.debug_print(heap)
        ));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_.pretty_print(heap),
          pointer_expression.debug_print(heap),
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
      Statement::ConditionalDestructure { test_expr, tag, bindings, s1, s2, final_assignments } => {
        let bindings_string = bindings
          .iter()
          .map(|b| {
            if let Some((n, t)) = b {
              format!("{}: {}", n.as_str(heap), t.pretty_print(heap))
            } else {
              "_".to_string()
            }
          })
          .join(", ");
        collector.push(format!(
          "{}let [{}] if tagof({})=={} {{\n",
          "  ".repeat(level),
          bindings_string,
          test_expr.debug_print(heap),
          tag,
        ));
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
      Statement::EnumInit { enum_variable_name, enum_type, tag, associated_data_list } => {
        let expression_str = associated_data_list.iter().map(|it| it.debug_print(heap)).join(", ");
        collector.push(format!(
          "{}let {}: {} = [{}, {}];\n",
          "  ".repeat(level),
          enum_variable_name.as_str(heap),
          enum_type.pretty_print(heap),
          tag,
          expression_str
        ));
      }
      Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
        let closure_name_type =
          format!("{}: {}", closure_variable_name.as_str(heap), closure_type.pretty_print(heap));
        let function_name_type = format!(
          "{}: {}",
          function_name.name.pretty_print(heap),
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

  #[cfg(test)]
  fn debug_print_leveled(&self, heap: &crate::common::Heap, level: usize) -> String {
    let mut collector = vec![];
    self.debug_print_internal(heap, level, &None, &mut collector);
    collector.join("").trim_end().to_string()
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
    self.debug_print_leveled(heap, 0)
  }
}

#[derive(Debug, Clone)]
pub(crate) struct Function {
  pub(crate) name: FunctionName,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) type_parameters: Vec<PStr>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
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
      self.name.pretty_print(heap),
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
  pub(crate) main_function_names: Vec<FunctionName>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &crate::common::Heap) -> String {
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
        self.main_function_names.iter().map(|it| it.pretty_print(heap)).join(", ")
      ));
    }
    lines.join("\n")
  }
}
