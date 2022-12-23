use crate::{
  ast::{
    common_names,
    hir::Operator,
    mir::{Expression, Function, Sources, Statement, INT_TYPE},
  },
  common::Str,
};
use std::collections::HashMap;

struct Memory<'a> {
  heap: &'a mut [u8],
  malloc_end: usize,
  stacks: &'a mut Vec<HashMap<Str, i32>>,
  string_id_to_string: HashMap<i32, String>,
  global_names_to_address: HashMap<Str, i32>,
  println_collector: Vec<String>,
}

impl<'a> Memory<'a> {
  fn push_stack(&mut self) {
    self.stacks.push(HashMap::new());
  }

  fn pop_stack(&mut self) {
    self.stacks.pop();
  }

  fn read_from_stack(&self, name: &Str) -> i32 {
    *self.stacks.last().unwrap().get(name).unwrap_or(&0)
  }

  fn write_to_stack(&mut self, name: Str, value: i32) {
    self.stacks.last_mut().unwrap().insert(name, value);
  }

  fn read_from_heap(&self, address: i32) -> i32 {
    let offset = usize::try_from(address).expect(address.to_string().as_str());
    i32::from_be_bytes([
      self.heap[offset],
      self.heap[offset + 1],
      self.heap[offset + 2],
      self.heap[offset + 3],
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
    Self::write_int(self.heap, address, value);
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
      self.heap[offset + i] = 0;
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
    Expression::IntLiteral(i, _) => *i,
    Expression::Variable(n, _) => mem.read_from_stack(n),
    Expression::Name(n, _) => *mem.global_names_to_address.get(n).expect(n),
  }
}

fn eval_arguments(mem: &mut Memory, arguments: &Vec<Expression>) -> Vec<i32> {
  arguments.iter().map(|e| eval_expr(mem, e)).collect()
}

fn eval_stmt(
  mem: &mut Memory,
  id_to_functions: &HashMap<i32, &Function>,
  stmt: &Statement,
) -> Result<(), i32> {
  match stmt {
    Statement::Binary { name, type_: _, operator, e1, e2 } => {
      let v1 = eval_expr(mem, e1);
      let v2 = eval_expr(mem, e2);
      let v = match operator {
        Operator::MUL => v1 * v2,
        Operator::DIV => v1 / v2,
        Operator::MOD => v1 % v2,
        Operator::PLUS => v1 + v2,
        Operator::MINUS => v1 - v2,
        Operator::XOR => v1 ^ v2,
        Operator::LT => (v1 < v2) as i32,
        Operator::LE => (v1 <= v2) as i32,
        Operator::GT => (v1 > v2) as i32,
        Operator::GE => (v1 >= v2) as i32,
        Operator::EQ => (v1 == v2) as i32,
        Operator::NE => (v1 != v2) as i32,
      };
      mem.write_to_stack(name.clone(), v);
      Ok(())
    }
    Statement::IndexedAccess { name, type_: _, pointer_expression, index } => {
      let ptr = eval_expr(mem, pointer_expression) + i32::try_from(*index).unwrap() * 4;
      mem.write_to_stack(name.clone(), mem.read_from_heap(ptr));
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
        mem.write_to_stack(n.clone(), v);
      }
      Ok(())
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      if eval_expr(mem, condition) != 0 {
        eval_stmts(mem, id_to_functions, s1)?;
        for (n, _, e, _) in final_assignments {
          let v = eval_expr(mem, e);
          mem.write_to_stack(n.clone(), v);
        }
      } else {
        eval_stmts(mem, id_to_functions, s2)?;
        for (n, _, _, e) in final_assignments {
          let v = eval_expr(mem, e);
          mem.write_to_stack(n.clone(), v);
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
        mem.write_to_stack(var.name.clone(), v);
      }
      loop {
        match eval_stmts(mem, id_to_functions, statements) {
          Ok(_) => {
            for var in loop_variables {
              let v = eval_expr(mem, &var.loop_value);
              mem.write_to_stack(var.name.clone(), v);
            }
          }
          Err(v) => {
            if let Some((n, _)) = break_collector {
              mem.write_to_stack(n.clone(), v);
            }
            return Ok(());
          }
        }
      }
    }
    Statement::Cast { name, type_: _, assigned_expression } => {
      let v = eval_expr(mem, assigned_expression);
      mem.write_to_stack(name.clone(), v);
      Ok(())
    }
    Statement::StructInit { struct_variable_name, type_: _, expression_list } => {
      let address = mem.malloc(expression_list.len() * 4);
      for (i, expr) in expression_list.iter().enumerate() {
        let v = eval_expr(mem, expr);
        mem.write_to_heap(address + i32::try_from(i).unwrap() * 4, v);
      }
      mem.write_to_stack(struct_variable_name.clone(), address);
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
  arguments: &Vec<Expression>,
) -> i32 {
  match callee {
    Expression::Name(s, _) => {
      let name = s.to_string();
      if name.eq(&common_names::encoded_fn_name_free()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 1);
        mem.free(argument_vs[0]);
        return 0;
      } else if name.eq(&common_names::encoded_fn_name_string_to_int()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 1);
        return mem.get_string(argument_vs[0]).parse::<i32>().unwrap();
      } else if name.eq(&common_names::encoded_fn_name_int_to_string()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 1);
        return mem.add_string(argument_vs[0].to_string());
      } else if name.eq(&common_names::encoded_fn_name_string_concat()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 2);
        let s = format!("{}{}", mem.get_string(argument_vs[0]), mem.get_string(argument_vs[1]));
        return mem.add_string(s);
      } else if name.eq(&common_names::encoded_fn_name_println()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 1);
        let s = mem.get_string(argument_vs[0]).clone();
        mem.println_collector.push(s);
        return 0;
      } else if name.eq(&common_names::encoded_fn_name_panic()) {
        let argument_vs = eval_arguments(mem, arguments);
        assert!(argument_vs.len() == 1);
        panic!("{}", mem.get_string(argument_vs[0]));
      }
    }
    _ => {}
  }
  let callee_v = eval_expr(mem, callee);
  let argument_vs = eval_arguments(mem, arguments);
  mem.push_stack();
  let f = id_to_functions.get(&callee_v).unwrap();
  for (param, arg) in f.parameters.iter().zip(argument_vs) {
    mem.write_to_stack(param.clone(), arg);
  }
  eval_stmts(mem, id_to_functions, &f.body).unwrap();
  let v = eval_expr(mem, &f.return_value);
  mem.pop_stack();
  v
}

pub(super) fn run(sources: &Sources, main_function: Str) -> String {
  let mut heap: [u8; 20000] = [0; 20000];
  let mut stack = vec![];
  let mut string_id_to_string = HashMap::new();
  let mut id_to_functions = HashMap::new();
  let mut global_names_to_address = HashMap::new();
  let mut global_name_id = 0;
  let mut string_id = 0;

  for v in &sources.global_variables {
    string_id_to_string.insert(string_id, v.content.to_string());
    Memory::write_int(&mut heap, global_name_id + 4, string_id);
    global_names_to_address.insert(v.name.clone(), global_name_id);
    string_id += 1;
    global_name_id += 8;
  }
  for f in &sources.functions {
    global_names_to_address.insert(f.name.clone(), global_name_id);
    id_to_functions.insert(global_name_id, f);
    global_name_id += 4;
  }
  let mut mem = Memory {
    heap: &mut heap,
    malloc_end: usize::try_from(global_name_id).unwrap(),
    stacks: &mut stack,
    string_id_to_string,
    global_names_to_address,
    println_collector: vec![],
  };

  eval_fun_call(&mut mem, &id_to_functions, &Expression::Name(main_function, INT_TYPE), &vec![]);

  let mut sb = String::new();
  for line in mem.println_collector {
    sb.push_str(&line);
    sb.push('\n');
  }
  sb
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      common_names,
      hir::{GlobalVariable, Operator},
      mir::{
        Expression, Function, GenenalLoopVariable, Sources, Statement, Type, INT_TYPE, ONE, ZERO,
      },
    },
    common::{rc_string, rcs},
  };
  use pretty_assertions::assert_eq;

  #[should_panic]
  #[test]
  fn panic_test() {
    super::run(
      &Sources {
        global_variables: vec![GlobalVariable { name: rcs("A"), content: rcs("Ouch") }],
        type_definitions: vec![],
        main_function_names: vec![],
        functions: vec![Function {
          name: rcs("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Expression::Name(rc_string(common_names::encoded_fn_name_panic()), INT_TYPE),
            arguments: vec![Expression::Variable(rcs("A"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        }],
      },
      rcs("main"),
    );
  }

  fn assert_run_output(
    global_variables: Vec<GlobalVariable>,
    functions: Vec<Function>,
    expected: &str,
  ) {
    let actual = super::run(
      &Sources {
        global_variables,
        type_definitions: vec![],
        main_function_names: vec![],
        functions,
      },
      rcs("main"),
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn free_zero_test() {
    assert_run_output(
      vec![],
      vec![
        Function {
          name: rcs("pp"),
          parameters: vec![rcs("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_int_to_string()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("n"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("s")),
            },
            Statement::Call {
              callee: Expression::Name(rc_string(common_names::encoded_fn_name_panic()), INT_TYPE),
              arguments: vec![Expression::Variable(rcs("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: rcs("o"),
              type_: INT_TYPE,
              expression_list: vec![ONE, ONE],
            },
            Statement::Call {
              callee: Expression::Name(rc_string(common_names::encoded_fn_name_free()), INT_TYPE),
              arguments: vec![Expression::Variable(rcs("o"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: rcs("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(rcs("o"), INT_TYPE),
              index: 0,
            },
            Statement::SingleIf {
              condition: Expression::Variable(rcs("v"), INT_TYPE),
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::Name(rcs("pp"), INT_TYPE),
                arguments: vec![Expression::Variable(rcs("v"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::IndexedAccess {
              name: rcs("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(rcs("o"), INT_TYPE),
              index: 1,
            },
            Statement::SingleIf {
              condition: Expression::Variable(rcs("v"), INT_TYPE),
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::Name(rcs("pp"), INT_TYPE),
                arguments: vec![Expression::Variable(rcs("v"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
          ],
          return_value: ZERO,
        },
      ],
      "",
    );
  }

  #[test]
  fn integration_test() {
    assert_run_output(
      vec![
        GlobalVariable { name: rcs("A"), content: rcs("Hello ") },
        GlobalVariable { name: rcs("B"), content: rcs("World!") },
      ],
      vec![
        Function {
          name: rcs("_"),
          parameters: vec![rcs("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![],
          return_value: ZERO,
        },
        Function {
          name: rcs("printlnInt"),
          parameters: vec![rcs("n")],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_int_to_string()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("n"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("s")),
            },
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_string_to_int()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("s")),
            },
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_int_to_string()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("s")),
            },
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_println()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("s"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("r")),
            },
          ],
          return_value: Expression::Variable(rcs("r"), INT_TYPE),
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: rcs("a"),
              type_: INT_TYPE,
              expression_list: vec![ZERO, ZERO],
            },
            Statement::IndexedAccess {
              name: rcs("v"),
              type_: INT_TYPE,
              pointer_expression: Expression::Variable(rcs("a"), INT_TYPE),
              index: 0,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::PLUS,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::MINUS,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::MUL,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::DIV,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::MOD,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::XOR,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::LT,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::LE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::GT,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::GE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::EQ,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::NE,
              e1: ZERO,
              e2: ZERO,
            },
            Statement::Binary {
              name: rcs("v"),
              type_: INT_TYPE,
              operator: Operator::PLUS,
              e1: Expression::Variable(rcs("v"), INT_TYPE),
              e2: ONE,
            },
            Statement::IndexedAssign {
              assigned_expression: Expression::Variable(rcs("v"), INT_TYPE),
              pointer_expression: Expression::Variable(rcs("a"), INT_TYPE),
              index: 1,
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: true,
              statements: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("B"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("A"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("A"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              s2: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("B"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              final_assignments: vec![(rcs("if1"), INT_TYPE, ZERO, ONE)],
            },
            Statement::IfElse {
              condition: ONE,
              s1: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("B"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              s2: vec![Statement::Call {
                callee: Expression::Name(
                  rc_string(common_names::encoded_fn_name_println()),
                  INT_TYPE,
                ),
                arguments: vec![Expression::Name(rcs("A"), INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              }],
              final_assignments: vec![(rcs("if2"), INT_TYPE, ONE, ZERO)],
            },
            Statement::Binary {
              name: rcs("if_sum"),
              type_: INT_TYPE,
              operator: Operator::PLUS,
              e1: Expression::Variable(rcs("if1"), INT_TYPE),
              e2: Expression::Variable(rcs("if2"), INT_TYPE),
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
                name: rcs("lv"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ONE,
              }],
              statements: vec![Statement::SingleIf {
                condition: Expression::Variable(rcs("lv"), INT_TYPE),
                invert_condition: false,
                statements: vec![Statement::Break(Expression::int(2))],
              }],
              break_collector: Some((rcs("bc"), INT_TYPE)),
            },
            Statement::Binary {
              name: rcs("product"),
              type_: INT_TYPE,
              operator: Operator::MUL,
              e1: Expression::Variable(rcs("if_sum"), INT_TYPE),
              e2: Expression::Variable(rcs("bc"), INT_TYPE),
            },
            Statement::Cast {
              name: rcs("cast"),
              type_: INT_TYPE,
              assigned_expression: Expression::Variable(rcs("product"), INT_TYPE),
            },
            Statement::Call {
              callee: Expression::Name(rcs("printlnInt"), INT_TYPE),
              arguments: vec![Expression::Variable(rcs("cast"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_string_concat()),
                INT_TYPE,
              ),
              arguments: vec![
                Expression::Name(rcs("A"), INT_TYPE),
                Expression::Name(rcs("B"), INT_TYPE),
              ],
              return_type: INT_TYPE,
              return_collector: Some(rcs("hw_string")),
            },
            Statement::Call {
              callee: Expression::Name(
                rc_string(common_names::encoded_fn_name_println()),
                INT_TYPE,
              ),
              arguments: vec![Expression::Variable(rcs("hw_string"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Expression::int(16), // calling function _
              arguments: vec![Expression::Variable(rcs("hw_string"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ],
          return_value: ZERO,
        },
      ],
      r#"World!
World!
World!
4
Hello World!
"#,
    );
  }
}
