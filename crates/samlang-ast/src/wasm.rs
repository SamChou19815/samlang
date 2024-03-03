use super::{hir, mir};
use samlang_heap::{Heap, PStr};

pub enum InlineInstruction {
  Const(i32),
  Drop(Box<InlineInstruction>),
  LocalGet(PStr),
  LocalSet(PStr, Box<InlineInstruction>),
  Binary(Box<InlineInstruction>, hir::BinaryOperator, Box<InlineInstruction>),
  Load {
    index: usize,
    pointer: Box<InlineInstruction>,
  },
  Store {
    index: usize,
    pointer: Box<InlineInstruction>,
    assigned: Box<InlineInstruction>,
  },
  DirectCall(mir::FunctionName, Vec<InlineInstruction>),
  IndirectCall {
    function_index: Box<InlineInstruction>,
    fn_arg_count: usize,
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
      InlineInstruction::DirectCall(name, arguments) => {
        collector.push_str("(call $");
        name.write_encoded(collector, heap, table);
        for e in arguments {
          collector.push(' ');
          e.pretty_print(collector, heap, table);
        }
        collector.push(')');
      }
      InlineInstruction::IndirectCall { function_index, fn_arg_count, arguments } => {
        collector.push_str("(call_indirect $0 (type $");
        print_function_type_string(collector, *fn_arg_count);
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

fn print_function_type_string(collector: &mut String, count: usize) {
  if count == 0 {
    collector.push_str("none_=>_i32")
  } else {
    for _ in 0..count {
      collector.push_str("i32_");
    }
    collector.push_str("=>_i32");
  }
}

pub struct Function {
  pub name: mir::FunctionName,
  pub parameters: Vec<PStr>,
  pub local_variables: Vec<PStr>,
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
  pub function_type_parameter_counts: Vec<usize>,
  pub global_variables: Vec<GlobalData>,
  pub exported_functions: Vec<mir::FunctionName>,
  pub functions: Vec<Function>,
}

impl Module {
  pub fn pretty_print(&self, heap: &Heap, table: &mir::SymbolTable) -> String {
    let mut collector = String::new();
    for count in &self.function_type_parameter_counts {
      collector.push_str("(type $");
      print_function_type_string(&mut collector, *count);
      if *count == 0 {
        collector.push_str(" (func (result i32)))\n");
      } else {
        collector.push_str(" (func (param");
        for _ in 0..*count {
          collector.push_str(" i32");
        }
        collector.push_str(") (result i32)))\n");
      }
    }
    for d in &self.global_variables {
      d.pretty_print(&mut collector);
    }
    collector.push_str("(table $0 ");
    collector.push_str(&self.functions.len().to_string());
    collector.push_str(" funcref)\n(elem $0 (i32.const 0)");
    for f in &self.functions {
      collector.push_str(" $");
      f.name.write_encoded(&mut collector, heap, table);
    }
    collector.push_str(")\n");
    for Function { name, parameters, local_variables, instructions } in &self.functions {
      collector.push_str("(func $");
      name.write_encoded(&mut collector, heap, table);
      for param in parameters {
        collector.push_str(" (param $");
        collector.push_str(param.as_str(heap));
        collector.push_str(" i32)");
      }
      collector.push_str(" (result i32)\n");
      for v in local_variables {
        collector.push_str("  (local $");
        collector.push_str(v.as_str(heap));
        collector.push_str(" i32)\n");
      }
      for i in instructions {
        i.print_to_collector(heap, table, &mut collector, 1);
      }
      collector.push_str(")\n");
    }
    for f in &self.exported_functions {
      collector.push_str("(export \"");
      f.write_encoded(&mut collector, heap, table);
      collector.push_str("\" (func $");
      f.write_encoded(&mut collector, heap, table);
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

    let module = Module {
      function_type_parameter_counts: vec![0, 1, 2, 3],
      global_variables: vec![
        GlobalData { constant_pointer: 1024, bytes: vec![0, 0] },
        GlobalData { constant_pointer: 323, bytes: vec![3, 2] },
      ],
      exported_functions: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![PStr::LOWER_A, PStr::LOWER_B],
        local_variables: vec![PStr::LOWER_C, PStr::LOWER_D],
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
                fn_arg_count: 1,
                arguments: vec![InlineInstruction::Const(0)],
              }),
            ],
          },
          Instruction::IfElse {
            condition: InlineInstruction::Const(1),
            s1: vec![Instruction::Inline(InlineInstruction::Const(1))],
            s2: vec![],
          },
        ],
      }],
    };
    let expected = r#"(type $none_=>_i32 (func (result i32)))
(type $i32_=>_i32 (func (param i32) (result i32)))
(type $i32_i32_=>_i32 (func (param i32 i32) (result i32)))
(type $i32_i32_i32_=>_i32 (func (param i32 i32 i32) (result i32)))
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
      (call_indirect $0 (type $i32_=>_i32) (i32.const 0) (i32.const 0))
    )
  )
  (if (i32.const 1) (then
    (i32.const 1)
  ))
)
(export "__$main" (func $__$main))
"#;
    assert_eq!(expected, module.pretty_print(heap, &mir::SymbolTable::new()));
  }
}
