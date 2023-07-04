#[cfg(test)]
mod tests {
  use super::super::wasm::*;
  use crate::{
    ast::hir::Operator,
    ast::mir::{FunctionName, SymbolTable},
    common::{well_known_pstrs, Heap},
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn pretty_print_test() {
    let heap = &mut Heap::new();

    let module = Module {
      function_type_parameter_counts: vec![0, 1, 2, 3],
      global_variables: vec![
        GlobalData { constant_pointer: 1024, bytes: vec![0, 0] },
        GlobalData { constant_pointer: 323, bytes: vec![3, 2] },
      ],
      exported_functions: vec![FunctionName::new_for_test(well_known_pstrs::MAIN_FN)],
      functions: vec![Function {
        name: FunctionName::new_for_test(well_known_pstrs::MAIN_FN),
        parameters: vec![well_known_pstrs::LOWER_A, well_known_pstrs::LOWER_B],
        local_variables: vec![well_known_pstrs::LOWER_C, well_known_pstrs::LOWER_D],
        instructions: vec![
          Instruction::IfElse {
            condition: InlineInstruction::Const(1),
            s1: vec![
              Instruction::Inline(InlineInstruction::Const(1)),
              Instruction::Inline(InlineInstruction::Drop(Box::new(InlineInstruction::Const(0)))),
              Instruction::Inline(InlineInstruction::LocalGet(well_known_pstrs::LOWER_A)),
              Instruction::Inline(InlineInstruction::LocalSet(
                well_known_pstrs::LOWER_B,
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
                Operator::LAND,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::LOR,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::SHL,
                Box::new(InlineInstruction::Const(0)),
              )),
              Instruction::Inline(InlineInstruction::Binary(
                Box::new(InlineInstruction::Const(0)),
                Operator::SHR,
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
          Instruction::UnconditionalJump(heap.alloc_str_for_test("aa")),
          Instruction::Loop {
            continue_label: heap.alloc_str_for_test("cl"),
            exit_label: heap.alloc_str_for_test("el"),
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
                FunctionName::new_for_test(well_known_pstrs::MAIN_FN),
                vec![InlineInstruction::Const(0)],
              )),
              Instruction::Inline(InlineInstruction::IndirectCall {
                function_index: Box::new(InlineInstruction::Const(0)),
                type_string: Box::from("dff"),
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
  (br $aa)
  (loop $cl
    (block $el
      (i32.load (i32.const 0))
      (i32.load offset=12 (i32.const 0))
      (i32.store (i32.const 0) (i32.const 0))
      (i32.store offset=12 (i32.const 0) (i32.const 0))
      (call $__$main (i32.const 0))
      (call_indirect $0 (type $dff) (i32.const 0) (i32.const 0))
    )
  )
  (if (i32.const 1) (then
    (i32.const 1)
  ))
)
(export "__$main" (func $__$main))
"#;
    assert_eq!(expected, module.pretty_print(heap, &SymbolTable::new()));
  }
}
