use super::{hir, lir, mir};
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, PStr};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, EnumAsInner)]
pub enum Type {
  Int32,
  Int31,
  Eq,
  Reference(mir::TypeNameId),
}

impl Type {
  fn pretty_print(&self, collector: &mut String, _heap: &Heap, _table: &mir::SymbolTable) {
    collector.push_str("i32");
    /*
    match self {
      Type::Int32 => collector.push_str("i32"),
      Type::Int31 => collector.push_str("(ref i31)"),
      Type::Eq => collector.push_str("(ref eq)"),
      Type::Reference(id) => {
        collector.push_str("(ref $");
        id.write_encoded(collector, heap, table);
        collector.push(')');
      }
    }
    */
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FunctionType {
  pub argument_types: Vec<Type>,
  pub return_type: Box<Type>,
}

impl FunctionType {
  fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &mir::SymbolTable) {
    if self.argument_types.is_empty() {
      collector.push_str("(func (result ");
      self.return_type.pretty_print(collector, heap, table);
      collector.push_str("))");
    } else {
      collector.push_str("(func (param");
      for t in &self.argument_types {
        collector.push(' ');
        t.pretty_print(collector, heap, table);
      }
      collector.push_str(") (result ");
      self.return_type.pretty_print(collector, heap, table);
      collector.push_str("))");
    }
  }
}

pub struct TypeDefinition {
  pub name: mir::TypeNameId,
  pub mappings: Vec<Type>,
}

pub enum InlineInstruction {
  Const(i32),
  Drop(Box<InlineInstruction>),
  LocalGet(PStr),
  LocalSet(PStr, Box<InlineInstruction>),
  IsPointer {
    pointer_type: lir::Type,
    value: Box<InlineInstruction>,
  },
  Cast {
    pointer_type: lir::Type,
    value: Box<InlineInstruction>,
  },
  Binary(Box<InlineInstruction>, hir::BinaryOperator, Box<InlineInstruction>),
  Load {
    index: usize,
    pointer: Box<InlineInstruction>,
  },
  StructLoad {
    index: usize,
    struct_type: mir::TypeNameId,
    struct_ref: Box<InlineInstruction>,
  },
  Store {
    index: usize,
    pointer: Box<InlineInstruction>,
    assigned: Box<InlineInstruction>,
  },
  StructStore {
    index: usize,
    struct_type: mir::TypeNameId,
    struct_ref: Box<InlineInstruction>,
    assigned: Box<InlineInstruction>,
  },
  StructInit {
    type_: mir::TypeNameId,
    expression_list: Vec<InlineInstruction>,
  },
  DirectCall(mir::FunctionName, Vec<InlineInstruction>),
  IndirectCall {
    function_index: Box<InlineInstruction>,
    function_type_name: mir::TypeNameId,
    arguments: Vec<InlineInstruction>,
  },
}

impl InlineInstruction {
  fn pretty_print(&self, collector: &mut String, heap: &Heap, table: &mir::SymbolTable) {
    match self {
      InlineInstruction::Const(i) => {
        collector.push_str("(i32.const ");
        collector.push_str(&i.to_string());
        collector.push(')');
      }
      InlineInstruction::Drop(v) => {
        collector.push_str("(drop ");
        v.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::LocalGet(name) => {
        collector.push_str("(local.get $");
        collector.push_str(name.as_str(heap));
        collector.push(')');
      }
      InlineInstruction::LocalSet(name, assigned) => {
        collector.push_str("(local.set $");
        collector.push_str(name.as_str(heap));
        collector.push(' ');
        assigned.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::IsPointer { pointer_type, value } => {
        collector.push_str("(ref.test $");
        pointer_type.pretty_print(collector, heap, table);
        collector.push(' ');
        value.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::Cast { pointer_type, value } => {
        collector.push_str("(ref.cast $");
        pointer_type.pretty_print(collector, heap, table);
        collector.push(' ');
        value.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::Binary(v1, op, v2) => {
        let op_s = match op {
          hir::BinaryOperator::MUL => "mul",
          hir::BinaryOperator::DIV => "div_s",
          hir::BinaryOperator::MOD => "rem_s",
          hir::BinaryOperator::PLUS => "add",
          hir::BinaryOperator::MINUS => "sub",
          hir::BinaryOperator::LAND => "and",
          hir::BinaryOperator::LOR => "or",
          hir::BinaryOperator::SHL => "shl",
          hir::BinaryOperator::SHR => "shr_u",
          hir::BinaryOperator::XOR => "xor",
          hir::BinaryOperator::LT => "lt_s",
          hir::BinaryOperator::LE => "le_s",
          hir::BinaryOperator::GT => "gt_s",
          hir::BinaryOperator::GE => "ge_s",
          hir::BinaryOperator::EQ => "eq",
          hir::BinaryOperator::NE => "ne",
        };
        collector.push_str("(i32.");
        collector.push_str(op_s);
        collector.push(' ');
        v1.pretty_print(collector, heap, table);
        collector.push(' ');
        v2.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::Load { index, pointer } => {
        if *index == 0 {
          collector.push_str("(i32.load ");
          pointer.pretty_print(collector, heap, table);
          collector.push(')');
        } else {
          collector.push_str("(i32.load offset=");
          collector.push_str(&(index * 4).to_string());
          collector.push(' ');
          pointer.pretty_print(collector, heap, table);
          collector.push(')');
        }
      }
      InlineInstruction::StructLoad { index, struct_type, struct_ref } => {
        collector.push_str("(struct.get $");
        struct_type.write_encoded(collector, heap, table);
        collector.push(' ');
        collector.push_str(&index.to_string());
        collector.push(' ');
        struct_ref.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::Store { index, pointer, assigned } => {
        if *index == 0 {
          collector.push_str("(i32.store ");
          pointer.pretty_print(collector, heap, table);
          collector.push(' ');
          assigned.pretty_print(collector, heap, table);
          collector.push(')');
        } else {
          collector.push_str("(i32.store offset=");
          collector.push_str(&(index * 4).to_string());
          collector.push(' ');
          pointer.pretty_print(collector, heap, table);
          collector.push(' ');
          assigned.pretty_print(collector, heap, table);
          collector.push(')');
        }
      }
      InlineInstruction::StructStore { index, struct_type, struct_ref, assigned } => {
        collector.push_str("(struct.set $");
        struct_type.write_encoded(collector, heap, table);
        collector.push(' ');
        collector.push_str(&index.to_string());
        collector.push(' ');
        struct_ref.pretty_print(collector, heap, table);
        collector.push(' ');
        assigned.pretty_print(collector, heap, table);
        collector.push(')');
      }
      InlineInstruction::StructInit { type_, expression_list } => {
        collector.push_str("(struct.new $");
        type_.write_encoded(collector, heap, table);
        for e in expression_list {
          collector.push(' ');
          e.pretty_print(collector, heap, table);
        }
        collector.push(')');
      }
      InlineInstruction::DirectCall(name, arguments) => {
        collector.push_str("(call $");
        name.write_encoded(collector, heap, table);
        for e in arguments {
          collector.push(' ');
          e.pretty_print(collector, heap, table);
        }
        collector.push(')');
      }
      InlineInstruction::IndirectCall { function_index, function_type_name, arguments } => {
        collector.push_str("(call_indirect $0 (type $");
        function_type_name.write_encoded(collector, heap, table);
        collector.push(')');
        for e in arguments {
          collector.push(' ');
          e.pretty_print(collector, heap, table);
        }
        collector.push(' ');
        function_index.pretty_print(collector, heap, table);
        collector.push(')');
      }
    }
  }
}

#[derive(Clone, Copy)]
pub struct LabelId(pub u32);

pub enum Instruction {
  Inline(InlineInstruction),
  IfElse { condition: InlineInstruction, s1: Vec<Instruction>, s2: Vec<Instruction> },
  UnconditionalJump(LabelId),
  Loop { continue_label: LabelId, exit_label: LabelId, instructions: Vec<Instruction> },
}

impl Instruction {
  fn append_spaces(collector: &mut String, repeat: usize) {
    for _ in 0..repeat {
      collector.push_str("  ");
    }
  }

  fn print_to_collector(
    &self,
    heap: &Heap,
    table: &mir::SymbolTable,
    collector: &mut String,
    level: usize,
  ) {
    match self {
      Instruction::Inline(i) => {
        Self::append_spaces(collector, level);
        i.pretty_print(collector, heap, table);
        collector.push('\n');
      }
      Instruction::IfElse { condition, s1, s2 } => {
        Self::append_spaces(collector, level);
        collector.push_str("(if ");
        condition.pretty_print(collector, heap, table);
        collector.push_str(" (then\n");
        for s in s1 {
          s.print_to_collector(heap, table, collector, level + 1)
        }
        if !s2.is_empty() {
          Self::append_spaces(collector, level);
          collector.push_str(") (else\n");
          for s in s2 {
            s.print_to_collector(heap, table, collector, level + 1)
          }
        }
        Self::append_spaces(collector, level);
        collector.push_str("))\n");
      }
      Instruction::UnconditionalJump(label) => {
        Self::append_spaces(collector, level);
        collector.push_str("(br $l");
        collector.push_str(&label.0.to_string());
        collector.push_str(")\n");
      }
      Instruction::Loop { continue_label, exit_label, instructions } => {
        Self::append_spaces(collector, level);
        collector.push_str("(loop $l");
        collector.push_str(&continue_label.0.to_string());
        collector.push('\n');
        Self::append_spaces(collector, level + 1);
        collector.push_str("(block $l");
        collector.push_str(&exit_label.0.to_string());
        collector.push('\n');
        for s in instructions {
          s.print_to_collector(heap, table, collector, level + 2)
        }
        Self::append_spaces(collector, level + 1);
        collector.push_str(")\n");
        Self::append_spaces(collector, level);
        collector.push_str(")\n");
      }
    }
  }
}

pub struct Function {
  pub name: mir::FunctionName,
  pub parameters: Vec<(PStr, Type)>,
  pub local_variables: Vec<(PStr, Type)>,
  pub instructions: Vec<Instruction>,
}

pub struct GlobalData {
  pub constant_pointer: usize,
  pub bytes: Vec<u8>,
}

fn byte_digit_to_char(byte: u8) -> char {
  let u = if byte < 10 { b'0' + byte } else { b'a' + byte - 10 };
  u as char
}

fn print_byte_vec(collector: &mut String, array: &[u8]) {
  for b in array {
    if b.is_ascii_alphanumeric() {
      collector.push(*b as char);
    } else {
      collector.push('\\');
      collector.push(byte_digit_to_char(b / 16));
      collector.push(byte_digit_to_char(b % 16));
    }
  }
}

impl GlobalData {
  fn pretty_print(&self, collector: &mut String) {
    collector.push_str("(data (i32.const ");
    collector.push_str(&self.constant_pointer.to_string());
    collector.push_str(") \"");
    print_byte_vec(collector, &self.bytes);
    collector.push_str("\")\n");
  }
}

pub struct Module {
  pub symbol_table: mir::SymbolTable,
  pub function_type_mapping: Vec<(mir::TypeNameId, FunctionType)>,
  pub type_definitions: Vec<TypeDefinition>,
  pub global_variables: Vec<GlobalData>,
  pub exported_functions: Vec<mir::FunctionName>,
  pub functions: Vec<Function>,
}

impl Module {
  pub fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = String::new();
    for (type_name, fun_t) in &self.function_type_mapping {
      collector.push_str("(type $");
      type_name.write_encoded(&mut collector, heap, &self.symbol_table);
      collector.push(' ');
      fun_t.pretty_print(&mut collector, heap, &self.symbol_table);
      collector.push_str(")\n");
    }
    for type_def in &self.type_definitions {
      collector.push_str("(type $");
      type_def.name.write_encoded(&mut collector, heap, &self.symbol_table);
      collector.push_str(" (struct");
      for field in &type_def.mappings {
        collector.push_str(" (field ");
        field.pretty_print(&mut collector, heap, &self.symbol_table);
        collector.push(')');
      }
      collector.push_str("))\n");
    }
    for d in &self.global_variables {
      d.pretty_print(&mut collector);
    }
    collector.push_str("(table $0 ");
    collector.push_str(&self.functions.len().to_string());
    collector.push_str(" funcref)\n(elem $0 (i32.const 0)");
    for f in &self.functions {
      collector.push_str(" $");
      f.name.write_encoded(&mut collector, heap, &self.symbol_table);
    }
    collector.push_str(")\n");
    for Function { name, parameters, local_variables, instructions } in &self.functions {
      collector.push_str("(func $");
      name.write_encoded(&mut collector, heap, &self.symbol_table);
      for (param, t) in parameters {
        collector.push_str(" (param $");
        collector.push_str(param.as_str(heap));
        collector.push(' ');
        t.pretty_print(&mut collector, heap, &self.symbol_table);
        collector.push(')');
      }
      collector.push_str(" (result i32)\n");
      for (v, t) in local_variables {
        collector.push_str("  (local $");
        collector.push_str(v.as_str(heap));
        collector.push(' ');
        t.pretty_print(&mut collector, heap, &self.symbol_table);
        collector.push_str(")\n");
      }
      for i in instructions {
        i.print_to_collector(heap, &self.symbol_table, &mut collector, 1);
      }
      collector.push_str(")\n");
    }
    for f in &self.exported_functions {
      collector.push_str("(export \"");
      f.write_encoded(&mut collector, heap, &self.symbol_table);
      collector.push_str("\" (func $");
      f.write_encoded(&mut collector, heap, &self.symbol_table);
      collector.push_str("))\n");
    }
    collector
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_heap::PStr;
  use std::hash::{DefaultHasher, Hash};

  #[test]
  fn type_tests() {
    let table = &mut mir::SymbolTable::new();
    let f = FunctionType {
      argument_types: vec![
        Type::Int32,
        Type::Eq,
        Type::Reference(table.create_type_name_for_test(PStr::UPPER_A)),
      ],
      return_type: Box::new(Type::Int31),
    };
    f.hash(&mut DefaultHasher::new());
    assert!(f.eq(&f));
    let heap = &mut Heap::new();
    let mut collector = "".to_string();
    f.pretty_print(&mut collector, heap, table);
    assert_eq!("(func (param i32 i32 i32) (result i32))", collector);
    // assert_eq!("(func (param i32 eq (ref $_A)) (result i31))", collector);
    collector.clear();
    FunctionType { argument_types: Vec::new(), return_type: Box::new(Type::Int31) }.pretty_print(
      &mut collector,
      heap,
      table,
    );
    assert_eq!("(func (result i32))", collector);
    // assert_eq!("(func (result i31))", collector);
  }

  #[test]
  fn int_vec_to_data_string_tests() {
    let mut s = String::new();
    print_byte_vec(&mut s, &[1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]);
    assert_eq!("\\01\\00\\00\\00\\02\\00\\00\\00\\03\\00\\00\\00\\04\\00\\00\\00", s);
    s.clear();
    print_byte_vec(&mut s, &[1, 0, 0, 0, 124, 0, 0, 0, 22, 0, 0, 0, 33, 0, 0, 0]);
    assert_eq!("\\01\\00\\00\\00\\7c\\00\\00\\00\\16\\00\\00\\00\\21\\00\\00\\00", s);
  }

  #[test]
  fn pretty_print_test() {
    let heap = &mut Heap::new();
    let mut table = mir::SymbolTable::new();

    let mut module = Module {
      symbol_table: mir::SymbolTable::new(),
      function_type_mapping: Vec::new(),
      type_definitions: vec![TypeDefinition {
        name: table.create_type_name_for_test(PStr::UPPER_F),
        mappings: vec![
          Type::Int32,
          Type::Reference(table.create_type_name_for_test(PStr::UPPER_F)),
        ],
      }],
      global_variables: vec![
        GlobalData { constant_pointer: 1024, bytes: vec![0, 0] },
        GlobalData { constant_pointer: 323, bytes: vec![3, 2] },
      ],
      exported_functions: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![(PStr::LOWER_A, Type::Int32), (PStr::LOWER_B, Type::Int31)],
        local_variables: vec![
          (PStr::LOWER_C, Type::Eq),
          (PStr::LOWER_D, Type::Reference(table.create_type_name_for_test(PStr::UPPER_F))),
        ],
        instructions: vec![
          Instruction::IfElse {
            condition: InlineInstruction::Const(1),
            s1: vec![
              Instruction::Inline(InlineInstruction::Const(1)),
              Instruction::Inline(InlineInstruction::Drop(Box::new(InlineInstruction::Const(0)))),
              Instruction::Inline(InlineInstruction::LocalGet(PStr::LOWER_A)),
              Instruction::Inline(InlineInstruction::LocalSet(
                PStr::LOWER_B,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::IsPointer {
                pointer_type: lir::Type::Id(table.create_type_name_for_test(PStr::UPPER_F)),
                value: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::Cast {
                pointer_type: lir::Type::Id(table.create_type_name_for_test(PStr::UPPER_F)),
                value: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::StructInit {
                type_: table.create_type_name_for_test(PStr::UPPER_F),
                expression_list: vec![InlineInstruction::Const(0)],
              }),
              Instruction::Inline(InlineInstruction::StructLoad {
                index: 3,
                struct_type: table.create_type_name_for_test(PStr::UPPER_F),
                struct_ref: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::StructStore {
                index: 3,
                struct_type: table.create_type_name_for_test(PStr::UPPER_F),
                struct_ref: Box::new(InlineInstruction::Const(0)),
                assigned: Box::new(InlineInstruction::Const(1)),
              }),
            ],
            s2: vec![
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::PLUS,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::MINUS,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::MUL,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::DIV,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::MOD,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::LAND,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::LOR,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::SHL,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::SHR,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::XOR,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::LT,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::LE,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::GT,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::GE,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::EQ,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                hir::BinaryOperator::NE,
                Box::new(InlineInstruction::Const(0)),
              )),
            ],
          },
          Instruction::UnconditionalJump(LabelId(0)),
          Instruction::Loop {
            continue_label: LabelId(1),
            exit_label: LabelId(2),
            instructions: vec![
              Instruction::Inline(InlineInstruction::Load {
                index: 0,
                pointer: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::Load {
                index: 3,
                pointer: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::Store {
                index: 0,
                pointer: Box::new(InlineInstruction::Const(0)),
                assigned: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::Store {
                index: 3,
                pointer: Box::new(InlineInstruction::Const(0)),
                assigned: Box::new(InlineInstruction::Const(0)),
              }),
              Instruction::Inline(InlineInstruction::DirectCall(
                mir::FunctionName::new_for_test(PStr::MAIN_FN),
                vec![InlineInstruction::Const(0)],
              )),
              Instruction::Inline(InlineInstruction::IndirectCall {
                function_index: Box::new(InlineInstruction::Const(0)),
                function_type_name: table.create_type_name_for_test(PStr::UPPER_F),
                arguments: vec![InlineInstruction::Const(0)],
              }),
            ],
          },
          Instruction::IfElse {
            condition: InlineInstruction::Const(1),
            s1: vec![Instruction::Inline(InlineInstruction::Const(1))],
            s2: Vec::new(),
          },
        ],
      }],
    };
    module.symbol_table = table;
    let expected = r#"(type $_F (struct (field i32) (field i32)))
(data (i32.const 1024) "\00\00")
(data (i32.const 323) "\03\02")
(table $0 1 funcref)
(elem $0 (i32.const 0) $__$main)
(func $__$main (param $a i32) (param $b i32) (result i32)
  (local $c i32)
  (local $d i32)
  (if (i32.const 1) (then
    (i32.const 1)
    (drop (i32.const 0))
    (local.get $a)
    (local.set $b (i32.const 0))
    (ref.test $_F (i32.const 0))
    (ref.cast $_F (i32.const 0))
    (struct.new $_F (i32.const 0))
    (struct.get $_F 3 (i32.const 0))
    (struct.set $_F 3 (i32.const 0) (i32.const 1))
  ) (else
    (i32.add (i32.const 0) (i32.const 0))
    (i32.sub (i32.const 0) (i32.const 0))
    (i32.mul (i32.const 0) (i32.const 0))
    (i32.div_s (i32.const 0) (i32.const 0))
    (i32.rem_s (i32.const 0) (i32.const 0))
    (i32.and (i32.const 0) (i32.const 0))
    (i32.or (i32.const 0) (i32.const 0))
    (i32.shl (i32.const 0) (i32.const 0))
    (i32.shr_u (i32.const 0) (i32.const 0))
    (i32.xor (i32.const 0) (i32.const 0))
    (i32.lt_s (i32.const 0) (i32.const 0))
    (i32.le_s (i32.const 0) (i32.const 0))
    (i32.gt_s (i32.const 0) (i32.const 0))
    (i32.ge_s (i32.const 0) (i32.const 0))
    (i32.eq (i32.const 0) (i32.const 0))
    (i32.ne (i32.const 0) (i32.const 0))
  ))
  (br $l0)
  (loop $l1
    (block $l2
      (i32.load (i32.const 0))
      (i32.load offset=12 (i32.const 0))
      (i32.store (i32.const 0) (i32.const 0))
      (i32.store offset=12 (i32.const 0) (i32.const 0))
      (call $__$main (i32.const 0))
      (call_indirect $0 (type $_F) (i32.const 0) (i32.const 0))
    )
  )
  (if (i32.const 1) (then
    (i32.const 1)
  ))
)
(export "__$main" (func $__$main))
"#;
    assert_eq!(expected, module.pretty_print(heap));
  }
}
