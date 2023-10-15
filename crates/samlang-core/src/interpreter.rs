use crate::ast::{
  hir::Operator,
  lir::{Expression, Function, Sources, Statement, INT_TYPE},
  mir::FunctionName,
};
use samlang_heap::{Heap, PStr};
use std::collections::HashMap;

struct Memory<'a> {
  heap: &'a mut Heap,
  program_heap: &'a mut [u8],
  malloc_end: usize,
  stacks: &'a mut Vec<HashMap<PStr, i32>>,
  string_id_to_string: HashMap<i32, String>,
  global_str_names_to_address: HashMap<PStr, i32>,
  global_fn_names_to_address: HashMap<FunctionName, i32>,
  println_collector: Vec<String>,
}

impl<'a> Memory<'a> {
  fn push_stack(&mut self) {
    self.stacks.push(HashMap::new());
  }

  fn pop_stack(&mut self) {
    self.stacks.pop();
  }

  fn read_from_stack(&self, name: &PStr) -> i32 {
    *self.stacks.last().unwrap().get(name).unwrap_or(&0)
  }

  fn write_to_stack(&mut self, name: PStr, value: i32) {
    self.stacks.last_mut().unwrap().insert(name, value);
  }

  fn read_from_heap(&self, address: i32) -> i32 {
    let offset = usize::try_from(address).expect(address.to_string().as_str());
    i32::from_be_bytes([
      self.program_heap[offset],
      self.program_heap[offset + 1],
      self.program_heap[offset + 2],
      self.program_heap[offset + 3],
    ])
  }

  fn write_int(heap: &mut [u8], address: i32, value: i32) {
    let offset = usize::try_from(address).unwrap();
    let bytes = i32::to_be_bytes(value);
    heap[offset] = bytes[0];
    heap[offset + 1] = bytes[1];
    heap[offset + 2] = bytes[2];
    heap[offset + 3] = bytes[3];
  }

  fn write_to_heap(&mut self, address: i32, value: i32) {
    Self::write_int(self.program_heap, address, value);
  }

  fn malloc(&mut self, size: usize) -> i32 {
    let address = i32::try_from(self.malloc_end).unwrap();
    self.write_to_heap(address, i32::try_from(size).unwrap());
    self.malloc_end += 4;
    self.malloc_end += size;
    address + 4
  }

  fn free(&mut self, address: i32) {
    let size = usize::try_from(self.read_from_heap(address - 4)).unwrap();
    self.write_to_heap(address - 4, 0);
    let offset = usize::try_from(address).unwrap();
    for i in 0..size {
      self.program_heap[offset + i] = 0;
    }
  }

  fn get_string(&self, address: i32) -> &String {
    let id = self.read_from_heap(address + 4);
    self.string_id_to_string.get(&id).unwrap()
  }

  fn add_string(&mut self, string: String) -> i32 {
    let id = i32::try_from(self.string_id_to_string.len()).unwrap();
    let address = self.malloc(8);
    self.write_to_heap(address, 0);
    self.write_to_heap(address + 4, id);
    self.string_id_to_string.insert(id, string);
    address
  }
}

fn eval_expr(mem: &mut Memory, expr: &Expression) -> i32 {
  match expr {
    Expression::IntLiteral(i) => *i,
    Expression::Variable(n, _) => mem.read_from_stack(n),
    Expression::StringName(n) => *mem.global_str_names_to_address.get(n).expect(n.as_str(mem.heap)),
    Expression::FnName(n, _) => *mem.global_fn_names_to_address.get(n).unwrap(),
  }
}

fn eval_arguments(mem: &mut Memory, arguments: &[Expression]) -> Vec<i32> {
  arguments.iter().map(|e| eval_expr(mem, e)).collect()
}

fn eval_stmt(
  mem: &mut Memory,
  id_to_functions: &HashMap<i32, &Function>,
  stmt: &Statement,
) -> Result<(), i32> {
  match stmt {
    Statement::Binary { name, operator, e1, e2 } => {
      let v1 = eval_expr(mem, e1);
      let v2 = eval_expr(mem, e2);
      let v = match operator {
        Operator::MUL => v1 * v2,
        Operator::DIV => v1 / v2,
        Operator::MOD => v1 % v2,
        Operator::PLUS => v1 + v2,
        Operator::MINUS => v1 - v2,
        Operator::XOR => v1 ^ v2,
        Operator::LAND => v1 & v2,
        Operator::LOR => v1 | v2,
        Operator::SHL => v1 << v2,
        Operator::SHR => {
          i32::from_be_bytes(((u32::from_be_bytes(v1.to_be_bytes())) >> v2).to_be_bytes())
        }
        Operator::LT => (v1 < v2) as i32,
        Operator::LE => (v1 <= v2) as i32,
        Operator::GT => (v1 > v2) as i32,
        Operator::GE => (v1 >= v2) as i32,
        Operator::EQ => (v1 == v2) as i32,
        Operator::NE => (v1 != v2) as i32,
      };
      mem.write_to_stack(*name, v);
      Ok(())
    }
    Statement::IndexedAccess { name, type_: _, pointer_expression, index } => {
      let ptr = eval_expr(mem, pointer_expression) + i32::try_from(*index).unwrap() * 4;
      mem.write_to_stack(*name, mem.read_from_heap(ptr));
      Ok(())
    }
    Statement::IndexedAssign { assigned_expression, pointer_expression, index } => {
      let ptr = eval_expr(mem, pointer_expression) + i32::try_from(*index).unwrap() * 4;
      let v = eval_expr(mem, assigned_expression);
      mem.write_to_heap(ptr, v);
      Ok(())
    }
    Statement::Call { callee, arguments, return_type: _, return_collector } => {
      let v = eval_fun_call(mem, id_to_functions, callee, arguments);
      if let Some(n) = return_collector {
        mem.write_to_stack(*n, v);
      }
      Ok(())
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      if eval_expr(mem, condition) != 0 {
        eval_stmts(mem, id_to_functions, s1)?;
        for (n, _, e, _) in final_assignments {
          let v = eval_expr(mem, e);
          mem.write_to_stack(*n, v);
        }
      } else {
        eval_stmts(mem, id_to_functions, s2)?;
        for (n, _, _, e) in final_assignments {
          let v = eval_expr(mem, e);
          mem.write_to_stack(*n, v);
        }
      }
      Ok(())
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      if (eval_expr(mem, condition) ^ (*invert_condition as i32)) != 0 {
        eval_stmts(mem, id_to_functions, statements)?;
      }
      Ok(())
    }
    Statement::Break(e) => Result::Err(eval_expr(mem, e)),
    Statement::While { loop_variables, statements, break_collector } => {
      for var in loop_variables {
        let v = eval_expr(mem, &var.initial_value);
        mem.write_to_stack(var.name, v);
      }
      loop {
        match eval_stmts(mem, id_to_functions, statements) {
          Ok(_) => {
            for var in loop_variables {
              let v = eval_expr(mem, &var.loop_value);
              mem.write_to_stack(var.name, v);
            }
          }
          Err(v) => {
            if let Some((n, _)) = break_collector {
              mem.write_to_stack(*n, v);
            }
            return Ok(());
          }
        }
      }
    }
    Statement::Cast { name, type_: _, assigned_expression }
    | Statement::LateInitAssignment { name, assigned_expression } => {
      let v = eval_expr(mem, assigned_expression);
      mem.write_to_stack(*name, v);
      Ok(())
    }
    Statement::LateInitDeclaration { .. } => Ok(()),
    Statement::StructInit { struct_variable_name, type_: _, expression_list } => {
      let address = mem.malloc(expression_list.len() * 4);
      for (i, expr) in expression_list.iter().enumerate() {
        let v = eval_expr(mem, expr);
        mem.write_to_heap(address + i32::try_from(i).unwrap() * 4, v);
      }
      mem.write_to_stack(*struct_variable_name, address);
      Ok(())
    }
  }
}

fn eval_stmts(
  mem: &mut Memory,
  id_to_functions: &HashMap<i32, &Function>,
  stmts: &Vec<Statement>,
) -> Result<(), i32> {
  for stmt in stmts {
    match eval_stmt(mem, id_to_functions, stmt) {
      Ok(_) => {}
      Err(i) => return Err(i),
    }
  }
  Ok(())
}

fn eval_fun_call(
  mem: &mut Memory,
  id_to_functions: &HashMap<i32, &Function>,
  callee: &Expression,
  arguments: &[Expression],
) -> i32 {
  if let Expression::FnName(name, _) = callee {
    if name.eq(&FunctionName::BUILTIN_FREE) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 1);
      mem.free(argument_vs[0]);
      return 0;
    } else if name.eq(&FunctionName::STR_TO_INT) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 1);
      return mem.get_string(argument_vs[0]).parse::<i32>().unwrap();
    } else if name.eq(&FunctionName::STR_FROM_INT) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 2);
      return mem.add_string(argument_vs[1].to_string());
    } else if name.eq(&FunctionName::STR_CONCAT) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 2);
      let s = format!("{}{}", mem.get_string(argument_vs[0]), mem.get_string(argument_vs[1]));
      return mem.add_string(s);
    } else if name.eq(&FunctionName::PROCESS_PRINTLN) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 2);
      let s = mem.get_string(argument_vs[1]).clone();
      mem.println_collector.push(s);
      return 0;
    } else if name.eq(&FunctionName::PROCESS_PANIC) {
      let argument_vs = eval_arguments(mem, arguments);
      assert!(argument_vs.len() == 2);
      panic!("{}", mem.get_string(argument_vs[1]));
    }
  }
  let callee_v = eval_expr(mem, callee);
  let argument_vs = eval_arguments(mem, arguments);
  mem.push_stack();
  let f = id_to_functions.get(&callee_v).unwrap();
  for (param, arg) in f.parameters.iter().zip(argument_vs) {
    mem.write_to_stack(*param, arg);
  }
  eval_stmts(mem, id_to_functions, &f.body).unwrap();
  let v = eval_expr(mem, &f.return_value);
  mem.pop_stack();
  v
}

pub(super) fn run(heap: &mut Heap, sources: &Sources, main_function: FunctionName) -> String {
  let program_heap = (&mut vec![1u8; 20000]) as &mut [u8];
  let mut stack = vec![];
  let mut string_id_to_string = HashMap::new();
  let mut id_to_functions = HashMap::new();
  let mut global_str_names_to_address = HashMap::new();
  let mut global_fn_names_to_address = HashMap::new();
  let mut global_name_id = 0;

  for (string_id, v) in sources.global_variables.iter().enumerate() {
    let string_id = i32::try_from(string_id).unwrap();
    string_id_to_string.insert(string_id, v.content.as_str(heap).to_string());
    Memory::write_int(program_heap, global_name_id + 4, string_id);
    global_str_names_to_address.insert(v.name, global_name_id);
    global_name_id += 8;
  }
  for f in &sources.functions {
    assert!(global_fn_names_to_address.insert(f.name, global_name_id).is_none());
    id_to_functions.insert(global_name_id, f);
    global_name_id += 4;
  }
  let mut mem = Memory {
    heap,
    program_heap,
    malloc_end: usize::try_from(global_name_id).unwrap(),
    stacks: &mut stack,
    string_id_to_string,
    global_str_names_to_address,
    global_fn_names_to_address,
    println_collector: vec![],
  };

  eval_fun_call(&mut mem, &id_to_functions, &Expression::FnName(main_function, INT_TYPE), &[]);

  let mut sb = String::new();
  for line in mem.println_collector {
    sb.push_str(&line);
    sb.push('\n');
  }
  sb
}

#[cfg(test)]
mod tests {
  use crate::ast::{
    hir::{GlobalVariable, Operator},
    lir::{
      Expression, Function, GenenalLoopVariable, Sources, Statement, Type, INT_TYPE, ONE, ZERO,
    },
    mir::{FunctionName, SymbolTable},
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};

  #[should_panic]
  #[test]
  fn panic_test() {
    let heap = &mut Heap::new();

    let sources = Sources {
      symbol_table: SymbolTable::new(),
      global_variables: vec![GlobalVariable {
        name: PStr::UPPER_A,
        content: heap.alloc_str_for_test("Ouch"),
      }],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![Statement::Call {
          callee: Expression::FnName(FunctionName::PROCESS_PANIC, INT_TYPE),
          arguments: vec![ZERO, Expression::Variable(PStr::UPPER_A, INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        }],
        return_value: ZERO,
      }],
    };

    super::run(heap, &sources, FunctionName::new_for_test(PStr::MAIN_FN));
  }

  fn assert_run_output(
    global_variables: Vec<GlobalVariable>,
    functions: Vec<Function>,
    heap: &mut Heap,
    expected: &str,
  ) {
    let actual = super::run(
      heap,
      &Sources {
        symbol_table: SymbolTable::new(),
        global_variables,
        type_definitions: vec![],
        main_function_names: vec![],
        functions,
      },
      FunctionName::new_for_test(PStr::MAIN_FN),
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn free_zero_test() {
    let heap = &mut Heap::new();

    assert_run_output(
      vec![],
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("pp")),
          parameters: vec![heap.alloc_str_for_test("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Expression::FnName(FunctionName::STR_FROM_INT, INT_TYPE),
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("n"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("s")),
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::PROCESS_PANIC, INT_TYPE),
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("o"),
              type_: INT_TYPE,
              expression_list: vec![ONE, ONE],
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::BUILTIN_FREE, INT_TYPE),
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("o"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(heap.alloc_str_for_test("o"), INT_TYPE),
              index: 0,
            },
            Statement::SingleIf {
              condition: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("pp")),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(heap.alloc_str_for_test("o"), INT_TYPE),
              index: 1,
            },
            Statement::SingleIf {
              condition: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("pp")),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
          ],
          return_value: ZERO,
        },
      ],
      heap,
      "",
    );
  }

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();

    assert_run_output(
      vec![
        GlobalVariable { name: PStr::UPPER_A, content: heap.alloc_str_for_test("Hello ") },
        GlobalVariable { name: PStr::UPPER_B, content: heap.alloc_str_for_test("World!") },
      ],
      vec![
        Function {
          name: FunctionName::new_for_test(PStr::UNDERSCORE),
          parameters: vec![heap.alloc_str_for_test("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("printlnInt")),
          parameters: vec![heap.alloc_str_for_test("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Expression::FnName(FunctionName::STR_FROM_INT, INT_TYPE),
              arguments: vec![ZERO, Expression::Variable(heap.alloc_str_for_test("n"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("s")),
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::STR_TO_INT, INT_TYPE),
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("s")),
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::STR_FROM_INT, INT_TYPE),
              arguments: vec![ZERO, Expression::Variable(heap.alloc_str_for_test("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("s")),
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
              arguments: vec![ZERO, Expression::Variable(heap.alloc_str_for_test("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("r")),
            },
          ],
          return_value: Expression::Variable(heap.alloc_str_for_test("r"), INT_TYPE),
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_: INT_TYPE,
              expression_list: vec![ZERO, ZERO],
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(PStr::LOWER_A, INT_TYPE),
              index: 0,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::PLUS,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::MINUS,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::MUL,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::DIV,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::MOD,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::LAND,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::LOR,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::SHL,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::SHR,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::XOR,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::LT,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::LE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::GT,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::GE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::EQ,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::NE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("v"),
              operator: Operator::PLUS,
              e1: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::IndexedAssign {
              assigned_expression: Expression::Variable(heap.alloc_str_for_test("v"), INT_TYPE),
              pointer_expression: Expression::Variable(PStr::LOWER_A, INT_TYPE),
              index: 1,
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: true,
              statements: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_B)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_A)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_A)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              s2: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_B)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              final_assignments: vec![(heap.alloc_str_for_test("if1"), INT_TYPE, ZERO, ONE)],
            },
            Statement::IfElse {
              condition: ONE,
              s1: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_B)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              s2: vec![Statement::Call {
                callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
                arguments: vec![ZERO, Expression::StringName(PStr::UPPER_A)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              final_assignments: vec![(heap.alloc_str_for_test("if2"), INT_TYPE, ONE, ZERO)],
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("if_sum"),
              operator: Operator::PLUS,
              e1: Expression::Variable(heap.alloc_str_for_test("if1"), INT_TYPE),
              e2: Expression::Variable(heap.alloc_str_for_test("if2"), INT_TYPE),
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![Statement::IfElse {
                condition: ONE,
                s1: vec![Statement::Break(ZERO)],
                s2: vec![],
                final_assignments: vec![],
              }],
              break_collector: None,
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![Statement::IfElse {
                condition: ZERO,
                s1: vec![],
                s2: vec![Statement::Break(ZERO)],
                final_assignments: vec![],
              }],
              break_collector: None,
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![Statement::Break(ZERO)],
              break_collector: None,
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: heap.alloc_str_for_test("lv"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ONE,
              }],
              statements: vec![Statement::SingleIf {
                condition: Expression::Variable(heap.alloc_str_for_test("lv"), INT_TYPE),
                invert_condition: false,
                statements: vec![Statement::Break(Expression::int(2))],
              }],
              break_collector: Some((heap.alloc_str_for_test("bc"), INT_TYPE)),
            },
            Statement::Binary {
              name: heap.alloc_str_for_test("product"),
              operator: Operator::MUL,
              e1: Expression::Variable(heap.alloc_str_for_test("if_sum"), INT_TYPE),
              e2: Expression::Variable(heap.alloc_str_for_test("bc"), INT_TYPE),
            },
            Statement::Cast {
              name: heap.alloc_str_for_test("cast"),
              type_: INT_TYPE,
              assigned_expression: Expression::Variable(
                heap.alloc_str_for_test("product"),
                INT_TYPE,
              ),
            },
            Statement::LateInitDeclaration {
              name: heap.alloc_str_for_test("late_init"),
              type_: INT_TYPE,
            },
            Statement::LateInitAssignment {
              name: heap.alloc_str_for_test("late_init"),
              assigned_expression: Expression::Variable(
                heap.alloc_str_for_test("product"),
                INT_TYPE,
              ),
            },
            Statement::Call {
              callee: Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("printlnInt")),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("cast"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::STR_CONCAT, INT_TYPE),
              arguments: vec![
                Expression::StringName(PStr::UPPER_A),
                Expression::StringName(PStr::UPPER_B),
              ],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("hw_string")),
            },
            Statement::Call {
              callee: Expression::FnName(FunctionName::PROCESS_PRINTLN, INT_TYPE),
              arguments: vec![
                ZERO,
                Expression::Variable(heap.alloc_str_for_test("hw_string"), INT_TYPE),
              ],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Expression::int(16), // calling function _
              arguments: vec![Expression::Variable(heap.alloc_str_for_test("hw_string"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ],
          return_value: ZERO,
        },
      ],
      heap,
      r#"World!
World!
World!
4
Hello World!
"#,
    );
  }
}
