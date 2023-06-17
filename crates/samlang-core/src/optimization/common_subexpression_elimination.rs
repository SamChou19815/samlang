use super::optimization_common::{BinaryBindedValue, BindedValue, IndexAccessBindedValue};
use crate::{
  ast::mir::{Binary, Function, Statement},
  common::take_mut,
  Heap,
};
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
  let mut collector = vec![];
  for stmt in stmts.into_iter().rev() {
    match stmt {
      // handle similar optimization in loop-invariant code motion for while
      Statement::Call { .. }
      | Statement::Break(_)
      | Statement::SingleIf { .. }
      | Statement::While { .. }
      | Statement::Cast { .. }
      | Statement::StructInit { .. }
      | Statement::ClosureInit { .. } => collector.push(stmt),

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
  use crate::{
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, Function, FunctionName, Statement, Type, VariableName, INT_TYPE, ONE,
      ZERO,
    },
    common::well_known_pstrs,
    Heap,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, heap: &mut Heap, expected: &str) {
    let mut f = Function {
      name: well_known_pstrs::LOWER_A,
      parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: stmts,
      return_value: ZERO,
    };
    super::optimize_function(&mut f, heap);
    super::super::local_value_numbering::optimize_function(&mut f);

    assert_eq!(expected, f.body.iter().map(|s| s.debug_print(heap)).join("\n"));
  }

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::IfElse {
        condition: Expression::var_name(well_known_pstrs::LOWER_B, INT_TYPE),
        s1: vec![
          Statement::binary(heap.alloc_str_for_test("ddddd"), Operator::PLUS, ONE, ONE),
          Statement::binary(well_known_pstrs::LOWER_A, Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("ddd"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fff"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("ddd"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        s2: vec![
          Statement::binary(heap.alloc_str_for_test("fd"), Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("eee"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("eeee"), INT_TYPE)),
            arguments: vec![
              Expression::var_name(heap.alloc_str_for_test("fd"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("eee"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        final_assignments: vec![],
      }],
      heap,
      r#"let _t1: int = 0[3];
let _t0 = 1 + 0;
if (b: int) {
  let ddddd = 1 + 1;
  fff((_t0: int), (_t1: int));
} else {
  (eeee: int)((_t0: int), (_t1: int));
}"#,
    );
  }
}
