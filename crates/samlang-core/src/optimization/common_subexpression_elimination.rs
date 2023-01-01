use super::{
  local_value_numbering,
  optimization_common::{
    BinaryBindedValue, BindedValue, IndexAccessBindedValue, ResourceAllocator,
  },
};
use crate::ast::hir::{Binary, Function, Statement};
use itertools::Itertools;
use std::{collections::BTreeSet, vec};

fn intersection_of(
  set1: BTreeSet<BindedValue>,
  others: Vec<BTreeSet<BindedValue>>,
) -> Vec<BindedValue> {
  set1.into_iter().filter(|e| others.iter().all(|it| it.contains(e))).sorted().collect()
}

fn produce_hoisted_stmt(allocator: &mut ResourceAllocator, value: BindedValue) -> Statement {
  match value {
    BindedValue::IndexedAccess(IndexAccessBindedValue { type_, pointer_expression, index }) => {
      Statement::IndexedAccess {
        name: allocator.alloc_cse_hoisted_temp(),
        type_,
        pointer_expression,
        index,
      }
    }
    BindedValue::Binary(BinaryBindedValue { operator, e1, e2 }) => Statement::Binary(
      Statement::binary_unwrapped(allocator.alloc_cse_hoisted_temp(), operator, e1, e2),
    ),
  }
}

fn optimize_stmt(
  stmt: Statement,
  allocator: &mut ResourceAllocator,
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
      let (s1, set1) = optimize_stmts(s1, allocator);
      let (s2, set2) = optimize_stmts(s2, allocator);
      let common_expressions = intersection_of(set1, vec![set2]);
      let mut hoisted_stmts = vec![];
      for binded_value in common_expressions {
        hoisted_stmts.append(&mut optimize_stmt(
          produce_hoisted_stmt(allocator, binded_value),
          allocator,
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
  allocator: &mut ResourceAllocator,
) -> (Vec<Statement>, BTreeSet<BindedValue>) {
  let mut set = BTreeSet::new();
  let mut collector = vec![];
  for stmt in stmts.into_iter().rev() {
    collector.append(&mut optimize_stmt(stmt, allocator, &mut set));
  }
  collector.reverse();
  (collector, set)
}

pub(super) fn optimize_function(function: Function, allocator: &mut ResourceAllocator) -> Function {
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  local_value_numbering::optimize_function(Function {
    name,
    parameters,
    type_parameters,
    type_,
    body: optimize_stmts(body, allocator).0,
    return_value,
  })
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, Operator, Statement, Type, VariableName,
      BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
    optimization::optimization_common::ResourceAllocator,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, expected: &str) {
    let actual = super::optimize_function(
      Function {
        name: rcs(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: stmts,
        return_value: ZERO,
      },
      &mut ResourceAllocator::new(),
    )
    .body
    .iter()
    .map(Statement::debug_print)
    .join("\n");

    assert_eq!(expected, actual);
  }

  #[test]
  fn integration_test() {
    assert_correctly_optimized(
      vec![Statement::IfElse {
        condition: Expression::var_name("b", BOOL_TYPE),
        s1: vec![
          Statement::binary("ddddd", Operator::PLUS, ONE, ONE),
          Statement::binary("a", Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: rcs("ddd"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fff",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![
              Expression::var_name("a", INT_TYPE),
              Expression::var_name("ddd", INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        s2: vec![
          Statement::binary("fd", Operator::PLUS, ONE, ZERO),
          Statement::IndexedAccess {
            name: rcs("eee"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3,
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new("eeee", INT_TYPE)),
            arguments: vec![
              Expression::var_name("fd", INT_TYPE),
              Expression::var_name("eee", INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        final_assignments: vec![],
      }],
      r#"let _cse_0_: int = 1 + 0;
let _cse_1_: int = 0[3];
if (b: bool) {
  let ddddd: int = 1 + 1;
  fff((_cse_0_: int), (_cse_1_: int));
} else {
  (eeee: int)((_cse_0_: int), (_cse_1_: int));
}"#,
    );
  }
}
