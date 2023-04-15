use crate::{
  ast::{common_names, hir, mir, wasm},
  common::{Heap, PStr},
};
use itertools::Itertools;
use std::collections::{BTreeSet, HashMap};

#[derive(Clone)]
struct LoopContext {
  break_collector: Option<PStr>,
  exit_label: PStr,
}

struct LoweringManager<'a> {
  heap: &'a mut Heap,
  label_id: i32,
  loop_cx: Option<LoopContext>,
  local_variables: BTreeSet<PStr>,
  global_variables_to_pointer_mapping: &'a HashMap<PStr, usize>,
  function_index_mapping: &'a HashMap<PStr, usize>,
}

impl<'a> LoweringManager<'a> {
  fn lower_fn(
    heap: &'a mut Heap,
    global_variables_to_pointer_mapping: &'a HashMap<PStr, usize>,
    function_index_mapping: &'a HashMap<PStr, usize>,
    function: &mir::Function,
  ) -> wasm::Function {
    let mut instance = LoweringManager {
      heap,
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

  fn lower_stmt(&mut self, s: &mir::Statement) -> Vec<wasm::Instruction> {
    match s {
      mir::Statement::Binary { name, type_: _, operator, e1, e2 } => {
        let i1 = Box::new(self.lower_expr(e1));
        let i2 = Box::new(self.lower_expr(e2));
        vec![wasm::Instruction::Inline(
          self.set(name, wasm::InlineInstruction::Binary(i1, *operator, i2)),
        )]
      }
      mir::Statement::IndexedAccess { name, type_: _, pointer_expression, index } => {
        let pointer = Box::new(self.lower_expr(pointer_expression));
        vec![wasm::Instruction::Inline(
          self.set(name, wasm::InlineInstruction::Load { index: *index, pointer }),
        )]
      }
      mir::Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
        let pointer = Box::new(self.lower_expr(pointer_expression));
        let assigned = Box::new(self.lower_expr(assigned_expression));
        vec![wasm::Instruction::Inline(wasm::InlineInstruction::Store {
          index: *index,
          pointer,
          assigned,
        })]
      }
      mir::Statement::Call { callee, arguments, return_type: _, return_collector } => {
        let argument_instructions = arguments.iter().map(|it| self.lower_expr(it)).collect_vec();
        let call = if let mir::Expression::Name(name, _) = callee {
          wasm::InlineInstruction::DirectCall(*name, argument_instructions)
        } else {
          wasm::InlineInstruction::IndirectCall {
            function_index: Box::new(self.lower_expr(callee)),
            type_string: self
              .heap
              .alloc_string(wasm::function_type_string(argument_instructions.len())),
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
      mir::Statement::IfElse { condition, s1, s2, final_assignments } => {
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
                hir::Operator::XOR,
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
      mir::Statement::SingleIf { condition, invert_condition, statements } => {
        let mut condition = self.lower_expr(condition);
        if *invert_condition {
          condition = wasm::InlineInstruction::Binary(
            Box::new(condition),
            hir::Operator::XOR,
            Box::new(wasm::InlineInstruction::Const(1)),
          );
        }
        vec![wasm::Instruction::IfElse {
          condition,
          s1: statements.iter().flat_map(|it| self.lower_stmt(it)).collect(),
          s2: vec![],
        }]
      }
      mir::Statement::Break(e) => {
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
      mir::Statement::While { loop_variables, statements, break_collector } => {
        let saved_current_loop_cx = self.loop_cx.clone();
        let continue_label = self.alloc_label_with_annot("loop_continue");
        let exit_label = self.alloc_label_with_annot("loop_exit");
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
      mir::Statement::Cast { name, type_: _, assigned_expression } => {
        let assigned = self.lower_expr(assigned_expression);
        vec![wasm::Instruction::Inline(self.set(name, assigned))]
      }
      mir::Statement::StructInit { struct_variable_name, type_: _, expression_list } => {
        let fn_name = self.heap.alloc_string(common_names::encoded_fn_name_malloc());
        let mut instructions = vec![wasm::Instruction::Inline(self.set(
          struct_variable_name,
          wasm::InlineInstruction::DirectCall(
            fn_name,
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

  fn lower_expr(&mut self, e: &mir::Expression) -> wasm::InlineInstruction {
    match e {
      mir::Expression::IntLiteral(v, _) => wasm::InlineInstruction::Const(*v),
      mir::Expression::Variable(n, _) => self.get(n),
      mir::Expression::Name(n, t) => {
        let index = if let mir::Type::Fn(_) = t {
          self.function_index_mapping.get(n)
        } else {
          self.global_variables_to_pointer_mapping.get(n)
        };
        wasm::InlineInstruction::Const(i32::try_from(*(index.unwrap())).unwrap())
      }
    }
  }

  fn alloc_label_with_annot(&mut self, annot: &str) -> PStr {
    let label = self.heap.alloc_string(format!("l{}_{}", self.label_id, annot));
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

pub(super) fn compile_mir_to_wasm(heap: &mut Heap, sources: &mir::Sources) -> wasm::Module {
  let mut data_start: usize = 4096;
  let mut global_variables_to_pointer_mapping = HashMap::new();
  let mut function_index_mapping = HashMap::new();
  let mut global_variables = vec![];
  for hir::GlobalVariable { name, content } in &sources.global_variables {
    let content_str = content.as_str(heap);
    let mut bytes = vec![0, 0, 0, 0];
    bytes.extend_from_slice(&(content_str.len() as u32).to_le_bytes());
    bytes.extend_from_slice(content_str.as_bytes());
    let global_variable = wasm::GlobalData { constant_pointer: data_start, bytes };
    global_variables_to_pointer_mapping.insert(*name, data_start);
    data_start += content_str.len() + 8;
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
        LoweringManager::lower_fn(
          heap,
          &global_variables_to_pointer_mapping,
          &function_index_mapping,
          f,
        )
      })
      .collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      hir::{GlobalVariable, Operator},
      mir::{
        Expression, Function, GenenalLoopVariable, Sources, Statement, Type, FALSE, INT_TYPE, ZERO,
      },
    },
    common::Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(super::LoopContext { break_collector: None, exit_label: heap.alloc_str_for_test("") }
      .clone()
      .break_collector
      .is_none());
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let sources = Sources {
      global_variables: vec![
        GlobalVariable {
          name: heap.alloc_str_for_test("FOO"),
          content: heap.alloc_str_for_test("foo"),
        },
        GlobalVariable {
          name: heap.alloc_str_for_test("BAR"),
          content: heap.alloc_str_for_test("bar"),
        },
      ],
      type_definitions: vec![],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![heap.alloc_str_for_test("bar")],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![
          Statement::IfElse { condition: FALSE, s1: vec![], s2: vec![], final_assignments: vec![] },
          Statement::IfElse {
            condition: FALSE,
            s1: vec![],
            s2: vec![Statement::Cast {
              name: heap.alloc_str_for_test("c"),
              type_: INT_TYPE,
              assigned_expression: ZERO,
            }],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: FALSE,
            s1: vec![Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: heap.alloc_str_for_test("i"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![Statement::Cast {
                name: heap.alloc_str_for_test("c"),
                type_: INT_TYPE,
                assigned_expression: ZERO,
              }],
              break_collector: None,
            }],
            s2: vec![
              Statement::While {
                loop_variables: vec![],
                statements: vec![Statement::SingleIf {
                  condition: FALSE,
                  invert_condition: false,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: Some((heap.alloc_str_for_test("b"), INT_TYPE)),
              },
              Statement::While {
                loop_variables: vec![],
                statements: vec![Statement::SingleIf {
                  condition: FALSE,
                  invert_condition: true,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: None,
              },
            ],
            final_assignments: vec![(
              heap.alloc_str_for_test("f"),
              INT_TYPE,
              Expression::Name(heap.alloc_str_for_test("FOO"), INT_TYPE),
              Expression::Name(heap.alloc_str_for_test("main"), Type::new_fn(vec![], INT_TYPE)),
            )],
          },
          Statement::binary(
            heap.alloc_str_for_test("bin"),
            Operator::PLUS,
            Expression::Variable(heap.alloc_str_for_test("f"), INT_TYPE),
            ZERO,
          ),
          Statement::Call {
            callee: Expression::Name(
              heap.alloc_str_for_test("main"),
              Type::new_fn(vec![], INT_TYPE),
            ),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::Call {
            callee: Expression::Variable(heap.alloc_str_for_test("f"), INT_TYPE),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("rc")),
          },
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("v"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::IndexedAssign {
            assigned_expression: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("s"),
            type_: INT_TYPE,
            expression_list: vec![
              ZERO,
              Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
            ],
          },
        ],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_mir_to_wasm(heap, &sources).pretty_print(heap);
    let expected = r#"(type $i32_=>_i32 (func (param i32) (result i32)))
(data (i32.const 4096) "\00\00\00\00\03\00\00\00\66\6f\6f")
(data (i32.const 4107) "\00\00\00\00\03\00\00\00\62\61\72")
(table $0 1 funcref)
(elem $0 (i32.const 0) $main)
(func $main (param $bar i32) (result i32)
  (local $c i32)
  (local $i i32)
  (local $b i32)
  (local $f i32)
  (local $bin i32)
  (local $rc i32)
  (local $v i32)
  (local $s i32)
  (if (i32.xor (i32.const 0) (i32.const 1)) (then
    (local.set $c (i32.const 0))
  ))
  (if (i32.const 0) (then
    (local.set $i (i32.const 0))
    (loop $l0_loop_continue
      (block $l1_loop_exit
        (local.set $c (i32.const 0))
        (local.set $i (i32.const 0))
        (br $l0_loop_continue)
      )
    )
    (local.set $f (i32.const 4096))
  ) (else
    (loop $l2_loop_continue
      (block $l3_loop_exit
        (if (i32.const 0) (then
          (local.set $b (i32.const 0))
          (br $l3_loop_exit)
        ))
        (br $l2_loop_continue)
      )
    )
    (loop $l4_loop_continue
      (block $l5_loop_exit
        (if (i32.xor (i32.const 0) (i32.const 1)) (then
          (br $l5_loop_exit)
        ))
        (br $l4_loop_continue)
      )
    )
    (local.set $f (i32.const 0))
  ))
  (local.set $bin (i32.add (local.get $f) (i32.const 0)))
  (drop (call $main (i32.const 0)))
  (local.set $rc (call_indirect $0 (type $i32_=>_i32) (i32.const 0) (local.get $f)))
  (local.set $v (i32.load offset=12 (i32.const 0)))
  (i32.store offset=12 (i32.const 0) (local.get $v))
  (local.set $s (call $_builtin_malloc (i32.const 8)))
  (i32.store (local.get $s) (i32.const 0))
  (i32.store offset=4 (local.get $s) (local.get $v))
  (i32.const 0)
)
(export "main" (func $main))
"#;
    assert_eq!(expected, actual);
  }
}
