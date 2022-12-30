#[cfg(test)]
mod tests {
  use super::super::wasm::*;
  use crate::{ast::hir::Operator, common::rcs};
  use pretty_assertions::assert_eq;

  #[test]
  fn pretty_print_test() {
    let module = Module {
      function_type_parameter_counts: vec![0, 1, 2, 3],
      global_variables: vec![
        GlobalData { constant_pointer: 1024, ints: vec![0, 0] },
        GlobalData { constant_pointer: 323, ints: vec![3, 2] },
      ],
      exported_functions: vec![rcs("main")],
      functions: vec![Function {
        name: rcs("main"),
        parameters: vec![rcs("a"), rcs("b")],
        local_variables: vec![rcs("c"), rcs("d")],
        instructions: vec![
          Instruction::IfElse {
            condition: InlineInstruction::Const(1),
            s1: vec![
              Instruction::Inline(InlineInstruction::Const(1)),
              Instruction::Inline(InlineInstruction::Drop(Box::new(InlineInstruction::Const(0)))),
              Instruction::Inline(InlineInstruction::LocalGet(rcs("a"))),
              Instruction::Inline(InlineInstruction::LocalSet(
                rcs("b"),
                Box::new(InlineInstruction::Const(0)),
              )),
            ],
            s2: vec![
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::PLUS,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::MINUS,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::MUL,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::DIV,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::MOD,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::XOR,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::LT,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::LE,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::GT,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::GE,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::EQ,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::NE,
                Box::new(InlineInstruction::Const(0)),
              )),
            ],
          },
          Instruction::UnconditionalJump(rcs("aa")),
          Instruction::Loop {
            continue_label: rcs("cl"),
            exit_label: rcs("el"),
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
                rcs("main"),
                vec![InlineInstruction::Const(0)],
              )),
              Instruction::Inline(InlineInstruction::IndirectCall {
                function_index: Box::new(InlineInstruction::Const(0)),
                type_string: rcs("dff"),
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
(data (i32.const 1024) "\00\00\00\00\00\00\00\00")
(data (i32.const 323) "\03\00\00\00\02\00\00\00")
(table $0 1 funcref)
(elem $0 (i32.const 0) $main)
(func $main (param $a i32) (param $b i32) (result i32)
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
    (i32.xor (i32.const 0) (i32.const 0))
    (i32.lt_s (i32.const 0) (i32.const 0))
    (i32.le_s (i32.const 0) (i32.const 0))
    (i32.gt_s (i32.const 0) (i32.const 0))
    (i32.ge_s (i32.const 0) (i32.const 0))
    (i32.eq (i32.const 0) (i32.const 0))
    (i32.ne (i32.const 0) (i32.const 0))
  ))
  (br $aa)
  (loop $cl
    (block $el
      (i32.load (i32.const 0))
      (i32.load offset=12 (i32.const 0))
      (i32.store (i32.const 0) (i32.const 0))
      (i32.store offset=12 (i32.const 0) (i32.const 0))
      (call $main (i32.const 0))
      (call_indirect $0 (type $dff) (i32.const 0) (i32.const 0))
    )
  )
  (if (i32.const 1) (then
    (i32.const 1)
  ))
)
(export "main" (func $main))
"#;
    assert_eq!(expected, module.pretty_print());
  }
}
