use itertools::Itertools;
use samlang_ast::{hir, lir, mir, wasm};
use samlang_heap::{Heap, PStr};
use std::collections::{BTreeSet, HashMap};

#[derive(Clone)]
struct LoopContext {
  break_collector: Option<PStr>,
  exit_label: wasm::LabelId,
}

struct LoweringManager<'a> {
  label_id: u32,
  loop_cx: Option<LoopContext>,
  local_variables: BTreeSet<PStr>,
  global_variables_to_pointer_mapping: &'a HashMap<PStr, usize>,
  function_index_mapping: &'a HashMap<mir::FunctionName, usize>,
}

impl<'a> LoweringManager<'a> {
  fn lower_fn(
    global_variables_to_pointer_mapping: &'a HashMap<PStr, usize>,
    function_index_mapping: &'a HashMap<mir::FunctionName, usize>,
    function: &lir::Function,
  ) -> wasm::Function {
    let mut instance = LoweringManager {
      label_id: 0,
      loop_cx: None,
      local_variables: BTreeSet::new(),
      global_variables_to_pointer_mapping,
      function_index_mapping,
    };
    let mut instructions =
      function.body.iter().flat_map(|it| instance.lower_stmt(it)).collect_vec();
    instructions.push(wasm::Instruction::Inline(instance.lower_expr(&function.return_value)));
    for n in &function.parameters {
      instance.local_variables.remove(n);
    }
    wasm::Function {
      name: function.name,
      parameters: function.parameters.clone(),
      local_variables: instance.local_variables.into_iter().collect_vec(),
      instructions,
    }
  }

  fn lower_stmt(&mut self, s: &lir::Statement) -> Vec<wasm::Instruction> {
    match s {
      lir::Statement::IsPointer { name, pointer_type: _, operand } => {
        let operand1 = Box::new(self.lower_expr(operand));
        let operand2 = Box::new(self.lower_expr(operand));
        vec![wasm::Instruction::Inline(self.set(
          name,
          // invert the previous check, is a pointer
          wasm::InlineInstruction::Binary(
            // (i < 1024) || (i & 1) -> not a pointer
            Box::new(wasm::InlineInstruction::Binary(
              // i < 1024 (small int is not a pointer)
              Box::new(wasm::InlineInstruction::Binary(
                operand1,
                hir::BinaryOperator::LT,
                Box::new(wasm::InlineInstruction::Const(1024)),
              )),
              hir::BinaryOperator::LOR,
              // i & 1 (LSB == 1 is not a pointer)
              Box::new(wasm::InlineInstruction::Binary(
                operand2,
                hir::BinaryOperator::LAND,
                Box::new(wasm::InlineInstruction::Const(1)),
              )),
            )),
            hir::BinaryOperator::XOR,
            Box::new(wasm::InlineInstruction::Const(1)),
          ),
        ))]
      }
      lir::Statement::Not { name, operand } => {
        let operand = Box::new(self.lower_expr(operand));
        vec![wasm::Instruction::Inline(self.set(
          name,
          wasm::InlineInstruction::Binary(
            operand,
            hir::BinaryOperator::XOR,
            Box::new(wasm::InlineInstruction::Const(1)),
          ),
        ))]
      }
      lir::Statement::Binary { name, operator, e1, e2 } => {
        let i1 = Box::new(self.lower_expr(e1));
        let i2 = Box::new(self.lower_expr(e2));
        vec![wasm::Instruction::Inline(
          self.set(name, wasm::InlineInstruction::Binary(i1, *operator, i2)),
        )]
      }
      lir::Statement::IndexedAccess { name, type_: _, pointer_expression, index } => {
        let pointer = Box::new(self.lower_expr(pointer_expression));
        vec![wasm::Instruction::Inline(
          self.set(name, wasm::InlineInstruction::Load { index: *index, pointer }),
        )]
      }
      lir::Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        let pointer = Box::new(self.lower_expr(pointer_expression));
        let assigned = Box::new(self.lower_expr(assigned_expression));
        vec![wasm::Instruction::Inline(wasm::InlineInstruction::Store {
          index: *index,
          pointer,
          assigned,
        })]
      }
      lir::Statement::Call { callee, arguments, return_type: _, return_collector } => {
        let argument_instructions = arguments.iter().map(|it| self.lower_expr(it)).collect_vec();
        let call = if let lir::Expression::FnName(name, _) = callee {
          wasm::InlineInstruction::DirectCall(*name, argument_instructions)
        } else {
          wasm::InlineInstruction::IndirectCall {
            function_index: Box::new(self.lower_expr(callee)),
            fn_arg_count: argument_instructions.len(),
            arguments: argument_instructions,
          }
        };
        let stmt = if let Some(c) = return_collector {
          self.set(c, call)
        } else {
          wasm::InlineInstruction::Drop(Box::new(call))
        };
        vec![wasm::Instruction::Inline(stmt)]
      }
      lir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        let condition = self.lower_expr(condition);
        let mut s1 = s1.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        let mut s2 = s2.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        for (n, _, e1, e2) in final_assignments {
          let e1 = self.lower_expr(e1);
          let e2 = self.lower_expr(e2);
          s1.push(wasm::Instruction::Inline(self.set(n, e1)));
          s2.push(wasm::Instruction::Inline(self.set(n, e2)));
        }
        if s1.is_empty() {
          if s2.is_empty() {
            vec![]
          } else {
            vec![wasm::Instruction::IfElse {
              condition: wasm::InlineInstruction::Binary(
                Box::new(condition),
                hir::BinaryOperator::XOR,
                Box::new(wasm::InlineInstruction::Const(1)),
              ),
              s1: s2,
              s2: vec![],
            }]
          }
        } else {
          vec![wasm::Instruction::IfElse { condition, s1, s2 }]
        }
      }
      lir::Statement::SingleIf { condition, invert_condition, statements } => {
        let mut condition = self.lower_expr(condition);
        if *invert_condition {
          condition = wasm::InlineInstruction::Binary(
            Box::new(condition),
            hir::BinaryOperator::XOR,
            Box::new(wasm::InlineInstruction::Const(1)),
          );
        }
        vec![wasm::Instruction::IfElse {
          condition,
          s1: statements.iter().flat_map(|it| self.lower_stmt(it)).collect(),
          s2: vec![],
        }]
      }
      lir::Statement::Break(e) => {
        let LoopContext { break_collector, exit_label } = self.loop_cx.as_ref().unwrap();
        let exit_label = *exit_label;
        if let Some(c) = *break_collector {
          let e = self.lower_expr(e);
          vec![
            wasm::Instruction::Inline(self.set(&c, e)),
            wasm::Instruction::UnconditionalJump(exit_label),
          ]
        } else {
          vec![wasm::Instruction::UnconditionalJump(exit_label)]
        }
      }
      lir::Statement::While { loop_variables, statements, break_collector } => {
        let saved_current_loop_cx = self.loop_cx.clone();
        let continue_label = self.alloc_label_with_annot();
        let exit_label = self.alloc_label_with_annot();
        self.loop_cx = Some(LoopContext {
          break_collector: if let Some((n, _)) = break_collector { Some(*n) } else { None },
          exit_label,
        });
        let mut instructions = loop_variables
          .iter()
          .map(|it| {
            let e = self.lower_expr(&it.initial_value);
            wasm::Instruction::Inline(self.set(&it.name, e))
          })
          .collect_vec();
        let mut loop_instructions =
          statements.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        for v in loop_variables {
          let e = self.lower_expr(&v.loop_value);
          loop_instructions.push(wasm::Instruction::Inline(self.set(&v.name, e)));
        }
        loop_instructions.push(wasm::Instruction::UnconditionalJump(continue_label));
        instructions.push(wasm::Instruction::Loop {
          continue_label,
          exit_label,
          instructions: loop_instructions,
        });
        self.loop_cx = saved_current_loop_cx;
        instructions
      }
      lir::Statement::Cast { name, type_: _, assigned_expression }
      | lir::Statement::LateInitAssignment { name, assigned_expression } => {
        let assigned = self.lower_expr(assigned_expression);
        vec![wasm::Instruction::Inline(self.set(name, assigned))]
      }
      lir::Statement::LateInitDeclaration { name: _, type_: _ } => {
        vec![]
      }
      lir::Statement::StructInit { struct_variable_name, type_: _, expression_list } => {
        let mut instructions = vec![wasm::Instruction::Inline(self.set(
          struct_variable_name,
          wasm::InlineInstruction::DirectCall(
            mir::FunctionName::BUILTIN_MALLOC,
            vec![wasm::InlineInstruction::Const(i32::try_from(expression_list.len() * 4).unwrap())],
          ),
        ))];
        for (index, e) in expression_list.iter().enumerate() {
          let pointer = Box::new(self.get(struct_variable_name));
          let assigned = Box::new(self.lower_expr(e));
          instructions.push(wasm::Instruction::Inline(wasm::InlineInstruction::Store {
            index,
            pointer,
            assigned,
          }));
        }
        instructions
      }
    }
  }

  fn lower_expr(&mut self, e: &lir::Expression) -> wasm::InlineInstruction {
    match e {
      lir::Expression::Int32Literal(v) | lir::Expression::Int31Literal(v) => {
        wasm::InlineInstruction::Const(*v)
      }
      lir::Expression::Variable(n, _) => self.get(n),
      lir::Expression::StringName(n) => {
        let index = self.global_variables_to_pointer_mapping.get(n).unwrap();
        wasm::InlineInstruction::Const(i32::try_from(*index).unwrap())
      }
      lir::Expression::FnName(n, _) => {
        let index = self.function_index_mapping.get(n).unwrap();
        wasm::InlineInstruction::Const(i32::try_from(*index).unwrap())
      }
    }
  }

  fn alloc_label_with_annot(&mut self) -> wasm::LabelId {
    let label = wasm::LabelId(self.label_id);
    self.label_id += 1;
    label
  }

  fn get(&mut self, n: &PStr) -> wasm::InlineInstruction {
    self.local_variables.insert(*n);
    wasm::InlineInstruction::LocalGet(*n)
  }

  fn set(&mut self, n: &PStr, v: wasm::InlineInstruction) -> wasm::InlineInstruction {
    self.local_variables.insert(*n);
    wasm::InlineInstruction::LocalSet(*n, Box::new(v))
  }
}

pub(super) fn compile_lir_to_wasm(heap: &Heap, sources: &lir::Sources) -> wasm::Module {
  let mut data_start: usize = 4096;
  let mut global_variables_to_pointer_mapping = HashMap::new();
  let mut function_index_mapping = HashMap::new();
  let mut global_variables = vec![];
  for hir::GlobalString(content) in &sources.global_variables {
    let content_str = content.as_str(heap);
    let mut bytes = vec![0, 0, 0, 0];
    bytes.extend_from_slice(&(content_str.len() as u32).to_le_bytes());
    bytes.extend_from_slice(content_str.as_bytes());
    let global_variable = wasm::GlobalData { constant_pointer: data_start, bytes };
    global_variables_to_pointer_mapping.insert(*content, data_start);
    data_start += content_str.len() + 8;
    let pad = data_start % 8;
    if pad != 0 {
      data_start += 8 - pad;
    }
    global_variables.push(global_variable);
  }
  for (i, f) in sources.functions.iter().enumerate() {
    function_index_mapping.insert(f.name, i);
  }
  wasm::Module {
    function_type_parameter_counts: sources
      .functions
      .iter()
      .map(|it| it.parameters.len())
      .collect::<BTreeSet<_>>()
      .into_iter()
      .collect_vec(),
    global_variables,
    exported_functions: sources.main_function_names.clone(),
    functions: sources
      .functions
      .iter()
      .map(|f| {
        LoweringManager::lower_fn(&global_variables_to_pointer_mapping, &function_index_mapping, f)
      })
      .collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::{BinaryOperator, GlobalString},
    lir::{Expression, Function, GenenalLoopVariable, Sources, Statement, Type, INT_32_TYPE, ZERO},
    mir::{self, TypeNameId},
    wasm,
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    assert!(super::LoopContext { break_collector: None, exit_label: wasm::LabelId(1) }
      .clone()
      .break_collector
      .is_none());
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let sources = Sources {
      symbol_table: mir::SymbolTable::new(),
      global_variables: vec![
        GlobalString(heap.alloc_str_for_test("FOO")),
        GlobalString(heap.alloc_str_for_test("BAR")),
      ],
      type_definitions: vec![],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![heap.alloc_str_for_test("bar")],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![
          Statement::IfElse { condition: ZERO, s1: vec![], s2: vec![], final_assignments: vec![] },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![Statement::Cast {
              name: PStr::LOWER_C,
              type_: INT_32_TYPE,
              assigned_expression: ZERO,
            }],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: PStr::LOWER_I,
                type_: INT_32_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![
                Statement::Cast {
                  name: PStr::LOWER_C,
                  type_: INT_32_TYPE,
                  assigned_expression: ZERO,
                },
                Statement::LateInitDeclaration { name: PStr::LOWER_C, type_: INT_32_TYPE },
                Statement::LateInitAssignment { name: PStr::LOWER_C, assigned_expression: ZERO },
              ],
              break_collector: None,
            }],
            s2: vec![
              Statement::While {
                loop_variables: vec![],
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: false,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: Some((PStr::LOWER_B, INT_32_TYPE)),
              },
              Statement::While {
                loop_variables: vec![],
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: true,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: None,
              },
            ],
            final_assignments: vec![(
              PStr::LOWER_F,
              INT_32_TYPE,
              Expression::StringName(heap.alloc_str_for_test("FOO")),
              Expression::FnName(
                mir::FunctionName::new_for_test(PStr::MAIN_FN),
                Type::new_fn(vec![], INT_32_TYPE),
              ),
            )],
          },
          Statement::Not { name: heap.alloc_str_for_test("un1"), operand: ZERO },
          Statement::IsPointer {
            name: heap.alloc_str_for_test("un2"),
            pointer_type: TypeNameId::STR,
            operand: ZERO,
          },
          Statement::binary(
            heap.alloc_str_for_test("bin"),
            BinaryOperator::PLUS,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::new_for_test(PStr::MAIN_FN),
              Type::new_fn(vec![], INT_32_TYPE),
            ),
            arguments: vec![ZERO],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
          Statement::Call {
            callee: Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            arguments: vec![ZERO],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("rc")),
          },
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("v"),
            type_: INT_32_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::IndexedAssign {
            assigned_expression: Expression::Variable(heap.alloc_str_for_test("v"), INT_32_TYPE),
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("s"),
            type_: INT_32_TYPE,
            expression_list: vec![
              ZERO,
              Expression::Variable(heap.alloc_str_for_test("v"), INT_32_TYPE),
            ],
          },
        ],
        return_value: ZERO,
      }],
    };
    let actual =
      super::compile_lir_to_wasm(heap, &sources).pretty_print(heap, &sources.symbol_table);
    let expected = r#"(type $i32_=>_i32 (func (param i32) (result i32)))
(data (i32.const 4096) "\00\00\00\00\03\00\00\00FOO")
(data (i32.const 4112) "\00\00\00\00\03\00\00\00BAR")
(table $0 1 funcref)
(elem $0 (i32.const 0) $__$main)
(func $__$main (param $bar i32) (result i32)
  (local $b i32)
  (local $bin i32)
  (local $c i32)
  (local $f i32)
  (local $i i32)
  (local $rc i32)
  (local $s i32)
  (local $un1 i32)
  (local $un2 i32)
  (local $v i32)
  (if (i32.xor (i32.const 0) (i32.const 1)) (then
    (local.set $c (i32.const 0))
  ))
  (if (i32.const 0) (then
    (local.set $i (i32.const 0))
    (loop $l0
      (block $l1
        (local.set $c (i32.const 0))
        (local.set $c (i32.const 0))
        (local.set $i (i32.const 0))
        (br $l0)
      )
    )
    (local.set $f (i32.const 4096))
  ) (else
    (loop $l2
      (block $l3
        (if (i32.const 0) (then
          (local.set $b (i32.const 0))
          (br $l3)
        ))
        (br $l2)
      )
    )
    (loop $l4
      (block $l5
        (if (i32.xor (i32.const 0) (i32.const 1)) (then
          (br $l5)
        ))
        (br $l4)
      )
    )
    (local.set $f (i32.const 0))
  ))
  (local.set $un1 (i32.xor (i32.const 0) (i32.const 1)))
  (local.set $un2 (i32.xor (i32.or (i32.lt_s (i32.const 0) (i32.const 1024)) (i32.and (i32.const 0) (i32.const 1))) (i32.const 1)))
  (local.set $bin (i32.add (local.get $f) (i32.const 0)))
  (drop (call $__$main (i32.const 0)))
  (local.set $rc (call_indirect $0 (type $i32_=>_i32) (i32.const 0) (local.get $f)))
  (local.set $v (i32.load offset=12 (i32.const 0)))
  (i32.store offset=12 (i32.const 0) (local.get $v))
  (local.set $s (call $__$malloc (i32.const 8)))
  (i32.store (local.get $s) (i32.const 0))
  (i32.store offset=4 (local.get $s) (local.get $v))
  (i32.const 0)
)
(export "__$main" (func $__$main))
"#;
    assert_eq!(expected, actual);
  }
}
