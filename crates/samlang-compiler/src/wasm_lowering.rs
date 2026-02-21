use itertools::Itertools;
use samlang_ast::{hir, lir, mir, wasm};
use samlang_heap::{Heap, ModuleReference, PStr};
use std::collections::{BTreeMap, HashMap};

struct TypeLoweringContext<'a> {
  function_type_mapping: HashMap<wasm::FunctionType, mir::TypeNameId>,
  heap: &'a mut Heap,
  table: mir::SymbolTable,
}

impl<'a> TypeLoweringContext<'a> {
  fn new(heap: &'a mut Heap, table: mir::SymbolTable) -> TypeLoweringContext<'a> {
    TypeLoweringContext { function_type_mapping: HashMap::new(), heap, table }
  }

  fn name_function_type(&mut self, function_type: &wasm::FunctionType) -> mir::TypeNameId {
    if let Some(existing) = self.function_type_mapping.get(function_type) {
      *existing
    } else {
      let temp_type_name = self.heap.alloc_temp_str();
      let type_id = self.table.create_simple_type_name(ModuleReference::ROOT, temp_type_name);
      self.function_type_mapping.insert(function_type.clone(), type_id);
      type_id
    }
  }

  fn lower_function_type(&mut self, function_type: &lir::FunctionType) -> mir::TypeNameId {
    let wasm_f = wasm::FunctionType {
      argument_types: function_type.argument_types.iter().map(|t| self.lower(t)).collect(),
      return_type: Box::new(self.lower(&function_type.return_type)),
    };
    self.name_function_type(&wasm_f)
  }

  fn lower(&mut self, t: &lir::Type) -> wasm::Type {
    match t {
      lir::Type::Int32 => wasm::Type::Int32,
      lir::Type::Int31 => wasm::Type::Int31,
      lir::Type::AnyPointer => wasm::Type::Eq,
      lir::Type::Id(type_name_id) => wasm::Type::Reference(*type_name_id),
      // Function types are represented as i32 (function table indices)
      lir::Type::Fn(_function_type) => wasm::Type::Int32,
    }
  }
}

#[derive(Clone, Copy)]
struct LoopContext {
  break_collector: Option<PStr>,
  break_collector_type: Option<wasm::Type>,
  exit_label: wasm::LabelId,
}

fn is_reference_expr(e: &lir::Expression) -> bool {
  match e {
    lir::Expression::Int31Literal(_) => true,
    lir::Expression::Variable(_, t) => {
      matches!(t, lir::Type::Int31 | lir::Type::AnyPointer | lir::Type::Id(_) | lir::Type::Fn(_))
    }
    lir::Expression::StringName(_) => true,
    lir::Expression::Int32Literal(_) | lir::Expression::FnName(_, _) => false,
  }
}

struct LoweringManager<'a> {
  label_id: u32,
  type_cx: TypeLoweringContext<'a>,
  loop_cx: Option<LoopContext>,
  local_variables: BTreeMap<PStr, wasm::Type>,
  string_name_mapping: &'a HashMap<PStr, PStr>,
  function_index_mapping: &'a HashMap<mir::FunctionName, usize>,
  /// Maps type name ID to its field types (for StructInit lowering)
  type_field_mappings: &'a HashMap<mir::TypeNameId, Vec<wasm::Type>>,
}

impl<'a> LoweringManager<'a> {
  fn lower_fn(
    mut type_cx: TypeLoweringContext<'a>,
    string_name_mapping: &'a HashMap<PStr, PStr>,
    function_index_mapping: &'a HashMap<mir::FunctionName, usize>,
    type_field_mappings: &'a HashMap<mir::TypeNameId, Vec<wasm::Type>>,
    function: &lir::Function,
  ) -> (wasm::Function, TypeLoweringContext<'a>) {
    // Pre-populate local_variables with parameter types so we can detect type mismatches
    // when parameters are used with different types (e.g., AnyPointer param used as specific struct)
    let mut param_types: BTreeMap<PStr, wasm::Type> = BTreeMap::new();
    for (n, t) in function.parameters.iter().zip(&function.type_.argument_types) {
      param_types.insert(*n, type_cx.lower(t));
    }
    let mut instance = LoweringManager {
      label_id: 0,
      type_cx,
      loop_cx: None,
      local_variables: param_types,
      string_name_mapping,
      function_index_mapping,
      type_field_mappings,
    };
    let mut instructions =
      function.body.iter().flat_map(|it| instance.lower_stmt(it)).collect_vec();
    let return_value_expr = instance.lower_expr(&function.return_value);
    // Wrap return value with ref.as_non_null for reference types since locals are nullable
    let return_type = instance.type_cx.lower(&function.type_.return_type);
    let return_value_expr =
      if matches!(return_type, wasm::Type::Int31 | wasm::Type::Eq | wasm::Type::Reference(_)) {
        wasm::InlineInstruction::RefAsNonNull(Box::new(return_value_expr))
      } else {
        return_value_expr
      };
    instructions.push(wasm::Instruction::Inline(return_value_expr));
    let mut parameters = Vec::new();
    for (n, t) in function.parameters.iter().zip(&function.type_.argument_types) {
      instance.local_variables.remove(n);
      parameters.push((*n, instance.type_cx.lower(t)));
    }
    let local_variables = instance.local_variables.into_iter().collect_vec();
    let return_type = instance.type_cx.lower(&function.type_.return_type);
    // For closure functions (first param named "_this"), get the explicit type name.
    // This is needed for call_indirect to work correctly - the function's type must
    // match the type used in call_indirect exactly.
    let type_name = if function.parameters.first() == Some(&PStr::UNDERSCORE_THIS) {
      Some(instance.type_cx.lower_function_type(&function.type_))
    } else {
      None
    };
    let f = wasm::Function {
      name: function.name,
      type_name,
      parameters,
      return_type,
      local_variables,
      instructions,
    };
    (f, instance.type_cx)
  }

  fn lower_stmt(&mut self, s: &lir::Statement) -> Vec<wasm::Instruction> {
    match s {
      lir::Statement::IsPointer { name, pointer_type, operand } => {
        let lowered_operand = Box::new(self.lower_expr(operand));
        vec![wasm::Instruction::Inline(self.set(
          *name,
          wasm::Type::Int32,
          wasm::InlineInstruction::IsPointer {
            pointer_type: lir::Type::Id(*pointer_type),
            value: lowered_operand,
          },
        ))]
      }
      lir::Statement::Not { name, operand } => {
        let operand = Box::new(self.lower_expr(operand));
        vec![wasm::Instruction::Inline(self.set(
          *name,
          wasm::Type::Int32,
          wasm::InlineInstruction::Binary {
            v1: operand,
            op: hir::BinaryOperator::XOR,
            v2: Box::new(wasm::InlineInstruction::Const(1)),
            is_ref_comparison: false,
          },
        ))]
      }
      lir::Statement::Binary { name, operator, e1, e2 } => {
        let i1 = Box::new(self.lower_expr(e1));
        let i2 = Box::new(self.lower_expr(e2));
        let is_ref_comparison =
          matches!(operator, hir::BinaryOperator::EQ | hir::BinaryOperator::NE)
            && (is_reference_expr(e1) || is_reference_expr(e2));
        vec![wasm::Instruction::Inline(self.set(
          *name,
          wasm::Type::Int32,
          wasm::InlineInstruction::Binary { v1: i1, op: *operator, v2: i2, is_ref_comparison },
        ))]
      }
      lir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let (struct_ref, struct_type) = self.lower_expr_with_reference_type(pointer_expression);
        let result_type = self.type_cx.lower(type_);
        vec![wasm::Instruction::Inline(self.set(
          *name,
          result_type,
          wasm::InlineInstruction::StructLoad {
            index: *index,
            struct_type,
            struct_ref: Box::new(struct_ref),
          },
        ))]
      }
      lir::Statement::Call { callee, arguments, return_type, return_collector } => {
        // Check if this is a call to a builtin that expects (ref eq) as the first arg
        let (needs_ref_eq_this, is_panic) = if let lir::Expression::FnName(name, _) = callee {
          // PROCESS_PRINTLN and PROCESS_PANIC take (ref eq) as first arg
          // STR_FROM_INT takes (ref eq) as first arg
          let needs_ref_eq = name.type_name == mir::TypeNameId::PROCESS
            || (*name == mir::FunctionName::STR_FROM_INT);
          let is_panic = *name == mir::FunctionName::PROCESS_PANIC;
          (needs_ref_eq, is_panic)
        } else {
          (false, false)
        };
        let argument_instructions = arguments
          .iter()
          .enumerate()
          .map(|(i, arg)| {
            let lowered = self.lower_expr(arg);
            // The first argument (this/self) to builtin methods should be (ref eq), not i32.
            // When ZERO is used as a placeholder, it comes as Int32Literal(0) but needs to be i31.
            if i == 0 && needs_ref_eq_this && matches!(arg, lir::Expression::Int32Literal(0)) {
              wasm::InlineInstruction::I31New(Box::new(lowered))
            } else {
              lowered
            }
          })
          .collect_vec();
        let call = if let lir::Expression::FnName(name, _) = callee {
          wasm::InlineInstruction::DirectCall(*name, argument_instructions)
        } else {
          wasm::InlineInstruction::IndirectCall {
            function_index: Box::new(self.lower_expr(callee)),
            function_type_name: self
              .type_cx
              .lower_function_type(callee.as_variable().unwrap().1.as_fn().unwrap()),
            arguments: argument_instructions,
          }
        };
        // For panic calls: drop the result and add unreachable (panic never returns)
        // This is necessary because panic returns i32 but the LIR might expect any type
        if is_panic {
          let mut result =
            vec![wasm::Instruction::Inline(wasm::InlineInstruction::Drop(Box::new(call)))];
          result.push(wasm::Instruction::Inline(wasm::InlineInstruction::Unreachable));
          // Still register the return collector with the expected type for local declaration
          if let Some(c) = return_collector {
            let ret_type = self.type_cx.lower(return_type);
            self.local_variables.insert(*c, ret_type);
          }
          result
        } else {
          let stmt = if let Some(c) = return_collector {
            let ret_type = self.type_cx.lower(return_type);
            self.set(*c, ret_type, call)
          } else {
            wasm::InlineInstruction::Drop(Box::new(call))
          };
          vec![wasm::Instruction::Inline(stmt)]
        }
      }
      lir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        let condition = self.lower_expr(condition);
        let mut s1 = s1.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        let mut s2 = s2.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        for (n, t, e1, e2) in final_assignments {
          let wasm_type = self.type_cx.lower(t);
          let e1 = self.lower_expr(e1);
          let e2 = self.lower_expr(e2);
          s1.push(wasm::Instruction::Inline(self.set(*n, wasm_type, e1)));
          s2.push(wasm::Instruction::Inline(self.set(*n, wasm_type, e2)));
        }
        if s1.is_empty() {
          if s2.is_empty() {
            Vec::new()
          } else {
            vec![wasm::Instruction::IfElse {
              condition: wasm::InlineInstruction::Binary {
                v1: Box::new(condition),
                op: hir::BinaryOperator::XOR,
                v2: Box::new(wasm::InlineInstruction::Const(1)),
                is_ref_comparison: false,
              },
              s1: s2,
              s2: Vec::new(),
            }]
          }
        } else {
          vec![wasm::Instruction::IfElse { condition, s1, s2 }]
        }
      }
      lir::Statement::SingleIf { condition, invert_condition, statements } => {
        let mut condition = self.lower_expr(condition);
        if *invert_condition {
          condition = wasm::InlineInstruction::Binary {
            v1: Box::new(condition),
            op: hir::BinaryOperator::XOR,
            v2: Box::new(wasm::InlineInstruction::Const(1)),
            is_ref_comparison: false,
          };
        }
        vec![wasm::Instruction::IfElse {
          condition,
          s1: statements.iter().flat_map(|it| self.lower_stmt(it)).collect(),
          s2: Vec::new(),
        }]
      }
      lir::Statement::Break(e) => {
        let LoopContext { break_collector, break_collector_type, exit_label } =
          self.loop_cx.as_ref().unwrap();
        let exit_label = *exit_label;
        let break_collector = *break_collector;
        let break_collector_type = *break_collector_type;
        if let Some(c) = break_collector {
          let e = self.lower_expr(e);
          let t = break_collector_type.unwrap();
          vec![
            wasm::Instruction::Inline(self.set(c, t, e)),
            wasm::Instruction::UnconditionalJump(exit_label),
          ]
        } else {
          vec![wasm::Instruction::UnconditionalJump(exit_label)]
        }
      }
      lir::Statement::While { loop_variables, statements, break_collector } => {
        let saved_current_loop_cx = self.loop_cx;
        let continue_label = self.alloc_label_with_annot();
        let exit_label = self.alloc_label_with_annot();
        self.loop_cx = Some(LoopContext {
          break_collector: if let Some((n, _)) = break_collector { Some(*n) } else { None },
          break_collector_type: break_collector.as_ref().map(|(_, t)| self.type_cx.lower(t)),
          exit_label,
        });
        let mut instructions = loop_variables
          .iter()
          .map(|it| {
            let t = self.type_cx.lower(&it.type_);
            let e = self.lower_expr(&it.initial_value);
            wasm::Instruction::Inline(self.set(it.name, t, e))
          })
          .collect_vec();
        let mut loop_instructions =
          statements.iter().flat_map(|it| self.lower_stmt(it)).collect_vec();
        for v in loop_variables {
          let t = self.type_cx.lower(&v.type_);
          let e = self.lower_expr(&v.loop_value);
          loop_instructions.push(wasm::Instruction::Inline(self.set(v.name, t, e)));
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
      lir::Statement::Cast { name, type_, assigned_expression } => {
        let t = self.type_cx.lower(type_);
        let assigned = self.lower_expr(assigned_expression);
        // For WASM GC, we need ref.cast when downcasting from a supertype to a subtype.
        // This includes:
        // - Casting from AnyPointer (ref eq) to a specific struct type
        // - Casting from a parent enum type to one of its variant subtypes
        let source_type = match assigned_expression {
          lir::Expression::Variable(_, src_t) => Some(src_t),
          _ => None,
        };
        let needs_ref_cast = source_type.is_some_and(|src_t| {
          // Casting from any reference type to a specific struct type needs ref.cast
          // This handles both:
          // - Casting from AnyPointer (ref eq) to a specific struct type
          // - Casting from a parent enum type to one of its variant subtypes
          let is_ref_src = matches!(src_t, lir::Type::AnyPointer | lir::Type::Id(_));
          let is_ref_target = matches!(type_, lir::Type::Id(_));
          is_ref_src && is_ref_target
        });
        let assigned = if needs_ref_cast {
          wasm::InlineInstruction::Cast { pointer_type: type_.clone(), value: Box::new(assigned) }
        } else {
          assigned
        };
        vec![wasm::Instruction::Inline(self.set(*name, t, assigned))]
      }
      lir::Statement::LateInitAssignment { name, assigned_expression } => {
        // For late init, the type was already declared, so we just get it from the expression
        let assigned = self.lower_expr(assigned_expression);
        // The type should already be in local_variables from LateInitDeclaration
        let t = self.local_variables.get(name).copied().unwrap_or(wasm::Type::Int32);
        vec![wasm::Instruction::Inline(self.set(*name, t, assigned))]
      }
      lir::Statement::LateInitDeclaration { name, type_ } => {
        // Just register the type, no WASM instruction needed
        let t = self.type_cx.lower(type_);
        self.local_variables.insert(*name, t);
        Vec::new()
      }
      lir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_ref = self.type_cx.lower(type_).into_reference().unwrap();
        // Get field types to check if any field expects a reference type
        let field_types = self.type_field_mappings.get(&type_ref);
        let mut wasm_expression_list = Vec::with_capacity(expression_list.len());
        for (i, e) in expression_list.iter().enumerate() {
          let lowered = self.lower_expr(e);
          // If the field expects a reference type and we have Int32Literal(0), wrap with ref.i31
          let needs_i31 = if let Some(fields) = field_types {
            if let Some(field_type) = fields.get(i) {
              matches!(e, lir::Expression::Int32Literal(0))
                && matches!(
                  field_type,
                  wasm::Type::Int31 | wasm::Type::Eq | wasm::Type::Reference(_)
                )
            } else {
              false
            }
          } else {
            false
          };
          if needs_i31 {
            wasm_expression_list.push(wasm::InlineInstruction::I31New(Box::new(lowered)));
          } else {
            wasm_expression_list.push(lowered);
          }
        }
        vec![wasm::Instruction::Inline(self.set(
          *struct_variable_name,
          wasm::Type::Reference(type_ref),
          wasm::InlineInstruction::StructInit {
            type_: type_ref,
            expression_list: wasm_expression_list,
          },
        ))]
      }
    }
  }

  fn lower_expr(&mut self, e: &lir::Expression) -> wasm::InlineInstruction {
    match e {
      lir::Expression::Int32Literal(v) => wasm::InlineInstruction::Const(*v),
      lir::Expression::Int31Literal(v) => {
        wasm::InlineInstruction::I31New(Box::new(wasm::InlineInstruction::Const(*v)))
      }
      lir::Expression::Variable(n, t) => {
        let t = self.type_cx.lower(t);
        // Don't override existing type (e.g., if it was set to AnyPointer, keep it)
        if self.local_variables.contains_key(n) {
          self.get_without_type_update(*n)
        } else {
          self.get(*n, t)
        }
      }
      lir::Expression::StringName(n) => {
        let global_name = self.string_name_mapping.get(n).unwrap();
        wasm::InlineInstruction::GlobalGet(*global_name)
      }
      lir::Expression::FnName(n, _) => {
        let index = self.function_index_mapping.get(n).unwrap();
        wasm::InlineInstruction::Const(i32::try_from(*index).unwrap())
      }
    }
  }

  fn lower_expr_with_reference_type(
    &mut self,
    e: &lir::Expression,
  ) -> (wasm::InlineInstruction, mir::TypeNameId) {
    match e {
      lir::Expression::Int32Literal(_) => {
        panic!("Int32Literal in place that expects struct typed values.")
      }
      lir::Expression::Int31Literal(_) => {
        panic!("Int31Literal in place that expects struct typed values.")
      }
      lir::Expression::Variable(n, t) => {
        let lowered_type = self.type_cx.lower(t);
        let ref_type =
          lowered_type.into_reference().expect("The given expression doesn't have reference type.");
        // Get the stored type (parameter or local) to check if we need a cast
        let stored_type = self.local_variables.get(n).copied();
        let local_get = if stored_type.is_some() {
          self.get_without_type_update(*n)
        } else {
          self.get(*n, lowered_type)
        };
        // Cast is needed when the stored/declared type is Eq (AnyPointer) but we need a specific struct type
        let instruction = if matches!(stored_type, Some(wasm::Type::Eq)) {
          wasm::InlineInstruction::Cast {
            pointer_type: lir::Type::Id(ref_type),
            value: Box::new(local_get),
          }
        } else {
          local_get
        };
        (instruction, ref_type)
      }
      lir::Expression::StringName(n) => {
        let global_name = self.string_name_mapping.get(n).unwrap();
        (wasm::InlineInstruction::GlobalGet(*global_name), mir::TypeNameId::STR)
      }
      lir::Expression::FnName(_, _) => {
        panic!("FnName in place that expects struct typed values.")
      }
    }
  }

  fn alloc_label_with_annot(&mut self) -> wasm::LabelId {
    let label = wasm::LabelId(self.label_id);
    self.label_id += 1;
    label
  }

  fn get(&mut self, n: PStr, type_: wasm::Type) -> wasm::InlineInstruction {
    self.local_variables.insert(n, type_);
    let local_get = wasm::InlineInstruction::LocalGet(n);
    match type_ {
      wasm::Type::Int31 | wasm::Type::Eq | wasm::Type::Reference(_) => {
        wasm::InlineInstruction::RefAsNonNull(Box::new(local_get))
      }
      wasm::Type::Int32 => local_get,
    }
  }

  /// Get a local without updating its type. Used when we need to read a variable
  /// but don't want to change its declared type (e.g., when a local was declared
  /// with AnyPointer but used with a more specific type).
  fn get_without_type_update(&self, n: PStr) -> wasm::InlineInstruction {
    let local_get = wasm::InlineInstruction::LocalGet(n);
    if let Some(type_) = self.local_variables.get(&n)
      && matches!(type_, wasm::Type::Int31 | wasm::Type::Eq | wasm::Type::Reference(_))
    {
      return wasm::InlineInstruction::RefAsNonNull(Box::new(local_get));
    }
    local_get
  }

  fn set(&mut self, n: PStr, t: wasm::Type, v: wasm::InlineInstruction) -> wasm::InlineInstruction {
    self.local_variables.insert(n, t);
    wasm::InlineInstruction::LocalSet(n, Box::new(v))
  }
}

pub(super) fn compile_lir_to_wasm(heap: &mut Heap, sources: lir::Sources) -> wasm::Module {
  let lir::Sources {
    symbol_table: source_symbol_table,
    global_variables: source_global_variables,
    type_definitions: source_type_definitions,
    main_function_names: exported_functions,
    functions: source_functions,
  } = sources;

  // Build a single data segment containing all string bytes, then create GC globals
  // that use array.new_data to reference portions of this segment.
  let mut string_name_mapping = HashMap::new();
  let mut gc_string_globals = Vec::new();
  let mut function_index_mapping = HashMap::new();

  // Collect all string bytes into a single data segment
  let mut data_segment_bytes = Vec::new();
  for (idx, hir::GlobalString(content)) in source_global_variables.iter().enumerate() {
    let content_str = content.as_str(heap);
    let offset = data_segment_bytes.len();
    let length = content_str.len();
    data_segment_bytes.extend_from_slice(content_str.as_bytes());
    // Create a unique global name for this string (GLOBAL_STRING_0, GLOBAL_STRING_1, ...)
    let global_name = heap.alloc_string(format!("GLOBAL_STRING_{idx}"));
    string_name_mapping.insert(*content, global_name);
    gc_string_globals.push(wasm::GlobalGcString {
      name: global_name,
      data_segment_index: 2, // Use $d2 since libsam.wat uses $d0 and $d1
      offset,
      length,
    });
  }

  // Create data segment if there are any strings (even empty ones need the segment to exist)
  let global_variables = if gc_string_globals.is_empty() {
    Vec::new()
  } else {
    vec![wasm::GlobalData { constant_pointer: 4096, bytes: data_segment_bytes }]
  };
  for (i, f) in source_functions.iter().enumerate() {
    function_index_mapping.insert(f.name, i);
  }
  let mut type_cx = TypeLoweringContext::new(heap, source_symbol_table);
  let mut type_definitions = Vec::with_capacity(source_type_definitions.len());
  let mut type_field_mappings: HashMap<mir::TypeNameId, Vec<wasm::Type>> = HashMap::new();
  for lir::TypeDefinition { name, parent_type, is_extensible, mappings } in &source_type_definitions
  {
    // Skip the STR type - it's the builtin $_Str GC array, not a struct
    if *name == mir::TypeNameId::STR {
      continue;
    }
    let wasm_mappings = mappings.iter().map(|t| type_cx.lower(t)).collect_vec();
    type_field_mappings.insert(*name, wasm_mappings.clone());
    type_definitions.push(wasm::TypeDefinition {
      name: *name,
      parent_type: *parent_type,
      is_extensible: *is_extensible,
      mappings: wasm_mappings,
    });
  }
  let mut functions = Vec::new();
  for f in &source_functions {
    let (f, new_type_cx) = LoweringManager::lower_fn(
      type_cx,
      &string_name_mapping,
      &function_index_mapping,
      &type_field_mappings,
      f,
    );
    type_cx = new_type_cx;
    functions.push(f);
  }
  let TypeLoweringContext { function_type_mapping, heap: _, table: symbol_table } = type_cx;
  let function_type_mapping = function_type_mapping.into_iter().map(|(t, n)| (n, t)).collect_vec();
  wasm::Module {
    symbol_table,
    function_type_mapping,
    type_definitions,
    global_variables,
    gc_string_globals,
    exported_functions,
    functions,
  }
}

#[cfg(test)]
mod tests {
  use std::collections::{BTreeMap, HashMap};

  use super::{LoweringManager, TypeLoweringContext};
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::{BinaryOperator, GlobalString},
    lir::{
      self, Expression, Function, FunctionType, GenenalLoopVariable, INT_31_TYPE, INT_32_TYPE,
      Sources, Statement, ZERO,
    },
    mir, wasm,
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    assert!(
      super::LoopContext {
        break_collector: None,
        break_collector_type: None,
        exit_label: wasm::LabelId(1)
      }
      .break_collector
      .is_none()
    );

    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let mut m = wasm::Module {
      symbol_table: mir::SymbolTable::new(),
      function_type_mapping: Vec::new(),
      type_definitions: vec![wasm::TypeDefinition {
        name: symbol_table.create_type_name_for_test(PStr::UPPER_F),
        parent_type: None,
        is_extensible: false,
        mappings: vec![
          wasm::Type::Int32,
          wasm::Type::Int31,
          wasm::Type::Reference(symbol_table.create_type_name_for_test(PStr::UPPER_F)),
        ],
      }],
      global_variables: vec![wasm::GlobalData {
        constant_pointer: 100,
        bytes: vec![0xDE, 0xAD, 0xBE, 0xEF],
      }],
      gc_string_globals: Vec::new(),
      exported_functions: Vec::new(),
      functions: vec![wasm::Function {
        name: mir::FunctionName::PROCESS_PRINTLN,
        type_name: None,
        parameters: Vec::new(),
        return_type: wasm::Type::Int32,
        local_variables: vec![(heap.alloc_str_for_test("local_i31"), wasm::Type::Int31)],
        instructions: vec![wasm::Instruction::Inline(wasm::InlineInstruction::IsPointer {
          pointer_type: lir::Type::Int32,
          value: Box::new(wasm::InlineInstruction::StructInit {
            type_: symbol_table.create_type_name_for_test(PStr::UPPER_F),
            expression_list: vec![
              wasm::InlineInstruction::Cast {
                pointer_type: lir::Type::Int32,
                value: Box::new(wasm::InlineInstruction::Const(0)),
              },
              wasm::InlineInstruction::StructLoad {
                index: 0,
                struct_type: symbol_table.create_type_name_for_test(PStr::UPPER_F),
                struct_ref: Box::new(wasm::InlineInstruction::Const(0)),
              },
              wasm::InlineInstruction::StructStore {
                index: 0,
                struct_type: symbol_table.create_type_name_for_test(PStr::UPPER_F),
                struct_ref: Box::new(wasm::InlineInstruction::Const(0)),
                assigned: Box::new(wasm::InlineInstruction::Const(0)),
              },
              wasm::InlineInstruction::GlobalGet(heap.alloc_str_for_test("test_global")),
              wasm::InlineInstruction::I31GetS(Box::new(wasm::InlineInstruction::Const(0))),
              wasm::InlineInstruction::RefAsNonNull(Box::new(wasm::InlineInstruction::Const(0))),
              wasm::InlineInstruction::Unreachable,
              wasm::InlineInstruction::Binary {
                v1: Box::new(wasm::InlineInstruction::Const(0)),
                op: BinaryOperator::EQ,
                v2: Box::new(wasm::InlineInstruction::Const(0)),
                is_ref_comparison: true,
              },
              wasm::InlineInstruction::Binary {
                v1: Box::new(wasm::InlineInstruction::Const(0)),
                op: BinaryOperator::NE,
                v2: Box::new(wasm::InlineInstruction::Const(0)),
                is_ref_comparison: true,
              },
            ],
          }),
        })],
      }],
    };
    m.symbol_table = symbol_table;
    m.pretty_print(heap);
  }

  #[should_panic]
  #[test]
  fn invalid_lower_expr_with_reference_type_test1() {
    let mut heap = Heap::new();
    let type_cx = TypeLoweringContext::new(&mut heap, mir::SymbolTable::new());
    LoweringManager {
      label_id: 1,
      type_cx,
      loop_cx: None,
      local_variables: BTreeMap::new(),
      string_name_mapping: &HashMap::new(),
      function_index_mapping: &HashMap::new(),
      type_field_mappings: &HashMap::new(),
    }
    .lower_expr_with_reference_type(&Expression::Int32Literal(0));
  }

  #[should_panic]
  #[test]
  fn invalid_lower_expr_with_reference_type_test2() {
    let mut heap = Heap::new();
    let type_cx = TypeLoweringContext::new(&mut heap, mir::SymbolTable::new());
    LoweringManager {
      label_id: 1,
      type_cx,
      loop_cx: None,
      local_variables: BTreeMap::new(),
      string_name_mapping: &HashMap::new(),
      function_index_mapping: &HashMap::new(),
      type_field_mappings: &HashMap::new(),
    }
    .lower_expr_with_reference_type(&Expression::Int31Literal(0));
  }

  #[should_panic]
  #[test]
  fn invalid_lower_expr_with_reference_type_test3() {
    let mut heap = Heap::new();
    let type_cx = TypeLoweringContext::new(&mut heap, mir::SymbolTable::new());
    LoweringManager {
      label_id: 1,
      type_cx,
      loop_cx: None,
      local_variables: BTreeMap::new(),
      string_name_mapping: &HashMap::new(),
      function_index_mapping: &HashMap::new(),
      type_field_mappings: &HashMap::new(),
    }
    .lower_expr_with_reference_type(&Expression::FnName(
      mir::FunctionName::new_for_test(PStr::LOWER_K),
      FunctionType { argument_types: Vec::new(), return_type: Box::new(INT_32_TYPE) },
    ));
  }

  #[test]
  fn type_lowering_test() {
    let mut heap = Heap::new();
    let mut type_cx = TypeLoweringContext::new(&mut heap, mir::SymbolTable::new());

    type_cx.lower(&lir::Type::new_fn(vec![INT_32_TYPE, INT_31_TYPE], INT_32_TYPE));
    assert_eq!(type_cx.lower(&INT_31_TYPE), wasm::Type::Int31);
  }

  #[test]
  fn struct_init_with_extra_fields_test() {
    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let test_struct_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("TestStruct"));

    let sources = Sources {
      symbol_table,
      global_variables: vec![],
      type_definitions: vec![lir::TypeDefinition {
        name: test_struct_type,
        parent_type: None,
        is_extensible: false,
        mappings: vec![lir::ANY_POINTER_TYPE],
      }],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_: lir::Type::Id(test_struct_type),
          expression_list: vec![ZERO, ZERO],
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    assert!(actual.contains("(struct.new $_TestStruct"));
  }

  #[test]
  fn indexed_access_with_string_name_test() {
    let heap = &mut Heap::new();
    let sources = Sources {
      symbol_table: mir::SymbolTable::new(),
      global_variables: vec![GlobalString(heap.alloc_str_for_test("FOO"))],
      type_definitions: vec![],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::IndexedAccess {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
          pointer_expression: lir::Expression::StringName(heap.alloc_str_for_test("FOO")),
          index: 0,
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    assert!(actual.contains("struct.get"));
  }

  #[test]
  fn struct_init_without_type_definition_test() {
    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let undefined_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("UndefinedType"));

    let sources = Sources {
      symbol_table,
      global_variables: vec![],
      type_definitions: vec![],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_: lir::Type::Id(undefined_type),
          expression_list: vec![ZERO],
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    assert!(actual.contains("struct.new"));
  }

  #[test]
  fn get_non_reference_type_test() {
    let heap = &mut Heap::new();
    let sources = Sources {
      symbol_table: mir::SymbolTable::new(),
      global_variables: vec![],
      type_definitions: vec![],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![],
        return_value: Expression::Variable(heap.alloc_str_for_test("undefined_var"), INT_32_TYPE),
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    assert!(actual.contains("$undefined_var"));
  }

  #[test]
  fn panic_without_return_collector_test() {
    let heap = &mut Heap::new();
    let sources = Sources {
      symbol_table: mir::SymbolTable::new(),
      global_variables: vec![],
      type_definitions: vec![],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Call {
          callee: Expression::FnName(
            mir::FunctionName::PROCESS_PANIC,
            lir::Type::new_fn_unwrapped(vec![lir::ANY_POINTER_TYPE], INT_32_TYPE),
          ),
          arguments: vec![ZERO],
          return_type: INT_32_TYPE,
          return_collector: None, // No return collector for panic
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    // Panic calls should have drop and unreachable
    assert!(actual.contains("drop"));
    assert!(actual.contains("unreachable"));
  }

  #[test]
  fn cast_with_reference_variable_test() {
    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let test_struct_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("TestStruct"));

    let sources = Sources {
      symbol_table,
      global_variables: vec![],
      type_definitions: vec![lir::TypeDefinition {
        name: test_struct_type,
        parent_type: None,
        is_extensible: false,
        mappings: vec![INT_32_TYPE],
      }],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Cast {
          name: heap.alloc_str_for_test("casted"),
          type_: lir::Type::Id(test_struct_type),
          // Variable with AnyPointer type - this should trigger ref.cast
          assigned_expression: Expression::Variable(
            heap.alloc_str_for_test("any_ptr"),
            lir::ANY_POINTER_TYPE,
          ),
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    // Cast from AnyPointer to struct type should use ref.cast
    assert!(actual.contains("ref.cast"));
  }

  #[test]
  fn cast_with_non_reference_variable_test() {
    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let test_struct_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("TestStruct"));

    let sources = Sources {
      symbol_table,
      global_variables: vec![],
      type_definitions: vec![lir::TypeDefinition {
        name: test_struct_type,
        parent_type: None,
        is_extensible: false,
        mappings: vec![INT_32_TYPE],
      }],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: lir::Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Cast {
          name: heap.alloc_str_for_test("casted"),
          type_: lir::Type::Id(test_struct_type),
          // Variable with Int32 type - this should NOT trigger ref.cast
          assigned_expression: Expression::Variable(
            heap.alloc_str_for_test("int_var"),
            INT_32_TYPE,
          ),
        }],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    // Cast from Int32 to struct should NOT use ref.cast
    assert!(!actual.contains("ref.cast"));
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let mut symbol_table = mir::SymbolTable::new();
    // Create a test struct type for struct operations (not STR which is a GC array)
    let test_struct_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("TestStruct"));

    // Create a struct with an AnyPointer field to test i31 wrapping in struct init
    let ref_struct_type =
      symbol_table.create_type_name_for_test(heap.alloc_str_for_test("RefStruct"));

    let sources = Sources {
      symbol_table,
      global_variables: vec![
        GlobalString(heap.alloc_str_for_test("FOO")),
        GlobalString(heap.alloc_str_for_test("BAR")),
      ],
      type_definitions: vec![
        lir::TypeDefinition {
          name: test_struct_type,
          parent_type: None,
          is_extensible: false,
          mappings: vec![INT_32_TYPE, INT_32_TYPE, INT_32_TYPE, INT_32_TYPE],
        },
        lir::TypeDefinition {
          name: ref_struct_type,
          parent_type: None,
          is_extensible: false,
          mappings: vec![lir::ANY_POINTER_TYPE],
        },
      ],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![heap.alloc_str_for_test("bar")],
        type_: lir::Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::IfElse {
            condition: ZERO,
            s1: Vec::new(),
            s2: Vec::new(),
            final_assignments: Vec::new(),
          },
          Statement::IfElse {
            condition: ZERO,
            s1: Vec::new(),
            s2: vec![Statement::Cast {
              name: PStr::LOWER_C,
              type_: INT_32_TYPE,
              assigned_expression: ZERO,
            }],
            final_assignments: Vec::new(),
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
                loop_variables: Vec::new(),
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: false,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: Some((PStr::LOWER_B, INT_32_TYPE)),
              },
              Statement::While {
                loop_variables: Vec::new(),
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
                lir::Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
              ),
            )],
          },
          Statement::Not { name: heap.alloc_str_for_test("un1"), operand: ZERO },
          Statement::IsPointer {
            name: heap.alloc_str_for_test("un2"),
            pointer_type: mir::TypeNameId::STR,
            operand: ZERO,
          },
          Statement::binary(
            heap.alloc_str_for_test("bin"),
            BinaryOperator::PLUS,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin1"),
            BinaryOperator::MUL,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin2"),
            BinaryOperator::DIV,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin3"),
            BinaryOperator::LE,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin4"),
            BinaryOperator::GE,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin5"),
            BinaryOperator::NE,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin6"),
            BinaryOperator::MOD,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_land"),
            BinaryOperator::LAND,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_lor"),
            BinaryOperator::LOR,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_shl"),
            BinaryOperator::SHL,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_shr"),
            BinaryOperator::SHR,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_lt"),
            BinaryOperator::LT,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("bin_gt"),
            BinaryOperator::GT,
            Expression::Variable(PStr::LOWER_F, INT_32_TYPE),
            ZERO,
          ),
          // Test binary comparison with Int31Literal (is_reference_expr)
          Statement::binary(
            heap.alloc_str_for_test("bin7"),
            BinaryOperator::EQ,
            Expression::Int31Literal(1),
            Expression::Int31Literal(2),
          ),
          // Test binary comparison with StringName (is_reference_expr)
          Statement::binary(
            heap.alloc_str_for_test("bin8"),
            BinaryOperator::NE,
            Expression::StringName(heap.alloc_str_for_test("FOO")),
            Expression::StringName(heap.alloc_str_for_test("BAR")),
          ),
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::new_for_test(PStr::MAIN_FN),
              lir::Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            ),
            arguments: vec![ZERO],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
          Statement::Call {
            callee: Expression::Variable(PStr::LOWER_F, lir::Type::new_fn(Vec::new(), INT_32_TYPE)),
            arguments: vec![ZERO],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("rc")),
          },
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("v"),
            type_: INT_32_TYPE,
            pointer_expression: lir::Expression::Variable(
              heap.alloc_str_for_test("struct_ptr"),
              lir::Type::Id(test_struct_type),
            ),
            index: 3,
          },
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("s"),
            type_: lir::Type::Id(test_struct_type),
            expression_list: vec![
              ZERO,
              Expression::Variable(heap.alloc_str_for_test("v"), INT_32_TYPE),
              ZERO,
              ZERO,
            ],
          },
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("rs"),
            type_: lir::Type::Id(ref_struct_type),
            expression_list: vec![ZERO],
          },
        ],
        return_value: ZERO,
      }],
    };
    let actual = super::compile_lir_to_wasm(heap, sources).pretty_print(heap);
    let expected = r#"(rec
(type $_Str (array (mut i8)))
(type $__t0 (func (result i32)))
(type $_TestStruct (struct (field i32) (field i32) (field i32) (field i32)))
(type $_RefStruct (struct (field (ref eq))))
)
(data $d2 "FOOBAR")
(global $GLOBAL_STRING_0 (mut (ref null $_Str)) (ref.null $_Str))
(global $GLOBAL_STRING_1 (mut (ref null $_Str)) (ref.null $_Str))
(table $0 1 funcref)
(elem $0 (i32.const 0) $__$main)
(func $__$main (param $bar i32) (result i32)
  (local $b i32)
  (local $bin i32)
  (local $bin1 i32)
  (local $bin2 i32)
  (local $bin3 i32)
  (local $bin4 i32)
  (local $bin5 i32)
  (local $bin6 i32)
  (local $bin7 i32)
  (local $bin8 i32)
  (local $bin_gt i32)
  (local $bin_land i32)
  (local $bin_lor i32)
  (local $bin_lt i32)
  (local $bin_shl i32)
  (local $bin_shr i32)
  (local $c i32)
  (local $f i32)
  (local $i i32)
  (local $rc i32)
  (local $rs (ref null $_RefStruct))
  (local $s (ref null $_TestStruct))
  (local $struct_ptr (ref null $_TestStruct))
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
    (local.set $f (ref.as_non_null (global.get $GLOBAL_STRING_0)))
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
  (local.set $un2 (ref.test (ref $_Str) (i32.const 0)))
  (local.set $bin (i32.add (local.get $f) (i32.const 0)))
  (local.set $bin1 (i32.mul (local.get $f) (i32.const 0)))
  (local.set $bin2 (i32.div_s (local.get $f) (i32.const 0)))
  (local.set $bin3 (i32.le_s (local.get $f) (i32.const 0)))
  (local.set $bin4 (i32.ge_s (local.get $f) (i32.const 0)))
  (local.set $bin5 (i32.ne (local.get $f) (i32.const 0)))
  (local.set $bin6 (i32.rem_s (local.get $f) (i32.const 0)))
  (local.set $bin_land (i32.and (local.get $f) (i32.const 0)))
  (local.set $bin_lor (i32.or (local.get $f) (i32.const 0)))
  (local.set $bin_shl (i32.shl (local.get $f) (i32.const 0)))
  (local.set $bin_shr (i32.shr_u (local.get $f) (i32.const 0)))
  (local.set $bin_lt (i32.lt_s (local.get $f) (i32.const 0)))
  (local.set $bin_gt (i32.gt_s (local.get $f) (i32.const 0)))
  (local.set $bin7 (ref.eq (ref.i31 (i32.const 1)) (ref.i31 (i32.const 2))))
  (local.set $bin8 (i32.xor (ref.eq (ref.as_non_null (global.get $GLOBAL_STRING_0)) (ref.as_non_null (global.get $GLOBAL_STRING_1))) (i32.const 1)))
  (drop (call $__$main (i32.const 0)))
  (local.set $rc (call_indirect $0 (type $__t0) (i32.const 0) (local.get $f)))
  (local.set $v (struct.get $_TestStruct 3 (ref.as_non_null (local.get $struct_ptr))))
  (local.set $s (struct.new $_TestStruct (i32.const 0) (local.get $v) (i32.const 0) (i32.const 0)))
  (local.set $rs (struct.new $_RefStruct (ref.i31 (i32.const 0))))
  (i32.const 0)
)
(func $__$init_globals
  (global.set $GLOBAL_STRING_0 (array.new_data $_Str $d2 (i32.const 0) (i32.const 3)))
  (global.set $GLOBAL_STRING_1 (array.new_data $_Str $d2 (i32.const 3) (i32.const 3)))
)
(start $__$init_globals)
(export "__$main" (func $__$main))
"#;
    assert_eq!(expected, actual);
  }
}
