use super::optimization_common::{BinaryBindedValue, BindedValue, IndexAccessBindedValue};
use crate::{
  ast::hir::{Binary, Function, Statement},
  Heap,
};
use itertools::Itertools;
use std::collections::BTreeSet;

fn intersection_of(
  set1: BTreeSet<BindedValue>,
  others: Vec<BTreeSet<BindedValue>>,
) -> Vec<BindedValue> {
  set1.into_iter().filter(|e| others.iter().all(|it| it.contains(e))).sorted().collect()
}

fn produce_hoisted_stmt(heap: &mut Heap, value: BindedValue) -> Statement {
  match value {
    BindedValue::IndexedAccess(IndexAccessBindedValue { type_, pointer_expression, index }) => {
      Statement::IndexedAccess { name: heap.alloc_temp_str(), type_, pointer_expression, index }
    }
    BindedValue::Binary(BinaryBindedValue { operator, e1, e2 }) => {
      Statement::Binary(Statement::binary_unwrapped(heap.alloc_temp_str(), operator, e1, e2))
    }
  }
}

fn optimize_stmt(
  stmt: Statement,
  heap: &mut Heap,
  set: &mut BTreeSet<BindedValue>,
) -> Vec<Statement> {
  match stmt {
    // handle similar optimization in loop-invariant code motion for while
    Statement::Call { .. }
    | Statement::Break(_)
    | Statement::SingleIf { .. }
    | Statement::While { .. }
    | Statement::StructInit { .. }
    | Statement::ClosureInit { .. } => vec![stmt],

    Statement::Binary(Binary { name, type_, operator, e1, e2 }) => {
      set.insert(BindedValue::Binary(BinaryBindedValue {
        operator,
        e1: e1.clone(),
        e2: e2.clone(),
      }));
      vec![Statement::Binary(Binary { name, type_, operator, e1, e2 })]
    }
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      set.insert(BindedValue::IndexedAccess(IndexAccessBindedValue {
        type_: type_.clone(),
        pointer_expression: pointer_expression.clone(),
        index,
      }));
      vec![Statement::IndexedAccess { name, type_, pointer_expression, index }]
    }

    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let (s1, set1) = optimize_stmts(s1, heap);
      let (s2, set2) = optimize_stmts(s2, heap);
      let common_expressions = intersection_of(set1, vec![set2]);
      let mut hoisted_stmts = vec![];
      for binded_value in common_expressions {
        hoisted_stmts.append(&mut optimize_stmt(
          produce_hoisted_stmt(heap, binded_value),
          heap,
          set,
        ));
      }
      hoisted_stmts.push(Statement::IfElse { condition, s1, s2, final_assignments });
      hoisted_stmts.reverse();
      hoisted_stmts
    }
  }
}

fn optimize_stmts(
  stmts: Vec<Statement>,
  heap: &mut Heap,
) -> (Vec<Statement>, BTreeSet<BindedValue>) {
  let mut set = BTreeSet::new();
  let mut collector = vec![];
  for stmt in stmts.into_iter().rev() {
    collector.append(&mut optimize_stmt(stmt, heap, &mut set));
  }
  collector.reverse();
  (collector, set)
}

pub(super) fn optimize_function(function: Function, heap: &mut Heap) -> Function {
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  Function {
    name,
    parameters,
    type_parameters,
    type_,
    body: optimize_stmts(body, heap).0,
    return_value,
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, Operator, Statement, Type, VariableName,
      BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    Heap,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, heap: &mut Heap, expected: &str) {
    let actual = super::super::local_value_numbering::optimize_function(super::optimize_function(
      Function {
        name: heap.alloc_str(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: stmts,
        return_value: ZERO,
      },
      heap,
    ))
    .body
    .iter()
    .map(|s| s.debug_print(heap))
    .join("\n");

    assert_eq!(expected, actual);
  }

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::IfElse {
        condition: Expression::var_name(heap.alloc_str("b"), BOOL_TYPE),
        s1: vec![
          Statement::binary(heap.alloc_str("ddddd"), Operator::PLUS, ONE, ONE),
          Statement::binary(heap.alloc_str("a"), Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str("ddd"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fff"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![
              Expression::var_name(heap.alloc_str("a"), INT_TYPE),
              Expression::var_name(heap.alloc_str("ddd"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        s2: vec![
          Statement::binary(heap.alloc_str("fd"), Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: heap.alloc_str("eee"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str("eeee"), INT_TYPE)),
            arguments: vec![
              Expression::var_name(heap.alloc_str("fd"), INT_TYPE),
              Expression::var_name(heap.alloc_str("eee"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        final_assignments: vec![],
      }],
      heap,
      r#"let _t12: int = 1 + 0;
let _t13: int = 0[3];
if (b: bool) {
  let ddddd: int = 1 + 1;
  fff((_t12: int), (_t13: int));
} else {
  (eeee: int)((_t12: int), (_t13: int));
}"#,
    );
  }
}
