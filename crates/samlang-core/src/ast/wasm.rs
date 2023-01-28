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
  fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      InlineInstruction::Const(i) => format!("(i32.const {i})"),
      InlineInstruction::Drop(v) => format!("(drop {})", v.pretty_print(heap)),
      InlineInstruction::LocalGet(name) => format!("(local.get ${})", name.as_str(heap)),
      InlineInstruction::LocalSet(name, assigned) => {
        format!("(local.set ${} {})", name.as_str(heap), assigned.pretty_print(heap))
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
        format!("(i32.{} {} {})", op_s, v1.pretty_print(heap), v2.pretty_print(heap))
      }
      InlineInstruction::Load { index, pointer } => {
        if *index == 0 {
          format!("(i32.load {})", pointer.pretty_print(heap))
        } else {
          format!("(i32.load offset={} {})", index * 4, pointer.pretty_print(heap))
        }
      }
      InlineInstruction::Store { index, pointer, assigned } => {
        if *index == 0 {
          format!("(i32.store {} {})", pointer.pretty_print(heap), assigned.pretty_print(heap))
        } else {
          format!(
            "(i32.store offset={} {} {})",
            index * 4,
            pointer.pretty_print(heap),
            assigned.pretty_print(heap)
          )
        }
      }
      InlineInstruction::DirectCall(name, arguments) => {
        format!(
          "(call ${} {})",
          name.as_str(heap),
          arguments.iter().map(|e| e.pretty_print(heap)).join(" ")
        )
      }
      InlineInstruction::IndirectCall { function_index, type_string, arguments } => {
        format!(
          "(call_indirect $0 (type ${}) {} {})",
          type_string.as_str(heap),
          arguments.iter().map(|e| e.pretty_print(heap)).join(" "),
          function_index.pretty_print(heap)
        )
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
  fn print_to_collector(&self, heap: &Heap, collector: &mut Vec<String>, level: usize) {
    match self {
      Instruction::Inline(i) => {
        collector.push(format!("{}{}\n", "  ".repeat(level), i.pretty_print(heap)))
      }
      Instruction::IfElse { condition, s1, s2 } => {
        collector.push(format!(
          "{}(if {} (then\n",
          "  ".repeat(level),
          condition.pretty_print(heap)
        ));
        for s in s1 {
          s.print_to_collector(heap, collector, level + 1)
        }
        if !s2.is_empty() {
          collector.push(format!("{}) (else\n", "  ".repeat(level)));
          for s in s2 {
            s.print_to_collector(heap, collector, level + 1)
          }
        }
        collector.push(format!("{}))\n", "  ".repeat(level)));
      }
      Instruction::UnconditionalJump(label) => {
        collector.push(format!("{}(br ${})\n", "  ".repeat(level), label.as_str(heap)))
      }
      Instruction::Loop { continue_label, exit_label, instructions } => {
        collector.push(format!("{}(loop ${}\n", "  ".repeat(level), continue_label.as_str(heap)));
        collector.push(format!("{}(block ${}\n", "  ".repeat(level + 1), exit_label.as_str(heap)));
        for s in instructions {
          s.print_to_collector(heap, collector, level + 2)
        }
        collector.push(format!("{})\n", "  ".repeat(level + 1)));
        collector.push(format!("{})\n", "  ".repeat(level)));
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
    let mut collector = vec![];
    for count in &self.function_type_parameter_counts {
      let type_string = function_type_string(*count);
      if *count == 0 {
        collector.push(format!("(type ${type_string} (func (result i32)))\n"));
      } else {
        collector.push(format!(
          "(type ${} (func (param{}) (result i32)))\n",
          type_string,
          " i32".repeat(*count)
        ));
      }
    }
    for GlobalData { constant_pointer, ints } in &self.global_variables {
      collector.push(format!(
        "(data (i32.const {}) \"{}\")\n",
        constant_pointer,
        int_vec_to_data_string(ints)
      ));
    }
    collector.push(format!("(table $0 {} funcref)\n", self.functions.len()));
    collector.push(format!(
      "(elem $0 (i32.const 0) {})\n",
      self.functions.iter().map(|it| format!("${}", it.name.as_str(heap))).join(" ")
    ));
    for Function { name, parameters, local_variables, instructions } in &self.functions {
      collector.push(format!(
        "(func ${} {} (result i32)\n",
        name.as_str(heap),
        parameters.iter().map(|it| format!("(param ${} i32)", it.as_str(heap))).join(" ")
      ));
      for v in local_variables {
        collector.push(format!("  (local ${} i32)\n", v.as_str(heap)));
      }
      for i in instructions {
        i.print_to_collector(heap, &mut collector, 1);
      }
      collector.push(")\n".to_string());
    }
    for f in &self.exported_functions {
      collector.push(format!("(export \"{}\" (func ${}))\n", f.as_str(heap), f.as_str(heap)));
    }
    collector.join("")
  }
}
