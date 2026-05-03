//! Scalar replacement of aggregates and closure devirtualization.
//!
//! When a struct is allocated and only accessed via `IndexedAccess` (never passed as
//! a value to another operation), the allocation and field reads can be eliminated by
//! tracking each field expression directly in a substitution map.
//!
//! The same idea applies to closures: when a closure is created and only ever called
//! (never passed as an argument), the `ClosureInit` + indirect `Call` through a variable
//! can be replaced by a direct `Call` to the underlying function with the context
//! inlined as the first argument.
//!
//! # Example (struct)
//!
//! Before:
//! ```text
//! StructInit  s = [42, x]
//! IndexedAccess v0 = s[0]
//! IndexedAccess v1 = s[1]
//! Binary        r  = v0 + v1
//! ```
//!
//! After:
//! ```text
//! Binary r = 42 + x
//! ```
//!
//! # Example (closure)
//!
//! Before:
//! ```text
//! ClosureInit  c = { fn: f, context: ctx }
//! Call         r = c(a1, a2)
//! ```
//!
//! After:
//! ```text
//! Call r = f(ctx, a1, a2)
//! ```

use samlang_ast::mir::{
  Binary, Callee, Expression, Function, FunctionNameExpression, GenenalLoopVariable,
  IfElseFinalAssignment, Statement,
};
use samlang_heap::PStr;
use std::collections::{HashMap, HashSet};

struct StructDefinition {
  fields: Vec<Expression>,
}

struct ClosureDefinition {
  function_name: FunctionNameExpression,
  context: Expression,
}

struct EscapeAnalysis {
  struct_definitions: HashMap<PStr, StructDefinition>,
  closure_definitions: HashMap<PStr, ClosureDefinition>,
  escaped: HashSet<PStr>,
}

impl EscapeAnalysis {
  fn new() -> Self {
    Self {
      struct_definitions: HashMap::new(),
      closure_definitions: HashMap::new(),
      escaped: HashSet::new(),
    }
  }

  fn mark_escape(&mut self, expression: &Expression) {
    if let Expression::Variable(variable) = expression {
      self.escaped.insert(variable.name);
    }
  }

  fn mark_escapes(&mut self, expressions: &[Expression]) {
    for expression in expressions {
      self.mark_escape(expression);
    }
  }

  fn visit_statements(&mut self, statements: &[Statement]) {
    for statement in statements {
      self.visit_statement(statement);
    }
  }

  fn visit_statement(&mut self, statement: &Statement) {
    match statement {
      Statement::IsPointer { name: _, pointer_type: _, operand }
      | Statement::Not { name: _, operand } => {
        self.mark_escape(operand);
      }
      Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
        self.mark_escape(e1);
        self.mark_escape(e2);
      }
      Statement::IndexedAccess { name: _, type_: _, pointer_expression: _, index: _ } => {}
      Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
        if let Callee::FunctionName(_) = callee {}
        self.mark_escapes(arguments);
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        self.mark_escape(condition);
        self.visit_statements(s1);
        self.visit_statements(s2);
        for IfElseFinalAssignment { name: _, type_: _, e1, e2 } in final_assignments {
          self.mark_escape(e1);
          self.mark_escape(e2);
        }
      }
      Statement::SingleIf { condition, invert_condition: _, statements } => {
        self.mark_escape(condition);
        self.visit_statements(statements);
      }
      Statement::Break(expression) => {
        self.mark_escape(expression);
      }
      Statement::While { loop_variables, statements, break_collector: _ } => {
        for GenenalLoopVariable { name: _, type_: _, initial_value, loop_value } in loop_variables {
          self.mark_escape(initial_value);
          self.mark_escape(loop_value);
        }
        self.visit_statements(statements);
      }
      Statement::Cast { name: _, type_: _, assigned_expression }
      | Statement::LateInitAssignment { name: _, assigned_expression } => {
        self.mark_escape(assigned_expression);
      }
      Statement::LateInitDeclaration { name: _, type_: _ } => {}
      Statement::StructInit { struct_variable_name, type_name: _, expression_list } => {
        self.mark_escapes(expression_list);
        self
          .struct_definitions
          .insert(*struct_variable_name, StructDefinition { fields: expression_list.clone() });
      }
      Statement::ClosureInit {
        closure_variable_name,
        closure_type_name: _,
        function_name,
        context,
      } => {
        self.mark_escape(context);
        self.closure_definitions.insert(
          *closure_variable_name,
          ClosureDefinition { function_name: function_name.clone(), context: *context },
        );
      }
    }
  }
}

fn resolve_expression(
  substitution: &HashMap<PStr, Expression>,
  expression: Expression,
) -> Expression {
  let Expression::Variable(variable) = expression else { return expression };
  let Some(&replacement) = substitution.get(&variable.name) else {
    return Expression::Variable(variable);
  };
  resolve_expression(substitution, replacement)
}

fn rewrite_statements(
  scalar_replacement_structs: &HashMap<PStr, StructDefinition>,
  scalar_replacement_closures: &HashMap<PStr, ClosureDefinition>,
  substitution: &mut HashMap<PStr, Expression>,
  statements: &[Statement],
  output: &mut Vec<Statement>,
) {
  for statement in statements {
    rewrite_statement(
      scalar_replacement_structs,
      scalar_replacement_closures,
      substitution,
      statement,
      output,
    );
  }
}

#[allow(clippy::only_used_in_recursion)]
fn rewrite_statement(
  scalar_replacement_structs: &HashMap<PStr, StructDefinition>,
  scalar_replacement_closures: &HashMap<PStr, ClosureDefinition>,
  substitution: &mut HashMap<PStr, Expression>,
  statement: &Statement,
  output: &mut Vec<Statement>,
) {
  match statement {
    Statement::IsPointer { name, pointer_type, operand } => {
      output.push(Statement::IsPointer {
        name: *name,
        pointer_type: *pointer_type,
        operand: resolve_expression(substitution, *operand),
      });
    }
    Statement::Not { name, operand } => {
      output
        .push(Statement::Not { name: *name, operand: resolve_expression(substitution, *operand) });
    }
    Statement::Binary(Binary { name, operator, e1, e2 }) => {
      output.push(Statement::Binary(Binary {
        name: *name,
        operator: *operator,
        e1: resolve_expression(substitution, *e1),
        e2: resolve_expression(substitution, *e2),
      }));
    }
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      if let Expression::Variable(variable) = pointer_expression {
        if let Some(definition) = scalar_replacement_structs.get(&variable.name) {
          substitution.insert(*name, resolve_expression(substitution, definition.fields[*index]));
        } else {
          output.push(Statement::IndexedAccess {
            name: *name,
            type_: *type_,
            pointer_expression: resolve_expression(substitution, *pointer_expression),
            index: *index,
          });
        }
      } else {
        output.push(Statement::IndexedAccess {
          name: *name,
          type_: *type_,
          pointer_expression: resolve_expression(substitution, *pointer_expression),
          index: *index,
        });
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => match callee {
      Callee::Variable(variable) if scalar_replacement_closures.contains_key(&variable.name) => {
        let definition = scalar_replacement_closures.get(&variable.name).unwrap();
        let function_name = definition.function_name.clone();
        let resolved_context = resolve_expression(substitution, definition.context);
        let mut direct_arguments = vec![resolved_context];
        for argument in arguments {
          direct_arguments.push(resolve_expression(substitution, *argument));
        }
        output.push(Statement::Call {
          callee: Callee::FunctionName(function_name),
          arguments: direct_arguments,
          return_type: *return_type,
          return_collector: *return_collector,
        });
      }
      Callee::Variable(variable) => {
        let resolved_callee = Callee::Variable(
          *resolve_expression(substitution, Expression::Variable(*variable)).as_variable().unwrap(),
        );
        let mut resolved_arguments = Vec::new();
        for argument in arguments {
          resolved_arguments.push(resolve_expression(substitution, *argument));
        }
        output.push(Statement::Call {
          callee: resolved_callee,
          arguments: resolved_arguments,
          return_type: *return_type,
          return_collector: *return_collector,
        });
      }
      Callee::FunctionName(function_name_expression) => {
        let resolved_callee = Callee::FunctionName(function_name_expression.clone());
        let mut resolved_arguments = Vec::new();
        for argument in arguments {
          resolved_arguments.push(resolve_expression(substitution, *argument));
        }
        output.push(Statement::Call {
          callee: resolved_callee,
          arguments: resolved_arguments,
          return_type: *return_type,
          return_collector: *return_collector,
        });
      }
    },
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let condition = resolve_expression(substitution, *condition);
      let mut then_statements = Vec::new();
      rewrite_statements(
        scalar_replacement_structs,
        scalar_replacement_closures,
        substitution,
        s1,
        &mut then_statements,
      );
      let mut else_statements = Vec::new();
      rewrite_statements(
        scalar_replacement_structs,
        scalar_replacement_closures,
        substitution,
        s2,
        &mut else_statements,
      );
      let mut new_final_assignments = Vec::new();
      for IfElseFinalAssignment { name, type_, e1, e2 } in final_assignments {
        new_final_assignments.push(IfElseFinalAssignment {
          name: *name,
          type_: *type_,
          e1: resolve_expression(substitution, *e1),
          e2: resolve_expression(substitution, *e2),
        });
      }
      output.push(Statement::IfElse {
        condition,
        s1: then_statements,
        s2: else_statements,
        final_assignments: new_final_assignments,
      });
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      let condition = resolve_expression(substitution, *condition);
      let mut rewritten_statements = Vec::new();
      rewrite_statements(
        scalar_replacement_structs,
        scalar_replacement_closures,
        substitution,
        statements,
        &mut rewritten_statements,
      );
      output.push(Statement::SingleIf {
        condition,
        invert_condition: *invert_condition,
        statements: rewritten_statements,
      });
    }
    Statement::Break(expression) => {
      output.push(Statement::Break(resolve_expression(substitution, *expression)));
    }
    Statement::While { loop_variables, statements, break_collector } => {
      let mut new_loop_variables = Vec::new();
      for GenenalLoopVariable { name, type_, initial_value, loop_value } in loop_variables {
        new_loop_variables.push(GenenalLoopVariable {
          name: *name,
          type_: *type_,
          initial_value: resolve_expression(substitution, *initial_value),
          loop_value: resolve_expression(substitution, *loop_value),
        });
      }
      let mut rewritten_statements = Vec::new();
      rewrite_statements(
        scalar_replacement_structs,
        scalar_replacement_closures,
        substitution,
        statements,
        &mut rewritten_statements,
      );
      output.push(Statement::While {
        loop_variables: new_loop_variables,
        statements: rewritten_statements,
        break_collector: *break_collector,
      });
    }
    Statement::Cast { name, type_, assigned_expression } => {
      output.push(Statement::Cast {
        name: *name,
        type_: *type_,
        assigned_expression: resolve_expression(substitution, *assigned_expression),
      });
    }
    Statement::LateInitDeclaration { name, type_ } => {
      output.push(Statement::LateInitDeclaration { name: *name, type_: *type_ });
    }
    Statement::LateInitAssignment { name, assigned_expression } => {
      output.push(Statement::LateInitAssignment {
        name: *name,
        assigned_expression: resolve_expression(substitution, *assigned_expression),
      });
    }
    Statement::StructInit { struct_variable_name, type_name, expression_list } => {
      if scalar_replacement_structs.contains_key(struct_variable_name) {
        // dropped
      } else {
        let mut resolved_fields = Vec::new();
        for expression in expression_list {
          resolved_fields.push(resolve_expression(substitution, *expression));
        }
        output.push(Statement::StructInit {
          struct_variable_name: *struct_variable_name,
          type_name: *type_name,
          expression_list: resolved_fields,
        });
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type_name, function_name, context } => {
      if scalar_replacement_closures.contains_key(closure_variable_name) {
        // dropped
      } else {
        output.push(Statement::ClosureInit {
          closure_variable_name: *closure_variable_name,
          closure_type_name: *closure_type_name,
          function_name: function_name.clone(),
          context: resolve_expression(substitution, *context),
        });
      }
    }
  }
}

pub(super) fn optimize_function(function: &mut Function) {
  let mut analysis = EscapeAnalysis::new();
  analysis.visit_statements(&function.body);
  analysis.mark_escape(&function.return_value);

  let scalar_replacement_structs: HashMap<PStr, StructDefinition> = analysis
    .struct_definitions
    .into_iter()
    .filter(|(name, _)| !analysis.escaped.contains(name))
    .collect();
  let scalar_replacement_closures: HashMap<PStr, ClosureDefinition> = analysis
    .closure_definitions
    .into_iter()
    .filter(|(name, _)| !analysis.escaped.contains(name))
    .collect();

  if scalar_replacement_structs.is_empty() && scalar_replacement_closures.is_empty() {
    return;
  }

  let mut substitution = HashMap::new();
  let mut new_body = Vec::new();
  rewrite_statements(
    &scalar_replacement_structs,
    &scalar_replacement_closures,
    &mut substitution,
    &function.body,
    &mut new_body,
  );
  function.body = new_body;
  function.return_value = resolve_expression(&substitution, function.return_value);
}
