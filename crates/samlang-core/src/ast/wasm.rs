use super::hir;
use crate::common::{int_vec_to_data_string, Heap, PStr};
use itertools::Itertools;

pub(crate) enum InlineInstruction {
  Const(i32),
  Drop(Box<InlineInstruction>),
  LocalGet(PStr),
  LocalSet(PStr, Box<InlineInstruction>),
  Binary(Box<InlineInstruction>, hir::Operator, Box<InlineInstruction>),
  Load {
    index: usize,
    pointer: Box<InlineInstruction>,
  },
  Store {
    index: usize,
    pointer: Box<InlineInstruction>,
    assigned: Box<InlineInstruction>,
  },
  DirectCall(PStr, Vec<InlineInstruction>),
  IndirectCall {
    function_index: Box<InlineInstruction>,
    type_string: PStr,
    arguments: Vec<InlineInstruction>,
  },
}

impl InlineInstruction {
  fn pretty_print(&self, heap: &Heap, string_builder: &mut String) {
    match self {
      InlineInstruction::Const(i) => {
        string_builder.push_str("(i32.const ");
        string_builder.push_str(&i.to_string());
        string_builder.push(')');
      }
      InlineInstruction::Drop(v) => {
        string_builder.push_str("(drop ");
        v.pretty_print(heap, string_builder);
        string_builder.push(')');
      }
      InlineInstruction::LocalGet(name) => {
        string_builder.push_str("(local.get $");
        string_builder.push_str(name.as_str(heap));
        string_builder.push(')');
      }
      InlineInstruction::LocalSet(name, assigned) => {
        string_builder.push_str("(local.set $");
        string_builder.push_str(name.as_str(heap));
        string_builder.push(' ');
        assigned.pretty_print(heap, string_builder);
        string_builder.push(')');
      }
      InlineInstruction::Binary(v1, op, v2) => {
        let op_s = match op {
          hir::Operator::MUL => "mul",
          hir::Operator::DIV => "div_s",
          hir::Operator::MOD => "rem_s",
          hir::Operator::PLUS => "add",
          hir::Operator::MINUS => "sub",
          hir::Operator::XOR => "xor",
          hir::Operator::LT => "lt_s",
          hir::Operator::LE => "le_s",
          hir::Operator::GT => "gt_s",
          hir::Operator::GE => "ge_s",
          hir::Operator::EQ => "eq",
          hir::Operator::NE => "ne",
        };
        string_builder.push_str("(i32.");
        string_builder.push_str(op_s);
        string_builder.push(' ');
        v1.pretty_print(heap, string_builder);
        string_builder.push(' ');
        v2.pretty_print(heap, string_builder);
        string_builder.push(')');
      }
      InlineInstruction::Load { index, pointer } => {
        if *index == 0 {
          string_builder.push_str("(i32.load ");
          pointer.pretty_print(heap, string_builder);
          string_builder.push(')');
        } else {
          string_builder.push_str("(i32.load offset=");
          string_builder.push_str(&(index * 4).to_string());
          string_builder.push(' ');
          pointer.pretty_print(heap, string_builder);
          string_builder.push(')');
        }
      }
      InlineInstruction::Store { index, pointer, assigned } => {
        if *index == 0 {
          string_builder.push_str("(i32.store ");
          pointer.pretty_print(heap, string_builder);
          string_builder.push(' ');
          assigned.pretty_print(heap, string_builder);
          string_builder.push(')');
        } else {
          string_builder.push_str("(i32.store offset=");
          string_builder.push_str(&(index * 4).to_string());
          string_builder.push(' ');
          pointer.pretty_print(heap, string_builder);
          string_builder.push(' ');
          assigned.pretty_print(heap, string_builder);
          string_builder.push(')');
        }
      }
      InlineInstruction::DirectCall(name, arguments) => {
        string_builder.push_str("(call $");
        string_builder.push_str(name.as_str(heap));
        for e in arguments {
          string_builder.push(' ');
          e.pretty_print(heap, string_builder);
        }
        string_builder.push(')');
      }
      InlineInstruction::IndirectCall { function_index, type_string, arguments } => {
        string_builder.push_str("(call_indirect $0 (type $");
        string_builder.push_str(type_string.as_str(heap));
        string_builder.push(')');
        for e in arguments {
          string_builder.push(' ');
          e.pretty_print(heap, string_builder);
        }
        string_builder.push(' ');
        function_index.pretty_print(heap, string_builder);
        string_builder.push(')');
      }
    }
  }
}

pub(crate) enum Instruction {
  Inline(InlineInstruction),
  IfElse { condition: InlineInstruction, s1: Vec<Instruction>, s2: Vec<Instruction> },
  UnconditionalJump(PStr),
  Loop { continue_label: PStr, exit_label: PStr, instructions: Vec<Instruction> },
}

impl Instruction {
  fn print_to_collector(&self, heap: &Heap, collector: &mut String, level: usize) {
    match self {
      Instruction::Inline(i) => {
        collector.push_str(&"  ".repeat(level));
        i.pretty_print(heap, collector);
        collector.push('\n');
      }
      Instruction::IfElse { condition, s1, s2 } => {
        collector.push_str(&"  ".repeat(level));
        collector.push_str("(if ");
        condition.pretty_print(heap, collector);
        collector.push_str(" (then\n");
        for s in s1 {
          s.print_to_collector(heap, collector, level + 1)
        }
        if !s2.is_empty() {
          collector.push_str(&"  ".repeat(level));
          collector.push_str(") (else\n");
          for s in s2 {
            s.print_to_collector(heap, collector, level + 1)
          }
        }
        collector.push_str(&"  ".repeat(level));
        collector.push_str("))\n");
      }
      Instruction::UnconditionalJump(label) => {
        collector.push_str(&"  ".repeat(level));
        collector.push_str("(br $");
        collector.push_str(label.as_str(heap));
        collector.push_str(")\n");
      }
      Instruction::Loop { continue_label, exit_label, instructions } => {
        collector.push_str(&"  ".repeat(level));
        collector.push_str("(loop $");
        collector.push_str(continue_label.as_str(heap));
        collector.push('\n');
        collector.push_str(&"  ".repeat(level + 1));
        collector.push_str("(block $");
        collector.push_str(exit_label.as_str(heap));
        collector.push('\n');
        for s in instructions {
          s.print_to_collector(heap, collector, level + 2)
        }
        collector.push_str(&"  ".repeat(level + 1));
        collector.push_str(")\n");
        collector.push_str(&"  ".repeat(level));
        collector.push_str(")\n");
      }
    }
  }
}

pub(crate) fn function_type_string(count: usize) -> String {
  if count == 0 {
    "none_=>_i32".to_string()
  } else {
    format!("{}=>_i32", "i32_".repeat(count))
  }
}

pub(crate) struct Function {
  pub(crate) name: PStr,
  pub(crate) parameters: Vec<PStr>,
  pub(crate) local_variables: Vec<PStr>,
  pub(crate) instructions: Vec<Instruction>,
}

pub(crate) struct GlobalData {
  pub(crate) constant_pointer: usize,
  pub(crate) ints: Vec<i32>,
}

pub(crate) struct Module {
  pub(crate) function_type_parameter_counts: Vec<usize>,
  pub(crate) global_variables: Vec<GlobalData>,
  pub(crate) exported_functions: Vec<PStr>,
  pub(crate) functions: Vec<Function>,
}

impl Module {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    let mut collector = String::new();
    for count in &self.function_type_parameter_counts {
      let type_string = function_type_string(*count);
      if *count == 0 {
        collector.push_str(&format!("(type ${type_string} (func (result i32)))\n"));
      } else {
        collector.push_str(&format!(
          "(type ${} (func (param{}) (result i32)))\n",
          type_string,
          " i32".repeat(*count)
        ));
      }
    }
    for GlobalData { constant_pointer, ints } in &self.global_variables {
      collector.push_str(&format!(
        "(data (i32.const {}) \"{}\")\n",
        constant_pointer,
        int_vec_to_data_string(ints)
      ));
    }
    collector.push_str(&format!("(table $0 {} funcref)\n", self.functions.len()));
    collector.push_str(&format!(
      "(elem $0 (i32.const 0) {})\n",
      self.functions.iter().map(|it| format!("${}", it.name.as_str(heap))).join(" ")
    ));
    for Function { name, parameters, local_variables, instructions } in &self.functions {
      collector.push_str(&format!(
        "(func ${} {} (result i32)\n",
        name.as_str(heap),
        parameters.iter().map(|it| format!("(param ${} i32)", it.as_str(heap))).join(" ")
      ));
      for v in local_variables {
        collector.push_str("  (local $");
        collector.push_str(v.as_str(heap));
        collector.push_str(" i32)\n");
      }
      for i in instructions {
        i.print_to_collector(heap, &mut collector, 1);
      }
      collector.push_str(")\n");
    }
    for f in &self.exported_functions {
      collector.push_str(&format!("(export \"{}\" (func ${}))\n", f.as_str(heap), f.as_str(heap)));
    }
    collector
  }
}
