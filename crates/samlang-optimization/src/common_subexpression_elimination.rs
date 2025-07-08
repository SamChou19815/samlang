use super::optimization_common::{
  BinaryBindedValue, BindedValue, IndexAccessBindedValue, take_mut,
};
use samlang_ast::mir::{Binary, Function, Statement};
use samlang_heap::Heap;
use std::collections::BTreeSet;

fn intersection_of(
  set1: BTreeSet<BindedValue>,
  others: Vec<BTreeSet<BindedValue>>,
) -> Vec<BindedValue> {
  set1.into_iter().filter(|e| others.iter().all(|it| it.contains(e))).collect()
}

fn optimize_stmts(
  stmts: Vec<Statement>,
  heap: &mut Heap,
) -> (Vec<Statement>, BTreeSet<BindedValue>) {
  let mut set = BTreeSet::new();
  let mut collector = Vec::new();
  for stmt in stmts.into_iter().rev() {
    match stmt {
      // handle similar optimization in loop-invariant code motion for while
      Statement::Call { .. }
      | Statement::Break(_)
      | Statement::SingleIf { .. }
      | Statement::While { .. }
      | Statement::Cast { .. }
      | Statement::LateInitDeclaration { .. }
      | Statement::LateInitAssignment { .. }
      | Statement::StructInit { .. }
      | Statement::ClosureInit { .. } => collector.push(stmt),

      Statement::IsPointer { name, pointer_type, operand } => {
        set.insert(BindedValue::IsPointer(pointer_type, operand));
        collector.push(Statement::IsPointer { name, pointer_type, operand });
      }
      Statement::Not { name, operand } => {
        set.insert(BindedValue::Not(operand));
        collector.push(Statement::Not { name, operand });
      }
      Statement::Binary(Binary { name, operator, e1, e2 }) => {
        set.insert(BindedValue::Binary(BinaryBindedValue { operator, e1, e2 }));
        collector.push(Statement::Binary(Binary { name, operator, e1, e2 }));
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        set.insert(BindedValue::IndexedAccess(IndexAccessBindedValue {
          type_,
          pointer_expression,
          index,
        }));
        collector.push(Statement::IndexedAccess { name, type_, pointer_expression, index });
      }

      Statement::IfElse { condition, s1, s2, final_assignments } => {
        let (s1, set1) = optimize_stmts(s1, heap);
        let (s2, set2) = optimize_stmts(s2, heap);
        let common_expressions = intersection_of(set1, vec![set2]);
        collector.push(Statement::IfElse { condition, s1, s2, final_assignments });
        for binded_value in common_expressions.into_iter().rev() {
          set.insert(binded_value);
          collector.push(match binded_value {
            BindedValue::IndexedAccess(IndexAccessBindedValue {
              type_,
              pointer_expression,
              index,
            }) => Statement::IndexedAccess {
              name: heap.alloc_temp_str(),
              type_,
              pointer_expression,
              index,
            },
            BindedValue::Binary(BinaryBindedValue { operator, e1, e2 }) => Statement::Binary(
              Statement::binary_unwrapped(heap.alloc_temp_str(), operator, e1, e2),
            ),
            BindedValue::IsPointer(pointer_type, operand) => {
              Statement::IsPointer { name: heap.alloc_temp_str(), pointer_type, operand }
            }
            BindedValue::Not(operand) => Statement::Not { name: heap.alloc_temp_str(), operand },
          })
        }
      }
    }
  }
  collector.reverse();
  (collector, set)
}

pub(super) fn optimize_function(function: &mut Function, heap: &mut Heap) {
  take_mut(&mut function.body, |body| optimize_stmts(body, heap).0);
}

#[cfg(test)]
mod tests {
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::BinaryOperator,
    mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, INT_32_TYPE, ONE,
      Statement, SymbolTable, Type, TypeNameId, VariableName, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  fn assert_correctly_optimized(stmts: Vec<Statement>, heap: &mut Heap, expected: &str) {
    let mut f = Function {
      name: FunctionName::new_for_test(PStr::LOWER_A),
      parameters: Vec::new(),
      type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
      body: stmts,
      return_value: ZERO,
    };
    super::optimize_function(&mut f, heap);
    super::super::local_value_numbering::optimize_function(&mut f);

    assert_eq!(
      expected,
      f.body.iter().map(|s| s.debug_print(heap, &SymbolTable::new())).join("\n")
    );
  }

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::IfElse {
        condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
        s1: vec![
          Statement::binary(heap.alloc_str_for_test("ddddd"), BinaryOperator::PLUS, ONE, ONE),
          Statement::Not { name: heap.alloc_str_for_test("ud1"), operand: ZERO },
          Statement::IsPointer {
            name: heap.alloc_str_for_test("ud3"),
            pointer_type: TypeNameId::STR,
            operand: ZERO,
          },
          Statement::binary(PStr::LOWER_A, BinaryOperator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("ddd"),
            type_: INT_32_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fff")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![
              Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
              Expression::var_name(heap.alloc_str_for_test("ddd"), INT_32_TYPE),
            ],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
        ],
        s2: vec![
          Statement::Not { name: heap.alloc_str_for_test("ud2"), operand: ZERO },
          Statement::IsPointer {
            name: heap.alloc_str_for_test("ud4"),
            pointer_type: TypeNameId::STR,
            operand: ZERO,
          },
          Statement::binary(heap.alloc_str_for_test("fd"), BinaryOperator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("eee"),
            type_: INT_32_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(
              heap.alloc_str_for_test("eeee"),
              INT_32_TYPE,
            )),
            arguments: vec![
              Expression::var_name(heap.alloc_str_for_test("fd"), INT_32_TYPE),
              Expression::var_name(heap.alloc_str_for_test("eee"), INT_32_TYPE),
            ],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
        ],
        final_assignments: Vec::new(),
      }],
      heap,
      r#"let _t3: int = 0[3];
let _t2 = 1 + 0;
let _t1 = 0 is _Str;
let _t0 = !0;
if (b: int) {
  let ddddd = 1 + 1;
  __$fff((_t2: int), (_t3: int));
} else {
  (eeee: int)((_t2: int), (_t3: int));
}"#,
    );
  }
}
