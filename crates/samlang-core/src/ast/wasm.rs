use super::hir;
use crate::common::{int_vec_to_data_string, Str};
use itertools::Itertools;

pub(crate) enum InlineInstruction {
  Const(i32),
  Drop(Box<InlineInstruction>),
  LocalGet(Str),
  LocalSet(Str, Box<InlineInstruction>),
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
  DirectCall(Str, Vec<InlineInstruction>),
  IndirectCall {
    function_index: Box<InlineInstruction>,
    type_string: Str,
    arguments: Vec<InlineInstruction>,
  },
}

impl InlineInstruction {
  fn pretty_print(&self) -> String {
    match self {
      InlineInstruction::Const(i) => format!("(i32.const {})", i),
      InlineInstruction::Drop(v) => format!("(drop {})", v.pretty_print()),
      InlineInstruction::LocalGet(name) => format!("(local.get ${})", name),
      InlineInstruction::LocalSet(name, assigned) => {
        format!("(local.set ${} {})", name, assigned.pretty_print())
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
        format!("(i32.{} {} {})", op_s, v1.pretty_print(), v2.pretty_print())
      }
      InlineInstruction::Load { index, pointer } => {
        if *index == 0 {
          format!("(i32.load {})", pointer.pretty_print())
        } else {
          format!("(i32.load offset={} {})", index * 4, pointer.pretty_print())
        }
      }
      InlineInstruction::Store { index, pointer, assigned } => {
        if *index == 0 {
          format!("(i32.store {} {})", pointer.pretty_print(), assigned.pretty_print())
        } else {
          format!(
            "(i32.store offset={} {} {})",
            index * 4,
            pointer.pretty_print(),
            assigned.pretty_print()
          )
        }
      }
      InlineInstruction::DirectCall(name, arguments) => {
        format!(
          "(call ${} {})",
          name,
          arguments.iter().map(InlineInstruction::pretty_print).join(" ")
        )
      }
      InlineInstruction::IndirectCall { function_index, type_string, arguments } => {
        format!(
          "(call_indirect $0 (type ${}) {} {})",
          type_string,
          arguments.iter().map(InlineInstruction::pretty_print).join(" "),
          function_index.pretty_print()
        )
      }
    }
  }
}

pub(crate) enum Instruction {
  Inline(InlineInstruction),
  IfElse { condition: InlineInstruction, s1: Vec<Instruction>, s2: Vec<Instruction> },
  UnconditionalJump(Str),
  Loop { continue_label: Str, exit_label: Str, instructions: Vec<Instruction> },
}

impl Instruction {
  fn print_to_collector(&self, collector: &mut Vec<String>, level: usize) {
    match self {
      Instruction::Inline(i) => {
        collector.push(format!("{}{}\n", "  ".repeat(level), i.pretty_print()))
      }
      Instruction::IfElse { condition, s1, s2 } => {
        collector.push(format!("{}(if {} (then\n", "  ".repeat(level), condition.pretty_print()));
        for s in s1 {
          s.print_to_collector(collector, level + 1)
        }
        if !s2.is_empty() {
          collector.push(format!("{}) (else\n", "  ".repeat(level)));
          for s in s2 {
            s.print_to_collector(collector, level + 1)
          }
        }
        collector.push(format!("{}))\n", "  ".repeat(level)));
      }
      Instruction::UnconditionalJump(label) => {
        collector.push(format!("{}(br ${})\n", "  ".repeat(level), label))
      }
      Instruction::Loop { continue_label, exit_label, instructions } => {
        collector.push(format!("{}(loop ${}\n", "  ".repeat(level), continue_label));
        collector.push(format!("{}(block ${}\n", "  ".repeat(level + 1), exit_label));
        for s in instructions {
          s.print_to_collector(collector, level + 2)
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
  pub(crate) name: Str,
  pub(crate) parameters: Vec<Str>,
  pub(crate) local_variables: Vec<Str>,
  pub(crate) instructions: Vec<Instruction>,
}

pub(crate) struct GlobalData {
  pub(crate) constant_pointer: usize,
  pub(crate) ints: Vec<i32>,
}

pub(crate) struct Module {
  pub(crate) function_type_parameter_counts: Vec<usize>,
  pub(crate) global_variables: Vec<GlobalData>,
  pub(crate) exported_functions: Vec<Str>,
  pub(crate) functions: Vec<Function>,
}

impl Module {
  pub(crate) fn pretty_print(&self) -> String {
    let mut collector = vec![];
    for count in &self.function_type_parameter_counts {
      let type_string = function_type_string(*count);
      if *count == 0 {
        collector.push(format!("(type ${} (func (result i32)))\n", type_string));
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
      self.functions.iter().map(|it| format!("${}", it.name)).join(" ")
    ));
    for Function { name, parameters, local_variables, instructions } in &self.functions {
      collector.push(format!(
        "(func ${} {} (result i32)\n",
        name,
        parameters.iter().map(|it| format!("(param ${} i32)", it)).join(" ")
      ));
      for v in local_variables {
        collector.push(format!("  (local ${} i32)\n", v));
      }
      for i in instructions {
        i.print_to_collector(&mut collector, 1);
      }
      collector.push(")\n".to_string());
    }
    for f in &self.exported_functions {
      collector.push(format!("(export \"{}\" (func ${}))\n", f, f));
    }
    collector.join("")
  }
}