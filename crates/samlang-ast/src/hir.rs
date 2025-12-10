use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use samlang_heap::{ModuleReference, PStr};
use std::hash::Hash;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TypeName {
  /// When it is None, it is a generic type
  pub module_reference: Option<ModuleReference>,
  pub type_name: PStr,
}

impl TypeName {
  pub fn new_for_test(name: PStr) -> TypeName {
    TypeName { module_reference: Some(ModuleReference::DUMMY), type_name: name }
  }

  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
    if let Some(mod_ref) = self.module_reference {
      format!("{}_{}", mod_ref.encoded(heap), self.type_name.as_str(heap))
    } else {
      self.type_name.as_str(heap).to_string()
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct IdType {
  pub name: TypeName,
  pub type_arguments: Vec<Type>,
}

impl IdType {
  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
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
pub struct FunctionType {
  pub argument_types: Vec<Type>,
  pub return_type: Box<Type>,
}

impl FunctionType {
  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
    format!(
      "({}) -> {}",
      self.argument_types.iter().map(|it| it.pretty_print(heap)).join(", "),
      self.return_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, EnumAsInner)]
pub enum Type {
  Int32,
  Int31,
  Id(IdType),
}

impl Type {
  pub const fn new_generic_type(name: PStr) -> Self {
    Self::Id(IdType {
      name: TypeName { module_reference: None, type_name: name },
      type_arguments: Vec::new(),
    })
  }

  pub const fn new_id_unwrapped(name: PStr, type_arguments: Vec<Type>) -> IdType {
    IdType {
      name: TypeName { module_reference: Some(ModuleReference::DUMMY), type_name: name },
      type_arguments,
    }
  }

  pub const fn new_id_no_targs_unwrapped(name: PStr) -> IdType {
    Self::new_id_unwrapped(name, Vec::new())
  }

  pub fn new_id(name: PStr, type_arguments: Vec<Type>) -> Type {
    Type::Id(Self::new_id_unwrapped(name, type_arguments))
  }

  pub const fn new_id_no_targs(name: PStr) -> Type {
    Type::Id(Self::new_id_no_targs_unwrapped(name))
  }

  pub fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
    match self {
      Self::Int32 => "int".to_string(),
      Self::Int31 => "i31".to_string(),
      Self::Id(id) => id.pretty_print(heap),
    }
  }
}

pub const INT_TYPE: Type = Type::Int32;
pub const INT31_TYPE: Type = Type::Int31;
pub const STRING_TYPE: Type = Type::Id(IdType {
  name: TypeName { module_reference: Some(ModuleReference::ROOT), type_name: PStr::STR_TYPE },
  type_arguments: Vec::new(),
});
pub const STRING_TYPE_REF: &Type = &Type::Id(IdType {
  name: TypeName { module_reference: Some(ModuleReference::ROOT), type_name: PStr::STR_TYPE },
  type_arguments: Vec::new(),
});

#[derive(Debug, Clone)]
pub struct ClosureTypeDefinition {
  pub name: TypeName,
  pub type_parameters: Vec<PStr>,
  pub function_type: FunctionType,
}

fn name_with_tparams(heap: &samlang_heap::Heap, name: TypeName, tparams: &[PStr]) -> String {
  if tparams.is_empty() {
    name.pretty_print(heap)
  } else {
    format!("{}<{}>", name.pretty_print(heap), tparams.iter().map(|it| it.as_str(heap)).join(", "))
  }
}

impl ClosureTypeDefinition {
  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
    format!(
      "closure type {} = {}",
      name_with_tparams(heap, self.name, &self.type_parameters),
      self.function_type.pretty_print(heap)
    )
  }
}

#[derive(Debug, Clone, EnumAsInner)]
pub enum TypeDefinitionMappings {
  Struct(Vec<Type>),
  Enum(Vec<(PStr, Vec<Type>)>),
}

#[derive(Debug, Clone)]
pub struct TypeDefinition {
  pub name: TypeName,
  pub type_parameters: Vec<PStr>,
  pub mappings: TypeDefinitionMappings,
}

impl TypeDefinition {
  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
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
pub enum BinaryOperator {
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

impl BinaryOperator {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::MUL => "*",
      Self::DIV => "/",
      Self::MOD => "%",
      Self::PLUS => "+",
      Self::MINUS => "-",
      Self::LAND => "&",
      Self::LOR => "|",
      Self::SHL => "<<",
      Self::SHR => ">>>",
      Self::XOR => "^",
      Self::LT => "<",
      Self::LE => "<=",
      Self::GT => ">",
      Self::GE => ">=",
      Self::EQ => "==",
      Self::NE => "!=",
    }
  }
}

#[derive(Debug, Clone)]
pub struct VariableName {
  pub name: PStr,
  pub type_: Type,
}

impl PartialEq for VariableName {
  fn eq(&self, other: &Self) -> bool {
    self.name == other.name
  }
}

impl Eq for VariableName {}

impl VariableName {
  pub fn new(name: PStr, type_: Type) -> Self {
    Self { name, type_ }
  }

  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    format!("({}: {})", self.name.as_str(heap), self.type_.pretty_print(heap))
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct FunctionName {
  pub type_name: TypeName,
  pub fn_name: PStr,
}

impl FunctionName {
  pub fn pretty_print(&self, heap: &samlang_heap::Heap) -> String {
    format!("{}${}", self.type_name.pretty_print(heap), self.fn_name.as_str(heap))
  }
}

#[derive(Debug, Clone)]
pub struct FunctionNameExpression {
  pub name: FunctionName,
  pub type_: FunctionType,
  pub type_arguments: Vec<Type>,
}

impl FunctionNameExpression {
  #[cfg(test)]
  pub(super) fn new(name: FunctionName, type_: FunctionType) -> Self {
    Self { name, type_, type_arguments: Vec::new() }
  }

  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
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
pub enum Expression {
  IntLiteral(i32),
  Int31Zero,
  StringName(PStr),
  Variable(VariableName),
}

impl Expression {
  pub fn int(value: i32) -> Self {
    Self::IntLiteral(value)
  }

  pub fn var_name(name: PStr, type_: Type) -> Self {
    Self::Variable(VariableName { name, type_ })
  }

  pub fn type_(&self) -> &Type {
    match self {
      Self::IntLiteral(_) => &INT_TYPE,
      Self::Int31Zero => &INT31_TYPE,
      Self::StringName(_) => STRING_TYPE_REF,
      Self::Variable(v) => &v.type_,
    }
  }

  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    match self {
      Self::IntLiteral(i) => i.to_string(),
      Self::Int31Zero => "0 as i31".to_string(),
      Self::StringName(n) => format!("\"{}\"", n.as_str(heap)),
      Self::Variable(v) => v.debug_print(heap),
    }
  }

  pub fn convert_to_callee(self) -> Option<Callee> {
    match self {
      Self::IntLiteral(_) | Self::Int31Zero | Self::StringName(_) => None,
      Self::Variable(v) => Some(Callee::Variable(v)),
    }
  }
}

pub const ZERO: Expression = Expression::IntLiteral(0);
pub const ONE: Expression = Expression::IntLiteral(1);

#[derive(Debug, Clone, EnumAsInner)]
pub enum Callee {
  FunctionName(FunctionNameExpression),
  Variable(VariableName),
}

impl Callee {
  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    match self {
      Self::FunctionName(f) => f.debug_print(heap),
      Self::Variable(v) => v.debug_print(heap),
    }
  }
}

#[derive(Debug, Clone)]
pub enum Statement {
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
  fn debug_print_internal(
    &self,
    heap: &samlang_heap::Heap,
    level: usize,
    collector: &mut Vec<String>,
  ) {
    match self {
      Self::Not { name, operand } => {
        collector.push(format!(
          "{}let {} = !{};\n",
          "  ".repeat(level),
          name.as_str(heap),
          operand.debug_print(heap),
        ));
      }
      Self::Binary { name, operator, e1, e2 } => {
        collector.push(format!(
          "{}let {} = {} {} {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          e1.debug_print(heap),
          operator.as_str(),
          e2.debug_print(heap)
        ));
      }
      Self::IndexedAccess { name, type_, pointer_expression, index } => {
        collector.push(format!(
          "{}let {}: {} = {}[{}];\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_.pretty_print(heap),
          pointer_expression.debug_print(heap),
          index
        ));
      }
      Self::Call { callee, arguments, return_type, return_collector } => {
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
      Self::ConditionalDestructure { test_expr, tag, bindings, s1, s2, final_assignments } => {
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
          s.debug_print_internal(heap, level + 1, collector);
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
          s.debug_print_internal(heap, level + 1, collector);
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
      Self::IfElse { condition, s1, s2, final_assignments } => {
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
          s.debug_print_internal(heap, level + 1, collector);
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
          s.debug_print_internal(heap, level + 1, collector);
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
      Self::LateInitDeclaration { name, type_ } => {
        collector.push(format!(
          "{}let {}: {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_.pretty_print(heap),
        ));
      }
      Self::LateInitAssignment { name, assigned_expression } => {
        collector.push(format!(
          "{}{} = {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.debug_print(heap),
        ));
      }
      Self::StructInit { struct_variable_name, type_, expression_list } => {
        let expression_str = expression_list.iter().map(|it| it.debug_print(heap)).join(", ");
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name.as_str(heap),
          type_.pretty_print(heap),
          expression_str
        ));
      }
      Self::EnumInit { enum_variable_name, enum_type, tag, associated_data_list } => {
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
      Self::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
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

  fn debug_print_leveled(&self, heap: &samlang_heap::Heap, level: usize) -> String {
    let mut collector = Vec::new();
    self.debug_print_internal(heap, level, &mut collector);
    collector.join("").trim_end().to_string()
  }

  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    self.debug_print_leveled(heap, 0)
  }
}

#[derive(Debug, Clone)]
pub struct Function {
  pub name: FunctionName,
  pub parameters: Vec<PStr>,
  pub type_parameters: Vec<PStr>,
  pub type_: FunctionType,
  pub body: Vec<Statement>,
  pub return_value: Expression,
}

impl Function {
  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
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
    let mut lines = Vec::new();
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
pub struct GlobalString(pub PStr);

#[derive(Debug)]
pub struct Sources {
  pub global_variables: Vec<GlobalString>,
  pub closure_types: Vec<ClosureTypeDefinition>,
  pub type_definitions: Vec<TypeDefinition>,
  pub main_function_names: Vec<FunctionName>,
  pub functions: Vec<Function>,
}

impl Sources {
  pub fn debug_print(&self, heap: &samlang_heap::Heap) -> String {
    let mut lines = Vec::new();
    for (i, v) in self.global_variables.iter().enumerate() {
      lines.push(format!("const GLOBAL_STRING_{} = '{}';\n", i, v.0.as_str(heap)));
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
