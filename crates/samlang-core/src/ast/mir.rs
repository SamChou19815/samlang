use super::hir::{GlobalVariable, Operator};
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::hash::Hash;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct FunctionType {
  pub(crate) argument_types: Vec<Type>,
  pub(crate) return_type: Box<Type>,
}

impl FunctionType {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    use itertools::Itertools;

    format!(
      "({}) -> {}",
      self.argument_types.iter().map(|it| it.pretty_print(heap, table)).join(", "),
      self.return_type.pretty_print(heap, table)
    )
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct TypeName {
  module_reference: ModuleReference,
  type_name: PStr,
  suffix: Vec<Type>,
  sub_type_tag: Option<u32>,
}

impl TypeName {
  const EMPTY: TypeName = TypeName {
    module_reference: ModuleReference::ROOT,
    type_name: PStr::EMPTY,
    suffix: vec![],
    sub_type_tag: None,
  };
  const STR: TypeName = TypeName {
    module_reference: ModuleReference::ROOT,
    type_name: PStr::STR_TYPE,
    suffix: vec![],
    sub_type_tag: None,
  };
  const PROCESS: TypeName = TypeName {
    module_reference: ModuleReference::ROOT,
    type_name: PStr::PROCESS_TYPE,
    suffix: vec![],
    sub_type_tag: None,
  };

  fn encoded(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    collector.push_str(&self.module_reference.encoded(heap));
    collector.push('_');
    collector.push_str(self.type_name.as_str(heap));
    for t in &self.suffix {
      collector.push('_');
      match t {
        Type::Int => collector.push_str("int"),
        Type::Id(id) => id.write_encoded(collector, heap, table),
      }
    }
    if let Some(t) = self.sub_type_tag {
      collector.push_str("$_Sub");
      collector.push_str(&t.to_string());
    }
  }
}

#[cfg(test)]
mod type_name_boilterplate_tests {
  #[test]
  fn test() {
    assert_eq!(super::TypeName::EMPTY.clone().module_reference, super::ModuleReference::ROOT);
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct TypeNameId(u32);

impl TypeNameId {
  pub(crate) const EMPTY: TypeNameId = TypeNameId(0);
  pub(crate) const STR: TypeNameId = TypeNameId(1);
  pub(crate) const PROCESS: TypeNameId = TypeNameId(2);

  pub(super) fn write_encoded(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    table.type_name_lookup_table.get(self).unwrap().encoded(collector, heap, table);
  }

  #[cfg(test)]
  pub(crate) fn encoded_for_test(&self, heap: &Heap, table: &SymbolTable) -> String {
    let mut collector = String::new();
    self.write_encoded(&mut collector, heap, table);
    collector
  }
}

#[derive(Debug)]
pub(crate) struct SymbolTable {
  type_name_interning_table: HashMap<&'static TypeName, TypeNameId>,
  type_name_lookup_table: HashMap<TypeNameId, Box<TypeName>>,
}

impl SymbolTable {
  pub(crate) fn new() -> SymbolTable {
    let mut table =
      Self { type_name_interning_table: HashMap::new(), type_name_lookup_table: HashMap::new() };
    table.create_type_name_internal(TypeName::EMPTY);
    table.create_type_name_internal(TypeName::STR);
    table.create_type_name_internal(TypeName::PROCESS);
    table
  }

  fn create_type_name_internal(&mut self, name: TypeName) -> TypeNameId {
    if let Some(id) = self.type_name_interning_table.get(&name) {
      *id
    } else {
      let id = TypeNameId(self.type_name_interning_table.len() as u32);
      let name = Box::new(name);
      // The name pointer is managed by the the lookup table.
      let unmanaged_name_ptr: &'static TypeName =
        unsafe { (name.as_ref() as *const TypeName).as_ref().unwrap() };
      self.type_name_interning_table.insert(unmanaged_name_ptr, id);
      self.type_name_lookup_table.insert(id, name);
      id
    }
  }

  #[cfg(test)]
  pub(crate) fn create_type_name_for_test(&mut self, name: PStr) -> TypeNameId {
    self.create_simple_type_name(ModuleReference::ROOT, name)
  }

  pub(crate) fn create_simple_type_name(
    &mut self,
    module_reference: ModuleReference,
    type_name: PStr,
  ) -> TypeNameId {
    self.create_type_name_internal(TypeName {
      module_reference,
      type_name,
      suffix: Vec::with_capacity(0),
      sub_type_tag: None,
    })
  }

  pub(crate) fn create_type_name_with_suffix(
    &mut self,
    module_reference: ModuleReference,
    type_name: PStr,
    suffix: Vec<Type>,
  ) -> TypeNameId {
    self.create_type_name_internal(TypeName {
      module_reference,
      type_name,
      suffix,
      sub_type_tag: None,
    })
  }

  pub(crate) fn create_main_type_name(&mut self, module_reference: ModuleReference) -> TypeNameId {
    self.create_simple_type_name(module_reference, PStr::MAIN_TYPE)
  }

  pub(crate) fn derived_type_name_with_subtype_tag(
    &mut self,
    id: TypeNameId,
    tag: u32,
  ) -> TypeNameId {
    let base = self.type_name_lookup_table.get(&id).unwrap();
    self.create_type_name_internal(TypeName {
      module_reference: base.module_reference,
      type_name: base.type_name,
      suffix: base.suffix.clone(),
      sub_type_tag: Some(tag),
    })
  }

  pub(crate) fn derived_type_name_with_suffix(
    &mut self,
    id: TypeNameId,
    suffix: Vec<Type>,
  ) -> TypeNameId {
    let base = self.type_name_lookup_table.get(&id).unwrap();
    self.create_type_name_internal(TypeName {
      module_reference: base.module_reference,
      type_name: base.type_name,
      suffix,
      sub_type_tag: base.sub_type_tag,
    })
  }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, EnumAsInner)]
pub(crate) enum Type {
  Int,
  Id(TypeNameId),
}

impl Type {
  pub(crate) fn new_fn_unwrapped(argument_types: Vec<Type>, return_type: Type) -> FunctionType {
    FunctionType { argument_types, return_type: Box::new(return_type) }
  }

  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    match self {
      Type::Int => "int".to_string(),
      Type::Id(id) => id.encoded_for_test(heap, table),
    }
  }
}

pub(crate) const INT_TYPE: Type = Type::Int;

#[derive(Debug, Clone)]
pub(crate) struct ClosureTypeDefinition {
  pub(crate) name: TypeNameId,
  pub(crate) function_type: FunctionType,
}

impl ClosureTypeDefinition {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    format!(
      "closure type {} = {}",
      self.name.encoded_for_test(heap, table),
      self.function_type.pretty_print(heap, table)
    )
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum EnumTypeDefinition {
  Boxed(Vec<Type>),
  Unboxed(Type),
  Int,
}

impl EnumTypeDefinition {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    use itertools::Itertools;

    match &self {
      EnumTypeDefinition::Boxed(types) => {
        format!("Boxed({})", types.iter().map(|it| it.pretty_print(heap, table)).join(", "))
      }
      EnumTypeDefinition::Unboxed(t) => format!("Unboxed({})", t.pretty_print(heap, table)),
      EnumTypeDefinition::Int => "int".to_string(),
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, EnumAsInner)]
pub(crate) enum TypeDefinitionMappings {
  Struct(Vec<Type>),
  Enum(Vec<EnumTypeDefinition>),
}

#[derive(Debug, Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) name: TypeNameId,
  pub(crate) mappings: TypeDefinitionMappings,
}

impl TypeDefinition {
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    use itertools::Itertools;

    match &self.mappings {
      TypeDefinitionMappings::Struct(types) => {
        format!(
          "object type {} = [{}]",
          self.name.encoded_for_test(heap, table),
          types.iter().map(|it| it.pretty_print(heap, table)).join(", ")
        )
      }
      TypeDefinitionMappings::Enum(variants) => format!(
        "variant type {} = [{}]",
        self.name.encoded_for_test(heap, table),
        variants.iter().map(|it| it.pretty_print(heap, table)).join(", ")
      ),
    }
  }
}

#[derive(Debug, Clone, Copy, Hash)]
pub(crate) struct VariableName {
  pub(crate) name: PStr,
  pub(crate) type_: Type,
}

impl VariableName {
  pub(crate) fn new(name: PStr, type_: Type) -> VariableName {
    VariableName { name, type_ }
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    format!("({}: {})", self.name.as_str(heap), self.type_.pretty_print(heap, table))
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct FunctionName {
  pub(crate) type_name: TypeNameId,
  pub(crate) fn_name: PStr,
}

impl FunctionName {
  pub(crate) const PROCESS_PRINTLN: FunctionName =
    FunctionName { type_name: TypeNameId::PROCESS, fn_name: PStr::PRINTLN };
  pub(crate) const PROCESS_PANIC: FunctionName =
    FunctionName { type_name: TypeNameId::PROCESS, fn_name: PStr::PANIC };

  pub(crate) const STR_FROM_INT: FunctionName =
    FunctionName { type_name: TypeNameId::STR, fn_name: PStr::FROM_INT };
  pub(crate) const STR_TO_INT: FunctionName =
    FunctionName { type_name: TypeNameId::STR, fn_name: PStr::TO_INT };
  pub(crate) const STR_CONCAT: FunctionName =
    FunctionName { type_name: TypeNameId::STR, fn_name: PStr::CONCAT };

  pub(crate) const BUILTIN_MALLOC: FunctionName =
    FunctionName { type_name: TypeNameId::EMPTY, fn_name: PStr::MALLOC_FN };
  pub(crate) const BUILTIN_FREE: FunctionName =
    FunctionName { type_name: TypeNameId::EMPTY, fn_name: PStr::FREE_FN };
  pub(crate) const BUILTIN_INC_REF: FunctionName =
    FunctionName { type_name: TypeNameId::EMPTY, fn_name: PStr::INC_REF_FN };
  pub(crate) const BUILTIN_DEC_REF: FunctionName =
    FunctionName { type_name: TypeNameId::EMPTY, fn_name: PStr::DEC_REF_FN };

  #[cfg(test)]
  pub(crate) fn new_for_test(name: PStr) -> FunctionName {
    FunctionName { type_name: TypeNameId::EMPTY, fn_name: name }
  }

  #[cfg(test)]
  pub(crate) fn encoded_for_test(&self, heap: &Heap, table: &SymbolTable) -> String {
    let mut builder = String::new();
    self.write_encoded(&mut builder, heap, table);
    builder
  }

  pub(crate) fn write_encoded(&self, collector: &mut String, heap: &Heap, table: &SymbolTable) {
    collector.push('_');
    self.type_name.write_encoded(collector, heap, table);
    collector.push('$');
    collector.push_str(self.fn_name.as_str(heap));
  }
}

#[derive(Debug, Clone)]
pub(crate) struct FunctionNameExpression {
  pub(crate) name: FunctionName,
  pub(crate) type_: FunctionType,
}

#[derive(Debug, Clone, Copy, EnumAsInner)]
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

impl Hash for Expression {
  fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
    core::mem::discriminant(self).hash(state);
    match self {
      Expression::IntLiteral(i) => i.hash(state),
      Expression::StringName(n) => n.hash(state),
      Expression::Variable(v) => v.hash(state),
    }
  }
}

impl Expression {
  pub(crate) fn int(value: i32) -> Expression {
    Expression::IntLiteral(value)
  }

  pub(crate) fn var_name(name: PStr, type_: Type) -> Expression {
    Expression::Variable(VariableName { name, type_ })
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    match self {
      Expression::IntLiteral(i) => i.to_string(),
      Expression::StringName(n) => n.as_str(heap).to_string(),
      Expression::Variable(v) => v.debug_print(heap, table),
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
  FunctionName(FunctionNameExpression),
  Variable(VariableName),
}

impl Callee {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    match self {
      Callee::FunctionName(f) => f.name.encoded_for_test(heap, table),
      Callee::Variable(v) => v.debug_print(heap, table),
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
  #[cfg(test)]
  pub(crate) fn pretty_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    format!(
      "{{name: {}, initial_value: {}, loop_value: {}}}",
      self.name.as_str(heap),
      self.initial_value.debug_print(heap, table),
      self.loop_value.debug_print(heap, table)
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
    type_name: TypeNameId,
    expression_list: Vec<Expression>,
  },
  ClosureInit {
    closure_variable_name: PStr,
    closure_type_name: TypeNameId,
    function_name: FunctionNameExpression,
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
      Self::binary_unwrapped(PStr::INVALID_PSTR, operator, e1, e2);
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

  #[cfg(test)]
  fn debug_print_internal(
    &self,
    heap: &Heap,
    table: &SymbolTable,
    level: usize,
    break_collector: &Option<VariableName>,
    collector: &mut Vec<String>,
  ) {
    use itertools::Itertools;

    match self {
      Statement::Binary(s) => {
        let e1 = s.e1.debug_print(heap, table);
        let e2 = s.e2.debug_print(heap, table);
        collector.push(format!(
          "{}let {} = {} {} {};\n",
          "  ".repeat(level),
          s.name.as_str(heap),
          e1,
          s.operator.as_str(),
          e2
        ));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let type_ = type_.pretty_print(heap, table);
        let pointer_expr = pointer_expression.debug_print(heap, table);
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
        let fun_str = callee.debug_print(heap, table);
        let args_str = arguments.iter().map(|it| it.debug_print(heap, table)).join(", ");
        let collector_str = if let Some(collector) = return_collector {
          format!("let {}: {} = ", collector.as_str(heap), return_type.pretty_print(heap, table))
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
            t.pretty_print(heap, table)
          ));
        }
        collector.push(format!(
          "{}if {} {{\n",
          "  ".repeat(level),
          condition.debug_print(heap, table)
        ));
        for s in s1 {
          s.debug_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, v1, _) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v1.debug_print(heap, table)
          ));
        }
        collector.push(format!("{}}} else {{\n", "  ".repeat(level)));
        for s in s2 {
          s.debug_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for (n, _, _, v2) in final_assignments {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            n.as_str(heap),
            v2.debug_print(heap, table)
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
          condition.debug_print(heap, table)
        ));
        for s in statements {
          s.debug_print_internal(heap, table, level + 1, break_collector, collector);
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
          break_value.debug_print(heap, table)
        ));
        collector.push(format!("{}break;\n", "  ".repeat(level)));
      }
      Statement::While { loop_variables, break_collector, statements } => {
        for v in loop_variables {
          collector.push(format!(
            "{}let {}: {} = {};\n",
            "  ".repeat(level),
            v.name.as_str(heap),
            v.type_.pretty_print(heap, table),
            v.initial_value.debug_print(heap, table)
          ));
        }
        if let Some(c) = break_collector {
          collector.push(format!(
            "{}let {}: {};\n",
            "  ".repeat(level),
            c.name.as_str(heap),
            c.type_.pretty_print(heap, table)
          ));
        }
        collector.push(format!("{}while (true) {{\n", "  ".repeat(level)));
        for nested in statements {
          nested.debug_print_internal(heap, table, level + 1, break_collector, collector);
        }
        for v in loop_variables {
          collector.push(format!(
            "{}{} = {};\n",
            "  ".repeat(level + 1),
            v.name.as_str(heap),
            v.loop_value.debug_print(heap, table)
          ));
        }
        collector.push(format!("{}}}\n", "  ".repeat(level)));
      }
      Statement::Cast { name, type_, assigned_expression } => {
        collector.push(format!(
          "{}let {} = {} as {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.debug_print(heap, table),
          type_.pretty_print(heap, table),
        ));
      }
      Statement::LateInitDeclaration { name, type_ } => {
        collector.push(format!(
          "{}let {}: {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          type_.pretty_print(heap, table),
        ));
      }
      Statement::LateInitAssignment { name, assigned_expression } => {
        collector.push(format!(
          "{}{} = {};\n",
          "  ".repeat(level),
          name.as_str(heap),
          assigned_expression.debug_print(heap, table),
        ));
      }
      Statement::StructInit { struct_variable_name, type_name, expression_list } => {
        let expression_str =
          expression_list.iter().map(|it| it.debug_print(heap, table)).join(", ");
        collector.push(format!(
          "{}let {}: {} = [{}];\n",
          "  ".repeat(level),
          struct_variable_name.as_str(heap),
          type_name.encoded_for_test(heap, table),
          expression_str
        ));
      }
      Statement::ClosureInit {
        closure_variable_name,
        closure_type_name,
        function_name,
        context,
      } => {
        let closure_name_type = format!(
          "{}: {}",
          closure_variable_name.as_str(heap),
          closure_type_name.encoded_for_test(heap, table)
        );
        let function_name_type = format!(
          "{}: {}",
          function_name.name.encoded_for_test(heap, table),
          function_name.type_.pretty_print(heap, table)
        );
        collector.push(format!(
          "{}let {} = Closure {{ fun: ({}), context: {} }};\n",
          "  ".repeat(level),
          closure_name_type,
          function_name_type,
          context.debug_print(heap, table)
        ));
      }
    }
  }

  #[cfg(test)]
  fn debug_print_leveled(&self, heap: &Heap, table: &SymbolTable, level: usize) -> String {
    let mut collector = vec![];
    self.debug_print_internal(heap, table, level, &None, &mut collector);
    collector.join("").trim_end().to_string()
  }

  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    self.debug_print_leveled(heap, table, 0)
  }
}

#[derive(Debug, Clone)]
pub(crate) struct Function {
  pub(crate) name: FunctionName,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) type_: FunctionType,
  pub(crate) body: Vec<Statement>,
  pub(crate) return_value: Expression,
}

impl Function {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap, table: &SymbolTable) -> String {
    use itertools::Itertools;

    let typed_parameters = self
      .parameters
      .iter()
      .zip(&self.type_.argument_types)
      .map(|(n, t)| format!("{}: {}", n.as_str(heap), t.pretty_print(heap, table)))
      .join(", ");
    let header = format!(
      "function {}({}): {} {{",
      self.name.encoded_for_test(heap, table),
      typed_parameters,
      self.type_.return_type.pretty_print(heap, table)
    );
    let mut lines = vec![];
    lines.push(header);
    for s in &self.body {
      lines.push(s.debug_print_leveled(heap, table, 1));
    }
    lines.push(format!("  return {};", self.return_value.debug_print(heap, table)));
    lines.push("}".to_string());
    lines.join("\n") + "\n"
  }
}

#[derive(Debug)]
pub(crate) struct Sources {
  pub(crate) symbol_table: SymbolTable,
  pub(crate) global_variables: Vec<GlobalVariable>,
  pub(crate) closure_types: Vec<ClosureTypeDefinition>,
  pub(crate) type_definitions: Vec<TypeDefinition>,
  pub(crate) main_function_names: Vec<FunctionName>,
  pub(crate) functions: Vec<Function>,
}

impl Sources {
  #[cfg(test)]
  pub(crate) fn debug_print(&self, heap: &Heap) -> String {
    use itertools::Itertools;

    let mut lines = vec![];
    for v in &self.global_variables {
      lines.push(format!("const {} = '{}';\n", v.name.as_str(heap), v.content.as_str(heap)));
    }
    for d in &self.closure_types {
      lines.push(d.pretty_print(heap, &self.symbol_table));
    }
    for d in &self.type_definitions {
      lines.push(d.pretty_print(heap, &self.symbol_table));
    }
    for f in &self.functions {
      lines.push(f.debug_print(heap, &self.symbol_table));
    }
    if !self.main_function_names.is_empty() {
      lines.push(format!(
        "sources.mains = [{}]",
        self
          .main_function_names
          .iter()
          .map(|it| it.encoded_for_test(heap, &self.symbol_table))
          .join(", ")
      ));
    }
    lines.join("\n")
  }
}
