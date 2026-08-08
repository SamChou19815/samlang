//! Lowers `lir::Sources` directly into `wast` crate AST nodes, which are then encoded to a
//! wasm binary without any intermediate wasm AST or WAT-text round-trip.
//!
//! The `wast` AST borrows every identifier as `&'a str`, so all function/type/label/data names
//! must be materialized into an owning [`NamePool`] *before* the borrowing AST is built. Lowering,
//! however, needs `&mut Heap` to allocate temp strings for function-type names and string globals.
//! We therefore split the work into two phases:
//!
//! 1. A **name/metadata pre-pass** ([`collect`]) that does all `&mut Heap` work — allocating string
//!    globals and function-type names — and builds the frozen [`NamePool`].
//! 2. A **single emit pass** that lowers each LIR function straight into `wast` instructions
//!    borrowing from the pool.
//!
//! Throughout this module, `//` comments above AST construction sites show the WebAssembly text
//! that the constructed nodes correspond to.

use dupe::Dupe;
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use rayon::prelude::*;
use samlang_ast::{hir, lir, mir};
use samlang_heap::{Heap, ModuleReference, PStr};
use std::collections::{BTreeMap, HashMap};
use wast::core::*;
use wast::token::{Id, Index, Span};

/// All spans are zero: this AST is constructed programmatically, never parsed from text.
pub(crate) fn zspan() -> Span {
  Span::from_offset(0)
}

/// `$name` (the leading `$` is implicit in wast's `Id`).
pub(crate) fn wid(name: &str) -> Id<'_> {
  Id::new(name, zspan())
}

/// `$name` in index position.
pub(crate) fn widx(name: &str) -> Index<'_> {
  Index::Id(wid(name))
}

/// `(ref eq)` / `(ref null i31)` / ... for abstract heap types.
pub(crate) fn ref_abstract(nullable: bool, ty: AbstractHeapType) -> ValType<'static> {
  ValType::Ref(RefType { nullable, heap: HeapType::Abstract { shared: false, ty } })
}

/// `(ref $name)` / `(ref null $name)`.
pub(crate) fn ref_named(nullable: bool, name: &str) -> ValType<'_> {
  ValType::Ref(RefType { nullable, heap: HeapType::Concrete(widx(name)) })
}

/// The block type of `block $label` / `loop $label` / `if`, with no explicit result type.
pub(crate) fn block_type(label: Option<&str>) -> Box<BlockType<'_>> {
  Box::new(BlockType {
    label: label.map(wid),
    label_name: None,
    ty: TypeUse { index: None, inline: None },
  })
}

/// An `Expression` from a flat instruction list. Note that wast expressions are flat:
/// folded WAT like `(i32.add (local.get $a) (i32.const 1))` is represented as the
/// sequence `local.get $a; i32.const 1; i32.add`, and nested `block`/`loop`/`if` need
/// explicit `end` markers (while the function-level `end` must be left out).
pub(crate) fn expression<'a>(instrs: Vec<Instruction<'a>>) -> Expression<'a> {
  Expression { instrs: instrs.into(), branch_hints: Box::new([]), instr_spans: None }
}

/// A `TypeDef` without any subtyping/shared/descriptor annotations.
fn plain_type_def(kind: InnerTypeKind<'_>) -> TypeDef<'_> {
  TypeDef { kind, shared: false, parent: None, descriptor: None, describes: None, final_type: None }
}

/// The WASM value types relevant to samlang, lowered from `lir::Type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, EnumAsInner)]
enum LoweredType {
  Int32,
  Int31,
  Eq,
  Reference(mir::TypeNameId),
}

/// The signature of a named function type, used as the dedup key when naming function types.
#[derive(Clone, PartialEq, Eq, Hash)]
struct LoweredFunctionType {
  argument_types: Vec<LoweredType>,
  return_type: LoweredType,
}

fn lower_type(t: &lir::Type) -> LoweredType {
  match t {
    lir::Type::Int32 => LoweredType::Int32,
    lir::Type::Int31 => LoweredType::Int31,
    lir::Type::AnyPointer => LoweredType::Eq,
    lir::Type::Id(id) => LoweredType::Reference(*id),
    // Function types are represented as i32 (function table indices).
    lir::Type::Fn(_) => LoweredType::Int32,
  }
}

fn lower_function_type(function_type: &lir::FunctionType) -> LoweredFunctionType {
  LoweredFunctionType {
    argument_types: function_type.argument_types.iter().map(lower_type).collect(),
    return_type: lower_type(&function_type.return_type),
  }
}

/// A GC string global: a `(ref $_Str)` initialized in `$__$init_globals` from a data segment slice.
struct GlobalGcString {
  name: PStr,
  data_segment_index: usize,
  offset: usize,
  length: usize,
}

fn is_reference_expr(e: &lir::Expression) -> bool {
  match e {
    lir::Expression::Int31Literal(_) => true,
    lir::Expression::Variable(_, t) => {
      matches!(t, lir::Type::Int31 | lir::Type::AnyPointer | lir::Type::Id(_) | lir::Type::Fn(_))
    }
    lir::Expression::StringName(_)
    | lir::Expression::Int32Literal(_)
    | lir::Expression::FnName(_, _) => false,
  }
}

fn is_string_expr(e: &lir::Expression) -> bool {
  match e {
    lir::Expression::StringName(_) => true,
    lir::Expression::Variable(_, lir::Type::Id(id)) => *id == mir::TypeNameId::STR,
    _ => false,
  }
}

/// For a Vec runtime function, returns the argument index whose WAT slot is the
/// uniform `(ref null eq)` element type (and may need i31 boxing of i32 args).
/// Returns None for Vec functions whose args are all non-element-typed.
fn vec_fn_element_arg_index(name: mir::FunctionName) -> Option<usize> {
  if name == mir::FunctionName::VEC_OF || name == mir::FunctionName::VEC_PUSH {
    Some(1)
  } else if name == mir::FunctionName::VEC_SET {
    Some(2)
  } else {
    None
  }
}

/// True if the WAT signature for this Vec function returns the element type
/// (`(ref eq)`); the call site may need to unbox (i31) or cast (struct ref).
fn vec_fn_returns_element(name: mir::FunctionName) -> bool {
  name == mir::FunctionName::VEC_POP || name == mir::FunctionName::VEC_GET
}

/// True if this Vec WAT function is a "static" with a (ref eq) placeholder
/// receiver as its first parameter (rather than a real (ref $_Vec)).
fn vec_fn_is_static(name: mir::FunctionName) -> bool {
  name == mir::FunctionName::VEC_EMPTY
    || name == mir::FunctionName::VEC_OF
    || name == mir::FunctionName::VEC_WITH_CAPACITY
}

/// True if the LIR expression has type i32. Used to decide whether a Vec
/// element argument needs i31 boxing before being passed to the WAT runtime.
fn lir_expr_is_i32(e: &lir::Expression) -> bool {
  matches!(e, lir::Expression::Int32Literal(_) | lir::Expression::Variable(_, lir::Type::Int32))
}

/// The wast AST borrows all identifier names as `&'a str`. Names of locals and globals
/// are `PStr`s that can be borrowed from the `Heap` directly, but function names, type
/// names, labels and data segment names must be formatted into owned strings first.
/// This pool pre-formats all of them so that the wast AST can borrow from it.
pub(crate) struct NamePool {
  function_names: HashMap<mir::FunctionName, String>,
  type_names: HashMap<mir::TypeNameId, String>,
  /// Local and parameter names, pre-formatted so the emit pass can borrow them (a `PStr` copied
  /// into a local map would only yield a str borrowing that local).
  local_names: HashMap<PStr, String>,
  data_segment_names: HashMap<usize, String>,
  /// `labels[n]` is `"l{n}"`, matching the emit pass's label ids.
  labels: Vec<String>,
}

impl NamePool {
  fn add_function(&mut self, name: mir::FunctionName, heap: &Heap, table: &mir::SymbolTable) {
    self.function_names.entry(name.dupe()).or_insert_with(|| {
      let mut s = String::new();
      name.write_encoded(&mut s, heap, table);
      s
    });
  }

  fn add_local(&mut self, name: PStr, heap: &Heap) {
    self.local_names.entry(name.dupe()).or_insert_with(|| name.as_str(heap).to_string());
  }

  fn add_type(&mut self, name: mir::TypeNameId, heap: &Heap, table: &mir::SymbolTable) {
    self.type_names.entry(name).or_insert_with(|| {
      let mut s = String::new();
      name.write_encoded(&mut s, heap, table);
      s
    });
  }

  fn add_lir_type(&mut self, t: &lir::Type, heap: &Heap, table: &mir::SymbolTable) {
    match t {
      lir::Type::Id(id) => self.add_type(*id, heap, table),
      lir::Type::Fn(f) => {
        for t in &f.argument_types {
          self.add_lir_type(t, heap, table);
        }
        self.add_lir_type(&f.return_type, heap, table);
      }
      lir::Type::Int32 | lir::Type::Int31 | lir::Type::AnyPointer => {}
    }
  }

  fn scan_expression(&mut self, e: &lir::Expression, heap: &Heap, table: &mir::SymbolTable) {
    match e {
      lir::Expression::Variable(n, t) => {
        self.add_local(n.dupe(), heap);
        self.add_lir_type(t, heap, table);
      }
      lir::Expression::FnName(name, t) => {
        self.add_function(name.dupe(), heap, table);
        for at in &t.argument_types {
          self.add_lir_type(at, heap, table);
        }
        self.add_lir_type(&t.return_type, heap, table);
      }
      lir::Expression::Int32Literal(_)
      | lir::Expression::Int31Literal(_)
      | lir::Expression::StringName(_) => {}
    }
  }

  /// Recursively registers every function/type name reachable from a statement, and counts the
  /// number of `While` statements (each consumes two labels) so the label pool can be sized.
  fn scan_statement(
    &mut self,
    s: &lir::Statement,
    heap: &Heap,
    table: &mir::SymbolTable,
    while_count: &mut u32,
  ) {
    match s {
      lir::Statement::IsPointer { name, pointer_type, operand } => {
        self.add_local(name.dupe(), heap);
        self.add_type(*pointer_type, heap, table);
        self.scan_expression(operand, heap, table);
      }
      lir::Statement::Not { name, operand } => {
        self.add_local(name.dupe(), heap);
        self.scan_expression(operand, heap, table);
      }
      lir::Statement::Binary { name, e1, e2, .. } => {
        self.add_local(name.dupe(), heap);
        self.scan_expression(e1, heap, table);
        self.scan_expression(e2, heap, table);
      }
      lir::Statement::IndexedAccess { name, type_, pointer_expression, .. } => {
        self.add_local(name.dupe(), heap);
        self.add_lir_type(type_, heap, table);
        self.scan_expression(pointer_expression, heap, table);
      }
      lir::Statement::Call { callee, arguments, return_type, return_collector } => {
        self.scan_expression(callee, heap, table);
        for a in arguments {
          self.scan_expression(a, heap, table);
        }
        self.add_lir_type(return_type, heap, table);
        if let Some(c) = return_collector {
          self.add_local(c.dupe(), heap);
        }
      }
      lir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        self.scan_expression(condition, heap, table);
        for s in s1 {
          self.scan_statement(s, heap, table, while_count);
        }
        for s in s2 {
          self.scan_statement(s, heap, table, while_count);
        }
        for (n, t, e1, e2) in final_assignments {
          self.add_local(n.dupe(), heap);
          self.add_lir_type(t, heap, table);
          self.scan_expression(e1, heap, table);
          self.scan_expression(e2, heap, table);
        }
      }
      lir::Statement::SingleIf { condition, statements, .. } => {
        self.scan_expression(condition, heap, table);
        for s in statements {
          self.scan_statement(s, heap, table, while_count);
        }
      }
      lir::Statement::Break(e) => self.scan_expression(e, heap, table),
      lir::Statement::While { loop_variables, statements, break_collector } => {
        *while_count += 1;
        for v in loop_variables {
          self.add_local(v.name.dupe(), heap);
          self.add_lir_type(&v.type_, heap, table);
          self.scan_expression(&v.initial_value, heap, table);
          self.scan_expression(&v.loop_value, heap, table);
        }
        for s in statements {
          self.scan_statement(s, heap, table, while_count);
        }
        if let Some((n, t)) = break_collector {
          self.add_local(n.dupe(), heap);
          self.add_lir_type(t, heap, table);
        }
      }
      lir::Statement::Cast { name, type_, assigned_expression } => {
        self.add_local(name.dupe(), heap);
        self.add_lir_type(type_, heap, table);
        self.scan_expression(assigned_expression, heap, table);
      }
      lir::Statement::LateInitDeclaration { name, type_ } => {
        self.add_local(name.dupe(), heap);
        self.add_lir_type(type_, heap, table);
      }
      lir::Statement::LateInitAssignment { name, assigned_expression } => {
        self.add_local(name.dupe(), heap);
        self.scan_expression(assigned_expression, heap, table);
      }
      lir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        self.add_local(struct_variable_name.dupe(), heap);
        self.add_lir_type(type_, heap, table);
        for e in expression_list {
          self.scan_expression(e, heap, table);
        }
      }
    }
  }

  fn func(&self, name: mir::FunctionName) -> &str {
    self.function_names.get(&name).unwrap()
  }

  fn type_(&self, name: mir::TypeNameId) -> &str {
    self.type_names.get(&name).unwrap()
  }

  fn local(&self, name: PStr) -> &str {
    self.local_names.get(&name).unwrap()
  }

  fn data_segment(&self, index: usize) -> &str {
    self.data_segment_names.get(&index).unwrap()
  }

  fn label(&self, label: u32) -> &str {
    &self.labels[label as usize]
  }
}

/// `i32` / `(ref i31)` / `(ref eq)` / `(ref $T)` — non-nullable flavor, used for
/// params, results and struct fields.
fn val_type<'a>(pool: &'a NamePool, t: &LoweredType) -> ValType<'a> {
  match t {
    LoweredType::Int32 => ValType::I32,
    LoweredType::Int31 => ref_abstract(false, AbstractHeapType::I31),
    LoweredType::Eq => ref_abstract(false, AbstractHeapType::Eq),
    LoweredType::Reference(id) => ref_named(false, pool.type_(*id)),
  }
}

/// `i32` / `(ref null i31)` / `(ref null eq)` / `(ref null $T)` — nullable flavor,
/// used for locals so they can be default-initialized to null.
fn nullable_val_type<'a>(pool: &'a NamePool, t: &LoweredType) -> ValType<'a> {
  match t {
    LoweredType::Int32 => ValType::I32,
    LoweredType::Int31 => ref_abstract(true, AbstractHeapType::I31),
    LoweredType::Eq => ref_abstract(true, AbstractHeapType::Eq),
    LoweredType::Reference(id) => ref_named(true, pool.type_(*id)),
  }
}

/// `(ref $T)` / `(ref i31)` / `(ref eq)` for the pointer types that can appear in
/// `ref.cast` / `ref.test` positions.
fn lir_ref_type<'a>(pool: &'a NamePool, t: &lir::Type) -> RefType<'a> {
  match t {
    lir::Type::Id(id) => {
      RefType { nullable: false, heap: HeapType::Concrete(widx(pool.type_(*id))) }
    }
    lir::Type::Int31 => RefType {
      nullable: false,
      heap: HeapType::Abstract { shared: false, ty: AbstractHeapType::I31 },
    },
    lir::Type::AnyPointer => RefType {
      nullable: false,
      heap: HeapType::Abstract { shared: false, ty: AbstractHeapType::Eq },
    },
    lir::Type::Int32 | lir::Type::Fn(_) => {
      panic!("Non-pointer type in ref.cast/ref.test position.")
    }
  }
}

/// `(ref $T)` for a concrete type id in `ref.cast` / `ref.test` positions.
fn id_ref_type(pool: &NamePool, id: mir::TypeNameId) -> RefType<'_> {
  RefType { nullable: false, heap: HeapType::Concrete(widx(pool.type_(id))) }
}

fn i32_binary_op(op: hir::BinaryOperator) -> Instruction<'static> {
  match op {
    hir::BinaryOperator::MUL => Instruction::I32Mul,
    hir::BinaryOperator::DIV => Instruction::I32DivS,
    hir::BinaryOperator::MOD => Instruction::I32RemS,
    hir::BinaryOperator::PLUS => Instruction::I32Add,
    hir::BinaryOperator::MINUS => Instruction::I32Sub,
    hir::BinaryOperator::LAND => Instruction::I32And,
    hir::BinaryOperator::LOR => Instruction::I32Or,
    hir::BinaryOperator::SHL => Instruction::I32Shl,
    hir::BinaryOperator::SHR => Instruction::I32ShrU,
    hir::BinaryOperator::XOR => Instruction::I32Xor,
    hir::BinaryOperator::LT => Instruction::I32LtS,
    hir::BinaryOperator::LE => Instruction::I32LeS,
    hir::BinaryOperator::GT => Instruction::I32GtS,
    hir::BinaryOperator::GE => Instruction::I32GeS,
    hir::BinaryOperator::EQ => Instruction::I32Eq,
    hir::BinaryOperator::NE => Instruction::I32Ne,
  }
}

// -------------------------------------------------------------------------------------------------
// Phase 1: name/metadata pre-pass
// -------------------------------------------------------------------------------------------------

/// Everything the emit pass borrows, produced by the name/metadata pre-pass.
struct Metadata {
  pool: NamePool,
  /// Maps a lowered function signature to the type name id allocated for it (indirect calls and
  /// closure functions). Emit looks these up; the pre-pass allocated them.
  function_type_mapping: HashMap<LoweredFunctionType, mir::TypeNameId>,
  /// `(id, signature)` sorted by id, for emitting `(type $T (func ...))` declarations.
  function_type_defs: Vec<(mir::TypeNameId, LoweredFunctionType)>,
  /// Maps type name id to lowered field types, for `StructInit` i31 boxing and struct type defs.
  type_field_mappings: HashMap<mir::TypeNameId, Vec<LoweredType>>,
  string_name_mapping: HashMap<PStr, PStr>,
  function_index_mapping: HashMap<mir::FunctionName, usize>,
  gc_string_globals: Vec<GlobalGcString>,
  /// The single data segment holding all string constants, present iff there are gc strings.
  data_segment_bytes: Option<Vec<u8>>,
}

/// Allocates (once, deduped) a type name id for a function signature, mutating the heap and table.
fn name_function_type(
  ft: &lir::FunctionType,
  heap: &mut Heap,
  table: &mut mir::SymbolTable,
  mapping: &mut HashMap<LoweredFunctionType, mir::TypeNameId>,
) {
  let lowered = lower_function_type(ft);
  mapping.entry(lowered).or_insert_with(|| {
    let temp_type_name = heap.alloc_temp_str();
    table.create_simple_type_name(ModuleReference::ROOT, temp_type_name)
  });
}

/// Walk a statement in the same order as the emit pass to name every function type it references
/// (indirect calls: a `Call` whose callee is a `Variable` of `Type::Fn`).
fn name_function_types_in_statement(
  s: &lir::Statement,
  heap: &mut Heap,
  table: &mut mir::SymbolTable,
  mapping: &mut HashMap<LoweredFunctionType, mir::TypeNameId>,
) {
  match s {
    lir::Statement::Call { callee, .. } => {
      if let lir::Expression::Variable(_, lir::Type::Fn(ft)) = callee {
        name_function_type(ft, heap, table, mapping);
      }
    }
    lir::Statement::IfElse { s1, s2, .. } => {
      for s in s1 {
        name_function_types_in_statement(s, heap, table, mapping);
      }
      for s in s2 {
        name_function_types_in_statement(s, heap, table, mapping);
      }
    }
    lir::Statement::SingleIf { statements, .. } | lir::Statement::While { statements, .. } => {
      for s in statements {
        name_function_types_in_statement(s, heap, table, mapping);
      }
    }
    lir::Statement::IsPointer { .. }
    | lir::Statement::Not { .. }
    | lir::Statement::Binary { .. }
    | lir::Statement::IndexedAccess { .. }
    | lir::Statement::Break(_)
    | lir::Statement::Cast { .. }
    | lir::Statement::LateInitDeclaration { .. }
    | lir::Statement::LateInitAssignment { .. }
    | lir::Statement::StructInit { .. } => {}
  }
}

fn collect(
  heap: &mut Heap,
  mut table: mir::SymbolTable,
  global_variables: &[hir::GlobalString],
  type_definitions: &[lir::TypeDefinition],
  main_function_names: &[mir::FunctionName],
  functions: &[lir::Function],
) -> Metadata {
  // Build a single data segment containing all string bytes, then create GC globals that use
  // array.new_data to reference portions of this segment. This mutates the heap (allocating the
  // `GLOBAL_STRING_i` names) and must happen before function-type naming to reproduce name ids.
  let mut string_name_mapping = HashMap::new();
  let mut gc_string_globals = Vec::new();
  let mut data_segment_bytes = Vec::new();
  for (idx, hir::GlobalString(content)) in global_variables.iter().enumerate() {
    let content_str = content.as_str(heap);
    let offset = data_segment_bytes.len();
    let length = content_str.len();
    data_segment_bytes.extend_from_slice(content_str.as_bytes());
    let global_name = Heap::alloc_string(format!("GLOBAL_STRING_{idx}"));
    string_name_mapping.insert(content.dupe(), global_name.dupe());
    gc_string_globals.push(GlobalGcString {
      name: global_name,
      data_segment_index: 2, // Use $d2 since libsam uses $d0 and $d1
      offset,
      length,
    });
  }
  let data_segment_bytes =
    if gc_string_globals.is_empty() { None } else { Some(data_segment_bytes) };

  let mut function_index_mapping = HashMap::new();
  for (i, f) in functions.iter().enumerate() {
    function_index_mapping.insert(f.name.dupe(), i);
  }

  let mut type_field_mappings: HashMap<mir::TypeNameId, Vec<LoweredType>> = HashMap::new();
  for lir::TypeDefinition { name, mappings, .. } in type_definitions {
    // Skip the STR type - it's the builtin $_Str GC array, not a struct.
    if *name == mir::TypeNameId::STR {
      continue;
    }
    type_field_mappings.insert(*name, mappings.iter().map(lower_type).collect());
  }

  // Name every function type the emit pass will reference, in the same traversal order the emit
  // pass encounters them: per function, indirect-call types in body order, then the closure's own
  // type. This keeps the `heap.alloc_temp_str()` call sequence identical to the old lowering.
  let mut function_type_mapping: HashMap<LoweredFunctionType, mir::TypeNameId> = HashMap::new();
  for f in functions {
    for s in &f.body {
      name_function_types_in_statement(s, heap, &mut table, &mut function_type_mapping);
    }
    if f.parameters.first() == Some(&PStr::UNDERSCORE_THIS) {
      let lowered = lower_function_type(&f.type_);
      function_type_mapping.entry(lowered).or_insert_with(|| {
        let temp_type_name = heap.alloc_temp_str();
        table.create_simple_type_name(ModuleReference::ROOT, temp_type_name)
      });
    }
  }
  let mut function_type_defs =
    function_type_mapping.iter().map(|(t, n)| (*n, t.clone())).collect_vec();
  function_type_defs.sort_by_key(|(n, _)| *n);

  // Build the name pool. All `&mut Heap`/`&mut SymbolTable` work is done above, so from here the
  // table/heap are read-only.
  let mut pool = NamePool {
    function_names: HashMap::new(),
    type_names: HashMap::new(),
    local_names: HashMap::new(),
    data_segment_names: HashMap::new(),
    labels: Vec::new(),
  };
  // `$_Str` is referenced by GC string globals and `$__$init_globals` even when no user-defined
  // type mentions it.
  pool.add_type(mir::TypeNameId::STR, heap, &table);
  // Function names inserted by the emit pass that never appear as `FnName` in the LIR.
  pool.add_function(mir::FunctionName::STR_EQ, heap, &table);
  pool.add_function(mir::FunctionName::UNWRAP_I31, heap, &table);
  for (type_name, function_type) in &function_type_defs {
    pool.add_type(*type_name, heap, &table);
    for t in &function_type.argument_types {
      if let LoweredType::Reference(id) = t {
        pool.add_type(*id, heap, &table);
      }
    }
    if let LoweredType::Reference(id) = &function_type.return_type {
      pool.add_type(*id, heap, &table);
    }
  }
  for type_definition in type_definitions {
    pool.add_type(type_definition.name, heap, &table);
    if let Some(parent) = type_definition.parent_type {
      pool.add_type(parent, heap, &table);
    }
    for t in &type_definition.mappings {
      pool.add_lir_type(t, heap, &table);
    }
  }
  for gc_string in &gc_string_globals {
    pool
      .data_segment_names
      .entry(gc_string.data_segment_index)
      .or_insert_with(|| format!("d{}", gc_string.data_segment_index));
  }
  for name in main_function_names {
    pool.add_function(name.dupe(), heap, &table);
  }
  let mut max_while_count = 0;
  for function in functions {
    pool.add_function(function.name.dupe(), heap, &table);
    for (n, t) in function.parameters.iter().zip(&function.type_.argument_types) {
      pool.add_local(n.dupe(), heap);
      pool.add_lir_type(t, heap, &table);
    }
    pool.add_lir_type(&function.type_.return_type, heap, &table);
    let mut while_count = 0;
    for s in &function.body {
      pool.scan_statement(s, heap, &table, &mut while_count);
    }
    pool.scan_expression(&function.return_value, heap, &table);
    max_while_count = max_while_count.max(while_count);
  }
  if max_while_count > 0 {
    // Each `While` allocates two labels (continue, exit); a function using `n` whiles uses label
    // ids `0..2n`. Size the shared pool to the largest per-function count.
    pool.labels = (0..2 * max_while_count).map(|l| format!("l{l}")).collect();
  }

  Metadata {
    pool,
    function_type_mapping,
    function_type_defs,
    type_field_mappings,
    string_name_mapping,
    function_index_mapping,
    gc_string_globals,
    data_segment_bytes,
  }
}

// -------------------------------------------------------------------------------------------------
// Phase 2: emit pass
// -------------------------------------------------------------------------------------------------

/// Immutable context borrowed by the emit pass; all fields have the `'a` lifetime of the encoded
/// module, so instructions may borrow names directly from them.
struct Ctx<'a> {
  heap: &'a Heap,
  pool: &'a NamePool,
  function_type_mapping: &'a HashMap<LoweredFunctionType, mir::TypeNameId>,
  type_field_mappings: &'a HashMap<mir::TypeNameId, Vec<LoweredType>>,
  string_name_mapping: &'a HashMap<PStr, PStr>,
  function_index_mapping: &'a HashMap<mir::FunctionName, usize>,
}

#[derive(Clone)]
struct LoopContext {
  break_collector: Option<PStr>,
  break_collector_type: Option<LoweredType>,
  exit_label: u32,
}

/// Per-function mutable emit state.
struct EmitState {
  label_id: u32,
  loop_cx: Option<LoopContext>,
  local_variables: BTreeMap<PStr, LoweredType>,
}

fn is_ref_lowered(t: LoweredType) -> bool {
  matches!(t, LoweredType::Int31 | LoweredType::Eq | LoweredType::Reference(_))
}

fn alloc_label(state: &mut EmitState) -> u32 {
  let label = state.label_id;
  state.label_id += 1;
  label
}

/// `(local.get $n)`, wrapped in `ref.as_non_null` for reference types (locals are nullable).
fn emit_get<'a>(
  state: &mut EmitState,
  ctx: &Ctx<'a>,
  n: PStr,
  ty: LoweredType,
  out: &mut Vec<Instruction<'a>>,
) {
  state.local_variables.insert(n.dupe(), ty);
  out.push(Instruction::LocalGet(widx(ctx.pool.local(n))));
  if is_ref_lowered(ty) {
    out.push(Instruction::RefAsNonNull);
  }
}

/// `(local.get $n)` without updating the recorded type (e.g. a local declared as AnyPointer but
/// read with a more specific type keeps its declared type).
fn emit_get_no_update<'a>(
  state: &EmitState,
  ctx: &Ctx<'a>,
  n: PStr,
  out: &mut Vec<Instruction<'a>>,
) {
  out.push(Instruction::LocalGet(widx(ctx.pool.local(n.dupe()))));
  if state.local_variables.get(&n).is_some_and(|t| is_ref_lowered(*t)) {
    out.push(Instruction::RefAsNonNull);
  }
}

/// `(local.set $n ...)` — records the type; the value's instructions must already be emitted.
fn emit_set<'a>(
  state: &mut EmitState,
  ctx: &Ctx<'a>,
  n: PStr,
  ty: LoweredType,
  out: &mut Vec<Instruction<'a>>,
) {
  state.local_variables.insert(n.dupe(), ty);
  out.push(Instruction::LocalSet(widx(ctx.pool.local(n))));
}

fn emit_expr<'a>(
  state: &mut EmitState,
  ctx: &Ctx<'a>,
  e: &lir::Expression,
  out: &mut Vec<Instruction<'a>>,
) {
  match e {
    lir::Expression::Int32Literal(v) => out.push(Instruction::I32Const(*v)),
    // (ref.i31 (i32.const v))
    lir::Expression::Int31Literal(v) => {
      out.push(Instruction::I32Const(*v));
      out.push(Instruction::RefI31);
    }
    lir::Expression::Variable(n, t) => {
      let ty = lower_type(t);
      // Don't override existing type (e.g. if it was set to AnyPointer, keep it).
      if state.local_variables.contains_key(n) {
        emit_get_no_update(state, ctx, n.dupe(), out);
      } else {
        emit_get(state, ctx, n.dupe(), ty, out);
      }
    }
    // (ref.as_non_null (global.get $name))
    lir::Expression::StringName(n) => {
      let global_name = ctx.string_name_mapping.get(n).unwrap();
      out.push(Instruction::GlobalGet(widx(global_name.as_str(ctx.heap))));
      out.push(Instruction::RefAsNonNull);
    }
    lir::Expression::FnName(n, _) => {
      let index = ctx.function_index_mapping.get(n).unwrap();
      out.push(Instruction::I32Const(i32::try_from(*index).unwrap()));
    }
  }
}

/// Emits an expression that must have reference type, returning its struct type id.
fn emit_expr_with_reference_type<'a>(
  state: &mut EmitState,
  ctx: &Ctx<'a>,
  e: &lir::Expression,
  out: &mut Vec<Instruction<'a>>,
) -> mir::TypeNameId {
  match e {
    lir::Expression::Int32Literal(_) => {
      panic!("Int32Literal in place that expects struct typed values.")
    }
    lir::Expression::Int31Literal(_) => {
      panic!("Int31Literal in place that expects struct typed values.")
    }
    lir::Expression::Variable(n, t) => {
      let lowered_type = lower_type(t);
      let LoweredType::Reference(ref_type) = lowered_type else {
        panic!("The given expression doesn't have reference type.")
      };
      let stored_type = state.local_variables.get(n).copied();
      if stored_type.is_some() {
        emit_get_no_update(state, ctx, n.dupe(), out);
      } else {
        emit_get(state, ctx, n.dupe(), lowered_type, out);
      }
      // Cast is needed when the stored/declared type is Eq (AnyPointer) but we need a specific
      // struct type. (ref.cast (ref $ref_type) ...)
      if matches!(stored_type, Some(LoweredType::Eq)) {
        out.push(Instruction::RefCast(RefCast { r#type: id_ref_type(ctx.pool, ref_type) }));
      }
      ref_type
    }
    lir::Expression::StringName(n) => {
      let global_name = ctx.string_name_mapping.get(n).unwrap();
      out.push(Instruction::GlobalGet(widx(global_name.as_str(ctx.heap))));
      out.push(Instruction::RefAsNonNull);
      mir::TypeNameId::STR
    }
    lir::Expression::FnName(_, _) => {
      panic!("FnName in place that expects struct typed values.")
    }
  }
}

/// `(i32.xor ... (i32.const 1))` — logical negation of an i32 boolean already on the stack.
fn emit_xor_one(out: &mut Vec<Instruction<'_>>) {
  out.push(Instruction::I32Const(1));
  out.push(Instruction::I32Xor);
}

fn emit_stmt<'a>(
  state: &mut EmitState,
  ctx: &Ctx<'a>,
  s: &lir::Statement,
  out: &mut Vec<Instruction<'a>>,
) {
  match s {
    // (local.set $name (ref.test (ref $T) operand))
    lir::Statement::IsPointer { name, pointer_type, operand } => {
      emit_expr(state, ctx, operand, out);
      out.push(Instruction::RefTest(RefTest { r#type: id_ref_type(ctx.pool, *pointer_type) }));
      emit_set(state, ctx, name.dupe(), LoweredType::Int32, out);
    }
    // (local.set $name (i32.xor operand (i32.const 1)))
    lir::Statement::Not { name, operand } => {
      emit_expr(state, ctx, operand, out);
      emit_xor_one(out);
      emit_set(state, ctx, name.dupe(), LoweredType::Int32, out);
    }
    lir::Statement::Binary { name, operator, e1, e2 } => {
      let is_str_cmp = matches!(operator, hir::BinaryOperator::EQ | hir::BinaryOperator::NE)
        && (is_string_expr(e1) || is_string_expr(e2));
      if is_str_cmp {
        // (call $__Str$eq e1 e2) [ (i32.xor ... (i32.const 1)) for NE ]
        emit_expr(state, ctx, e1, out);
        emit_expr(state, ctx, e2, out);
        out.push(Instruction::Call(widx(ctx.pool.func(mir::FunctionName::STR_EQ))));
        if *operator == hir::BinaryOperator::NE {
          emit_xor_one(out);
        }
      } else {
        emit_expr(state, ctx, e1, out);
        emit_expr(state, ctx, e2, out);
        let is_ref_comparison =
          matches!(operator, hir::BinaryOperator::EQ | hir::BinaryOperator::NE)
            && (is_reference_expr(e1) || is_reference_expr(e2));
        if is_ref_comparison {
          // (ref.eq e1 e2) [ (i32.xor ... (i32.const 1)) for NE ]
          out.push(Instruction::RefEq);
          if *operator == hir::BinaryOperator::NE {
            emit_xor_one(out);
          }
        } else {
          out.push(i32_binary_op(*operator));
        }
      }
      emit_set(state, ctx, name.dupe(), LoweredType::Int32, out);
    }
    // (local.set $name (struct.get $T index pointer))
    lir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      let result_type = lower_type(type_);
      let struct_type = emit_expr_with_reference_type(state, ctx, pointer_expression, out);
      out.push(Instruction::StructGet(StructAccess {
        r#struct: widx(ctx.pool.type_(struct_type)),
        field: Index::Num(*index as u32, zspan()),
      }));
      emit_set(state, ctx, name.dupe(), result_type, out);
    }
    lir::Statement::Call { callee, arguments, return_type, return_collector } => {
      // Check if this is a call to a builtin that expects (ref eq) as the first arg.
      let (needs_ref_eq_this, is_panic, vec_element_arg, vec_returns_element) =
        if let lir::Expression::FnName(name, _) = callee {
          let needs_ref_eq = name.type_name == mir::TypeNameId::PROCESS
            || (*name == mir::FunctionName::STR_FROM_INT)
            || vec_fn_is_static(name.dupe());
          let is_panic = *name == mir::FunctionName::PROCESS_PANIC;
          (
            needs_ref_eq,
            is_panic,
            vec_fn_element_arg_index(name.dupe()),
            vec_fn_returns_element(name.dupe()),
          )
        } else {
          (false, false, None, false)
        };
      let callee_param_types = if let lir::Expression::FnName(_, fn_type) = callee {
        Some(&fn_type.argument_types)
      } else {
        None
      };
      for (i, arg) in arguments.iter().enumerate() {
        emit_expr(state, ctx, arg, out);
        // The first argument (this/self) to builtin methods should be (ref eq), not i32.
        if i == 0 && needs_ref_eq_this && matches!(arg, lir::Expression::Int32Literal(0)) {
          out.push(Instruction::RefI31);
          continue;
        }
        // Vec element-typed args: the WAT slot is (ref null eq). i32 args need i31 boxing.
        if Some(i) == vec_element_arg && lir_expr_is_i32(arg) {
          out.push(Instruction::RefI31);
          continue;
        }
        if let (Some(param_types), lir::Expression::Variable(var_name, _)) =
          (callee_param_types, arg)
          && state.local_variables.get(var_name).copied() == Some(LoweredType::Eq)
          && let Some(lir::Type::Id(_)) = param_types.get(i)
        {
          // (ref.cast (ref $T) arg) — downcast an erased (ref eq) to the expected struct type.
          out.push(Instruction::RefCast(RefCast {
            r#type: lir_ref_type(ctx.pool, &param_types[i]),
          }));
        }
      }
      match callee {
        lir::Expression::FnName(name, _) => {
          out.push(Instruction::Call(widx(ctx.pool.func(name.dupe()))));
        }
        _ => {
          // call_indirect: arguments, then the function index, then the instruction.
          emit_expr(state, ctx, callee, out);
          let function_type_name = ctx.function_type_mapping
            [&lower_function_type(callee.as_variable().unwrap().1.as_fn().unwrap())];
          out.push(Instruction::CallIndirect(Box::new(CallIndirect {
            table: widx("0"),
            ty: TypeUse::new_with_index(widx(ctx.pool.type_(function_type_name))),
          })));
        }
      }
      if is_panic {
        // Panic never returns: drop the result and add unreachable.
        out.push(Instruction::Drop);
        out.push(Instruction::Unreachable);
        if let Some(c) = return_collector {
          state.local_variables.insert(c.dupe(), lower_type(return_type));
        }
      } else {
        // Vec.pop / Vec.get return (ref eq) at WAT level; unwrap based on the element type.
        if vec_returns_element {
          if return_type.is_int32() {
            out.push(Instruction::Call(widx(ctx.pool.func(mir::FunctionName::UNWRAP_I31))));
          } else {
            out.push(Instruction::RefCast(RefCast { r#type: lir_ref_type(ctx.pool, return_type) }));
          }
        }
        if let Some(c) = return_collector {
          emit_set(state, ctx, c.dupe(), lower_type(return_type), out);
        } else {
          out.push(Instruction::Drop);
        }
      }
    }
    lir::Statement::IfElse { condition, s1, s2, final_assignments } => {
      let mut cond = Vec::new();
      emit_expr(state, ctx, condition, &mut cond);
      let mut s1v = Vec::new();
      for s in s1 {
        emit_stmt(state, ctx, s, &mut s1v);
      }
      let mut s2v = Vec::new();
      for s in s2 {
        emit_stmt(state, ctx, s, &mut s2v);
      }
      for (n, t, e1, e2) in final_assignments {
        let ty = lower_type(t);
        emit_expr(state, ctx, e1, &mut s1v);
        emit_set(state, ctx, n.dupe(), ty, &mut s1v);
        emit_expr(state, ctx, e2, &mut s2v);
        emit_set(state, ctx, n.dupe(), ty, &mut s2v);
      }
      if s1v.is_empty() {
        if !s2v.is_empty() {
          // (if (i32.xor condition (i32.const 1)) (then s2...))
          out.extend(cond);
          emit_xor_one(out);
          out.push(Instruction::If(block_type(None)));
          out.extend(s2v);
          out.push(Instruction::End(None));
        }
      } else {
        // (if condition (then s1...) [ (else s2...) ])
        out.extend(cond);
        out.push(Instruction::If(block_type(None)));
        out.extend(s1v);
        if !s2v.is_empty() {
          out.push(Instruction::Else(None));
          out.extend(s2v);
        }
        out.push(Instruction::End(None));
      }
    }
    lir::Statement::SingleIf { condition, invert_condition, statements } => {
      emit_expr(state, ctx, condition, out);
      if *invert_condition {
        emit_xor_one(out);
      }
      out.push(Instruction::If(block_type(None)));
      for s in statements {
        emit_stmt(state, ctx, s, out);
      }
      out.push(Instruction::End(None));
    }
    lir::Statement::Break(e) => {
      let LoopContext { break_collector, break_collector_type, exit_label } =
        state.loop_cx.clone().unwrap();
      if let Some(c) = break_collector {
        emit_expr(state, ctx, e, out);
        emit_set(state, ctx, c.dupe(), break_collector_type.unwrap(), out);
      }
      out.push(Instruction::Br(widx(ctx.pool.label(exit_label))));
    }
    lir::Statement::While { loop_variables, statements, break_collector } => {
      let saved_loop_cx = state.loop_cx.take();
      let continue_label = alloc_label(state);
      let exit_label = alloc_label(state);
      state.loop_cx = Some(LoopContext {
        break_collector: break_collector.as_ref().map(|(n, _)| n.dupe()),
        break_collector_type: break_collector.as_ref().map(|(_, t)| lower_type(t)),
        exit_label,
      });
      for it in loop_variables {
        let t = lower_type(&it.type_);
        emit_expr(state, ctx, &it.initial_value, out);
        emit_set(state, ctx, it.name.dupe(), t, out);
      }
      let mut body = Vec::new();
      for s in statements {
        emit_stmt(state, ctx, s, &mut body);
      }
      for v in loop_variables {
        let t = lower_type(&v.type_);
        emit_expr(state, ctx, &v.loop_value, &mut body);
        emit_set(state, ctx, v.name.dupe(), t, &mut body);
      }
      body.push(Instruction::Br(widx(ctx.pool.label(continue_label))));
      // (loop $continue (block $exit body...))
      out.push(Instruction::Loop(block_type(Some(ctx.pool.label(continue_label)))));
      out.push(Instruction::Block(block_type(Some(ctx.pool.label(exit_label)))));
      out.extend(body);
      out.push(Instruction::End(None));
      out.push(Instruction::End(None));
      state.loop_cx = saved_loop_cx;
    }
    lir::Statement::Cast { name, type_, assigned_expression } => {
      let t = lower_type(type_);
      emit_expr(state, ctx, assigned_expression, out);
      // ref.cast is needed when downcasting from a reference supertype to a specific struct type.
      let needs_ref_cast = matches!(
        assigned_expression,
        lir::Expression::Variable(_, lir::Type::AnyPointer | lir::Type::Id(_))
      ) && type_.is_id();
      if needs_ref_cast {
        out.push(Instruction::RefCast(RefCast { r#type: lir_ref_type(ctx.pool, type_) }));
      }
      emit_set(state, ctx, name.dupe(), t, out);
    }
    lir::Statement::LateInitAssignment { name, assigned_expression } => {
      emit_expr(state, ctx, assigned_expression, out);
      // The type was already declared by LateInitDeclaration.
      let t = state.local_variables.get(name).copied().unwrap_or(LoweredType::Int32);
      emit_set(state, ctx, name.dupe(), t, out);
    }
    lir::Statement::LateInitDeclaration { name, type_ } => {
      // Just register the type, no WASM instruction needed.
      state.local_variables.insert(name.dupe(), lower_type(type_));
    }
    lir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
      let type_ref = lower_type(type_).into_reference().unwrap();
      let field_types = &ctx.type_field_mappings[&type_ref];
      for (i, e) in expression_list.iter().enumerate() {
        emit_expr(state, ctx, e, out);
        // If the field expects a reference type and we have Int32Literal(0), box with ref.i31.
        // (`field_types.get(i)` can be `None` when there are more expressions than fields.)
        let needs_i31 = field_types
          .get(i)
          .is_some_and(|ft| matches!(e, lir::Expression::Int32Literal(0)) && is_ref_lowered(*ft));
        if needs_i31 {
          out.push(Instruction::RefI31);
        }
      }
      out.push(Instruction::StructNew(widx(ctx.pool.type_(type_ref))));
      emit_set(state, ctx, struct_variable_name.dupe(), LoweredType::Reference(type_ref), out);
    }
  }
}

// (func $name (type $T)? (param $p T)* (result T)
//   (local $l T_nullable)*
//   instructions...)
fn emit_function<'a>(ctx: &Ctx<'a>, function: &'a lir::Function) -> ModuleField<'a> {
  let mut state = EmitState {
    label_id: 0,
    loop_cx: None,
    // Pre-populate with parameter types so type mismatches (e.g. AnyPointer param used as a
    // specific struct) are detected.
    local_variables: function
      .parameters
      .iter()
      .zip(&function.type_.argument_types)
      .map(|(n, t)| (n.dupe(), lower_type(t)))
      .collect(),
  };
  let mut instrs = Vec::new();
  for s in &function.body {
    emit_stmt(&mut state, ctx, s, &mut instrs);
  }
  // Wrap the return value with ref.as_non_null for reference types since locals are nullable.
  let return_type = lower_type(&function.type_.return_type);
  emit_expr(&mut state, ctx, &function.return_value, &mut instrs);
  if is_ref_lowered(return_type) {
    instrs.push(Instruction::RefAsNonNull);
  }
  for n in &function.parameters {
    state.local_variables.remove(n);
  }
  let params = function
    .parameters
    .iter()
    .zip(&function.type_.argument_types)
    .map(|(n, t)| (Some(wid(ctx.pool.local(n.dupe()))), None, val_type(ctx.pool, &lower_type(t))))
    .collect();
  let locals = state
    .local_variables
    .iter()
    // Use nullable types for locals to handle conditional initialization.
    .map(|(n, t)| Local {
      id: Some(wid(ctx.pool.local(n.dupe()))),
      name: None,
      ty: nullable_val_type(ctx.pool, t),
    })
    .collect();
  // For closure functions (first param `_this`), get the explicit type name so call_indirect can
  // reference the exact function type.
  let type_name = if function.parameters.first() == Some(&PStr::UNDERSCORE_THIS) {
    Some(ctx.function_type_mapping[&lower_function_type(&function.type_)])
  } else {
    None
  };
  ModuleField::Func(Func {
    span: zspan(),
    id: Some(wid(ctx.pool.func(function.name.dupe()))),
    name: None,
    exports: InlineExport::default(),
    kind: FuncKind::Inline { locals, expression: expression(instrs) },
    ty: TypeUse {
      index: type_name.map(|type_name| widx(ctx.pool.type_(type_name))),
      inline: Some(FunctionType { params, results: Box::new([val_type(ctx.pool, &return_type)]) }),
    },
  })
}

// -------------------------------------------------------------------------------------------------
// Module assembly
// -------------------------------------------------------------------------------------------------

fn build_wast_module<'a>(
  heap: &'a Heap,
  metadata: &'a Metadata,
  type_definitions: &'a [lir::TypeDefinition],
  main_function_names: &'a [mir::FunctionName],
  functions: &'a [lir::Function],
  function_fields: Vec<ModuleField<'a>>,
) -> Module<'a> {
  let pool = &metadata.pool;
  // The libsam runtime fields come first so that function/global/data index spaces match the
  // previous text-level concatenation order.
  let mut fields = crate::libsam::module_fields();

  // (rec ...) — all types live in a single recursion group so that structs can reference each
  // other and the builtin types freely.
  let mut types =
    Vec::with_capacity(3 + metadata.function_type_defs.len() + type_definitions.len());
  // (type $_Str (array (mut i8)))
  types.push(Type {
    span: zspan(),
    id: Some(wid("_Str")),
    name: None,
    def: plain_type_def(InnerTypeKind::Array(ArrayType { mutable: true, ty: StorageType::I8 })),
  });
  // (type $_VecData (array (mut (ref null eq))))
  types.push(Type {
    span: zspan(),
    id: Some(wid("_VecData")),
    name: None,
    def: plain_type_def(InnerTypeKind::Array(ArrayType {
      mutable: true,
      ty: StorageType::Val(ref_abstract(true, AbstractHeapType::Eq)),
    })),
  });
  // (type $_Vec (struct (field (mut (ref $_VecData))) (field (mut i32))))
  types.push(Type {
    span: zspan(),
    id: Some(wid("_Vec")),
    name: None,
    def: plain_type_def(InnerTypeKind::Struct(StructType {
      fields: vec![
        StructField { id: None, mutable: true, ty: StorageType::Val(ref_named(false, "_VecData")) },
        StructField { id: None, mutable: true, ty: StorageType::Val(ValType::I32) },
      ],
    })),
  });
  // (type $T (func (param T)* (result T)))
  for (type_name, function_type) in &metadata.function_type_defs {
    types.push(Type {
      span: zspan(),
      id: Some(wid(pool.type_(*type_name))),
      name: None,
      def: plain_type_def(InnerTypeKind::Func(FunctionType {
        params: function_type
          .argument_types
          .iter()
          .map(|t| (None, None, val_type(pool, t)))
          .collect(),
        results: Box::new([val_type(pool, &function_type.return_type)]),
      })),
    });
  }
  // (type $T (struct (field T)*))
  // (type $T (sub (struct (field T)*)))         -- extensible type
  // (type $T (sub $Parent (struct (field T)*))) -- enum variant subtype
  for type_definition in type_definitions {
    // Skip the STR type - it's the builtin $_Str GC array, not a struct.
    if type_definition.name == mir::TypeNameId::STR {
      continue;
    }
    let field_types = &metadata.type_field_mappings[&type_definition.name];
    let needs_sub = type_definition.parent_type.is_some() || type_definition.is_extensible;
    types.push(Type {
      span: zspan(),
      id: Some(wid(pool.type_(type_definition.name))),
      name: None,
      def: TypeDef {
        kind: InnerTypeKind::Struct(StructType {
          fields: field_types
            .iter()
            .map(|t| StructField {
              id: None,
              mutable: false,
              ty: StorageType::Val(val_type(pool, t)),
            })
            .collect(),
        }),
        shared: false,
        parent: type_definition.parent_type.map(|parent| widx(pool.type_(parent))),
        descriptor: None,
        describes: None,
        final_type: if needs_sub { Some(false) } else { None },
      },
    });
  }
  fields.push(ModuleField::Rec(Rec { span: zspan(), types }));

  // (data $d2 "bytes...") — passive data segment holding all string constants, consumed by
  // array.new_data in $__$init_globals. ($d0 lives in libsam.)
  if let Some(bytes) = &metadata.data_segment_bytes {
    fields.push(ModuleField::Data(Data {
      span: zspan(),
      id: Some(wid("d2")),
      name: None,
      kind: DataKind::Passive,
      data: vec![DataVal::String(bytes)],
    }));
  }
  // (global $name (mut (ref null $_Str)) (ref.null $_Str))
  // GC string globals are mutable and start with null, initialized by __$init_globals.
  for gc_string in &metadata.gc_string_globals {
    fields.push(ModuleField::Global(Global {
      span: zspan(),
      id: Some(wid(gc_string.name.as_str(heap))),
      name: None,
      exports: InlineExport::default(),
      ty: GlobalType { ty: ref_named(true, "_Str"), mutable: true, shared: false },
      kind: GlobalKind::Inline(Expression::one(Instruction::RefNull(HeapType::Concrete(widx(
        "_Str",
      ))))),
    }));
  }
  // (table $0 N funcref)
  fields.push(ModuleField::Table(Table {
    span: zspan(),
    id: Some(wid("0")),
    name: None,
    exports: InlineExport::default(),
    kind: TableKind::Normal {
      ty: TableType {
        limits: Limits { is64: false, min: functions.len() as u64, max: None },
        elem: RefType::func(),
        shared: false,
      },
      init_expr: None,
    },
  }));
  // (elem $0 (i32.const 0) $f...)
  fields.push(ModuleField::Elem(Elem {
    span: zspan(),
    id: Some(wid("0")),
    name: None,
    kind: ElemKind::Active { table: None, offset: Expression::one(Instruction::I32Const(0)) },
    payload: ElemPayload::Indices(
      functions.iter().map(|f| widx(pool.func(f.name.dupe()))).collect(),
    ),
  }));
  fields.extend(function_fields);
  // Add init function and start section if there are GC string globals:
  // (func $__$init_globals
  //   (global.set $name (array.new_data $_Str $dN (i32.const offset) (i32.const length)))*)
  // (start $__$init_globals)
  if !metadata.gc_string_globals.is_empty() {
    let mut instrs = Vec::with_capacity(metadata.gc_string_globals.len() * 4);
    for gc_string in &metadata.gc_string_globals {
      instrs.push(Instruction::I32Const(gc_string.offset as i32));
      instrs.push(Instruction::I32Const(gc_string.length as i32));
      instrs.push(Instruction::ArrayNewData(ArrayNewData {
        array: widx("_Str"),
        data_idx: widx(pool.data_segment(gc_string.data_segment_index)),
      }));
      instrs.push(Instruction::GlobalSet(widx(gc_string.name.as_str(heap))));
    }
    fields.push(ModuleField::Func(Func {
      span: zspan(),
      id: Some(wid("__$init_globals")),
      name: None,
      exports: InlineExport::default(),
      kind: FuncKind::Inline { locals: Box::new([]), expression: expression(instrs) },
      ty: TypeUse { index: None, inline: None },
    }));
    fields.push(ModuleField::Start(widx("__$init_globals")));
  }
  // (export "name" (func $name))
  for name in main_function_names {
    fields.push(ModuleField::Export(Export {
      span: zspan(),
      name: pool.func(name.dupe()),
      kind: ExportKind::Func,
      item: widx(pool.func(name.dupe())),
    }));
  }

  Module { span: zspan(), id: None, name: None, kind: ModuleKind::Text(fields) }
}

pub(crate) fn compile_lir_to_binary(heap: &mut Heap, sources: lir::Sources) -> Vec<u8> {
  let lir::Sources {
    symbol_table,
    global_variables,
    type_definitions,
    main_function_names,
    functions,
  } = sources;
  let metadata = collect(
    heap,
    symbol_table,
    &global_variables,
    &type_definitions,
    &main_function_names,
    &functions,
  );
  // All `&mut Heap` work is done; reborrow immutably so the borrowing wast AST can share it.
  let heap: &Heap = heap;
  let ctx = Ctx {
    heap,
    pool: &metadata.pool,
    function_type_mapping: &metadata.function_type_mapping,
    type_field_mappings: &metadata.type_field_mappings,
    string_name_mapping: &metadata.string_name_mapping,
    function_index_mapping: &metadata.function_index_mapping,
  };
  // The emit pass is read-only over `ctx` (all `&mut Heap` work happened in `collect`),
  // so functions are emitted in parallel.
  let function_fields = functions.par_iter().map(|f| emit_function(&ctx, f)).collect::<Vec<_>>();
  build_wast_module(
    heap,
    &metadata,
    &type_definitions,
    &main_function_names,
    &functions,
    function_fields,
  )
  .encode()
  .unwrap()
}

#[cfg(test)]
pub(crate) fn print_for_test(heap: &mut Heap, sources: lir::Sources) -> String {
  wasmprinter::print_bytes(compile_lir_to_binary(heap, sources)).unwrap()
}

#[cfg(test)]
mod tests {
  use super::{NamePool, lir_ref_type, print_for_test};
  use dupe::Dupe;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::{BinaryOperator, GlobalString},
    lir::{
      self, ANY_POINTER_TYPE, Expression, Function, GenenalLoopVariable, INT_31_TYPE, INT_32_TYPE,
      Sources, Statement, ZERO,
    },
    mir,
  };
  use samlang_heap::{Heap, PStr};
  use std::collections::HashMap;

  fn empty_pool() -> NamePool {
    NamePool {
      function_names: HashMap::new(),
      type_names: HashMap::new(),
      local_names: HashMap::new(),
      data_segment_names: HashMap::new(),
      labels: Vec::new(),
    }
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
    let actual = print_for_test(heap, sources);
    // The encoded type name has a leading underscore (`$_TestStruct`); wasmprinter
    // emits the flat form `struct.new $_TestStruct`.
    assert!(actual.contains("struct.new $_TestStruct"));
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
    let actual = print_for_test(heap, sources);
    assert!(actual.contains("struct.get"));
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
    let actual = print_for_test(heap, sources);
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
    let actual = print_for_test(heap, sources);
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
    let actual = print_for_test(heap, sources);
    // Cast from AnyPointer to struct type should use ref.cast
    assert!(actual.contains("ref.cast"));
  }

  #[test]
  fn vec_helper_predicates_test() {
    use mir::FunctionName;
    assert_eq!(Some(1), super::vec_fn_element_arg_index(FunctionName::VEC_OF));
    assert_eq!(Some(1), super::vec_fn_element_arg_index(FunctionName::VEC_PUSH));
    assert_eq!(Some(2), super::vec_fn_element_arg_index(FunctionName::VEC_SET));
    assert_eq!(None, super::vec_fn_element_arg_index(FunctionName::VEC_LENGTH));
    assert_eq!(None, super::vec_fn_element_arg_index(FunctionName::STR_FROM_INT));

    assert!(super::vec_fn_returns_element(FunctionName::VEC_POP));
    assert!(super::vec_fn_returns_element(FunctionName::VEC_GET));
    assert!(!super::vec_fn_returns_element(FunctionName::VEC_LENGTH));

    assert!(super::vec_fn_is_static(FunctionName::VEC_EMPTY));
    assert!(super::vec_fn_is_static(FunctionName::VEC_OF));
    assert!(super::vec_fn_is_static(FunctionName::VEC_WITH_CAPACITY));
    assert!(!super::vec_fn_is_static(FunctionName::VEC_PUSH));

    assert!(super::lir_expr_is_i32(&Expression::Int32Literal(0)));
    assert!(super::lir_expr_is_i32(&Expression::Variable(PStr::LOWER_A, INT_32_TYPE)));
    assert!(!super::lir_expr_is_i32(&Expression::Int31Literal(0)));
    assert!(!super::lir_expr_is_i32(&Expression::Variable(PStr::LOWER_A, INT_31_TYPE)));
  }

  #[test]
  fn vec_call_lowering_test() {
    let heap = &mut Heap::new();
    let symbol_table = mir::SymbolTable::new();
    let some_struct_id = mir::TypeNameId::STR; // any reference type works

    // Vec<int>::push(this, i32 literal) → second arg should be i31-boxed.
    // Vec<int>::pop(this): i32 → result should go through __$unwrapI31.
    // Vec<Foo>::get(this, idx): Foo → result should be ref.cast.
    let sources = Sources {
      symbol_table,
      global_variables: Vec::new(),
      type_definitions: Vec::new(),
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![heap.alloc_str_for_test("v")],
        type_: lir::Type::new_fn_unwrapped(vec![lir::Type::Id(mir::TypeNameId::VEC)], INT_32_TYPE),
        body: vec![
          // Vec.empty() — static, exercises needs_ref_eq_this for Vec.
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::VEC_EMPTY,
              lir::Type::new_fn_unwrapped(vec![INT_32_TYPE], lir::Type::Id(mir::TypeNameId::VEC)),
            ),
            arguments: vec![ZERO],
            return_type: lir::Type::Id(mir::TypeNameId::VEC),
            return_collector: Some(heap.alloc_str_for_test("v0")),
          },
          // vec.push(42) — exercises VEC_PUSH element-arg boxing of an i32 literal.
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::VEC_PUSH,
              lir::Type::new_fn_unwrapped(
                vec![lir::Type::Id(mir::TypeNameId::VEC), INT_32_TYPE],
                INT_32_TYPE,
              ),
            ),
            arguments: vec![
              Expression::Variable(
                heap.alloc_str_for_test("v"),
                lir::Type::Id(mir::TypeNameId::VEC),
              ),
              Expression::Int32Literal(42),
            ],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
          // vec.pop(): i32 — exercises VEC_POP unwrap-to-i32 path.
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::VEC_POP,
              lir::Type::new_fn_unwrapped(vec![lir::Type::Id(mir::TypeNameId::VEC)], INT_32_TYPE),
            ),
            arguments: vec![Expression::Variable(
              heap.alloc_str_for_test("v"),
              lir::Type::Id(mir::TypeNameId::VEC),
            )],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("popped")),
          },
          // vec.get(0): Str — exercises VEC_GET ref.cast path for an Id return.
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::VEC_GET,
              lir::Type::new_fn_unwrapped(
                vec![lir::Type::Id(mir::TypeNameId::VEC), INT_32_TYPE],
                lir::Type::Id(some_struct_id),
              ),
            ),
            arguments: vec![
              Expression::Variable(
                heap.alloc_str_for_test("v"),
                lir::Type::Id(mir::TypeNameId::VEC),
              ),
              ZERO,
            ],
            return_type: lir::Type::Id(some_struct_id),
            return_collector: Some(heap.alloc_str_for_test("got")),
          },
          // vec.set(0, 7) — exercises VEC_SET element-arg boxing at index 2.
          Statement::Call {
            callee: Expression::FnName(
              mir::FunctionName::VEC_SET,
              lir::Type::new_fn_unwrapped(
                vec![lir::Type::Id(mir::TypeNameId::VEC), INT_32_TYPE, INT_32_TYPE],
                INT_32_TYPE,
              ),
            ),
            arguments: vec![
              Expression::Variable(
                heap.alloc_str_for_test("v"),
                lir::Type::Id(mir::TypeNameId::VEC),
              ),
              ZERO,
              Expression::Int32Literal(7),
            ],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
        ],
        return_value: ZERO,
      }],
    };
    let actual = print_for_test(heap, sources);
    // Boxing: i32 literal 42 boxed via ref.i31 in the push call. wasmprinter is flat:
    // `i32.const 42; ref.i31; ...; call $__Vec$push`.
    assert!(actual.contains("call $__Vec$push"));
    assert!(actual.contains("i32.const 42"));
    assert!(actual.contains("ref.i31"));
    // Unwrap path: pop -> __$unwrapI31.
    assert!(actual.contains("call $__$unwrapI31"));
    // Cast path: get -> ref.cast to the concrete reference type. Flat post-order:
    // `...; call $__Vec$get; ref.cast (ref $_Str)`.
    assert!(actual.contains("ref.cast (ref $_Str)"));
    assert!(actual.contains("call $__Vec$get"));
    // Set with i32 literal 7 also boxed.
    assert!(actual.contains("call $__Vec$set"));
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
      functions: vec![
        Function {
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
            // Test binary comparison with StringName (string NE -> call __Str$eq + xor)
            Statement::binary(
              heap.alloc_str_for_test("bin8"),
              BinaryOperator::NE,
              Expression::StringName(heap.alloc_str_for_test("FOO")),
              Expression::StringName(heap.alloc_str_for_test("BAR")),
            ),
            // Test binary comparison with StringName (string EQ -> call __Str$eq)
            Statement::binary(
              heap.alloc_str_for_test("bin9"),
              BinaryOperator::EQ,
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
              callee: Expression::Variable(
                PStr::LOWER_F,
                lir::Type::new_fn(Vec::new(), INT_32_TYPE),
              ),
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
        },
        // Helper function that takes a concrete TestStruct type
        Function {
          name: mir::FunctionName::new_for_test(heap.alloc_str_for_test("helper")),
          parameters: vec![heap.alloc_str_for_test("arg")],
          type_: lir::Type::new_fn_unwrapped(vec![lir::Type::Id(test_struct_type)], INT_32_TYPE),
          body: vec![],
          return_value: ZERO,
        },
        // Helper function that takes AnyPointer (no cast needed)
        Function {
          name: mir::FunctionName::new_for_test(heap.alloc_str_for_test("helper2")),
          parameters: vec![heap.alloc_str_for_test("arg")],
          type_: lir::Type::new_fn_unwrapped(vec![lir::ANY_POINTER_TYPE], INT_32_TYPE),
          body: vec![],
          return_value: ZERO,
        },
        // Method function with _this parameter (AnyPointer) that calls helpers
        Function {
          name: mir::FunctionName::new_for_test(heap.alloc_str_for_test("method")),
          parameters: vec![PStr::UNDERSCORE_THIS],
          type_: lir::Type::new_fn_unwrapped(vec![lir::ANY_POINTER_TYPE], INT_32_TYPE),
          body: vec![
            // Call helper expecting concrete type -> needs ref.cast
            Statement::Call {
              callee: Expression::FnName(
                mir::FunctionName::new_for_test(heap.alloc_str_for_test("helper")),
                lir::Type::new_fn_unwrapped(vec![lir::Type::Id(test_struct_type)], INT_32_TYPE),
              ),
              arguments: vec![Expression::Variable(
                PStr::UNDERSCORE_THIS,
                lir::Type::Id(test_struct_type),
              )],
              return_type: INT_32_TYPE,
              return_collector: Some(heap.alloc_str_for_test("result")),
            },
            // Call helper2 expecting AnyPointer -> no cast needed (covers false branch)
            Statement::Call {
              callee: Expression::FnName(
                mir::FunctionName::new_for_test(heap.alloc_str_for_test("helper2")),
                lir::Type::new_fn_unwrapped(vec![lir::ANY_POINTER_TYPE], INT_32_TYPE),
              ),
              arguments: vec![Expression::Variable(PStr::UNDERSCORE_THIS, lir::ANY_POINTER_TYPE)],
              return_type: INT_32_TYPE,
              return_collector: Some(heap.alloc_str_for_test("result2")),
            },
          ],
          return_value: Expression::Variable(heap.alloc_str_for_test("result"), INT_32_TYPE),
        },
      ],
    };
    let actual = print_for_test(heap, sources);
    let expected = r#"(module
  (rec
    (type $_Str (;0;) (array (mut i8)))
    (type $_VecData (;1;) (array (mut eqref)))
    (type $_Vec (;2;) (struct (field (mut (ref $_VecData))) (field (mut i32))))
    (type $__t0 (;3;) (func (result i32)))
    (type $__t1 (;4;) (func (param (ref eq)) (result i32)))
    (type $_TestStruct (;5;) (struct (field i32) (field i32) (field i32) (field i32)))
    (type $_RefStruct (;6;) (struct (field (ref eq))))
  )
  (type (;7;) (func (param (ref eq) (ref $_Str)) (result i32)))
  (type (;8;) (func (param (ref $_Str)) (result i32)))
  (type (;9;) (func (param (ref $_Str) i32) (result i32)))
  (type (;10;) (func (param (ref $_Str) (ref $_Str)) (result i32)))
  (type (;11;) (func (param i32 i32) (result (ref $_Str))))
  (type (;12;) (func (param (ref eq) i32) (result (ref $_Str))))
  (type (;13;) (func (param (ref $_Str) (ref $_Str)) (result (ref $_Str))))
  (type (;14;) (func (param (ref eq)) (result i32)))
  (type (;15;) (func (param (ref eq)) (result (ref $_Vec))))
  (type (;16;) (func (param (ref eq) i32) (result (ref $_Vec))))
  (type (;17;) (func (param (ref eq) eqref) (result (ref $_Vec))))
  (type (;18;) (func (param (ref $_Vec)) (result i32)))
  (type (;19;) (func (param (ref $_Vec) i32) (result i32)))
  (type (;20;) (func (param (ref $_Vec) eqref) (result i32)))
  (type (;21;) (func (param (ref $_Vec)) (result (ref eq))))
  (type (;22;) (func (param (ref $_Vec) i32) (result (ref eq))))
  (type (;23;) (func (param (ref $_Vec) i32 eqref) (result i32)))
  (type (;24;) (func (param (ref $_Vec) (ref $_Vec)) (result i32)))
  (type (;25;) (func (param i32) (result i32)))
  (type (;26;) (func (param (ref $_TestStruct)) (result i32)))
  (type (;27;) (func))
  (import "builtins" "__Process$println" (func $__Process$println (;0;) (type 7)))
  (import "builtins" "__Process$panic" (func $__Process$panic (;1;) (type 7)))
  (table $0 (;0;) 4 funcref)
  (global $g1 (;0;) (mut (ref null $_Str)) ref.null $_Str)
  (global $GLOBAL_STRING_0 (;1;) (mut (ref null $_Str)) ref.null $_Str)
  (global $GLOBAL_STRING_1 (;2;) (mut (ref null $_Str)) ref.null $_Str)
  (export "__strLen" (func $__$strLen))
  (export "__strGet" (func $__$strGet))
  (export "__$main" (func $__$main))
  (start $__$init_globals)
  (elem $0 (;0;) (i32.const 0) func $__$main $__$helper $__$helper2 $__$method)
  (func $__$strLen (;2;) (type 8) (param $str (ref $_Str)) (result i32)
    local.get $str
    array.len
  )
  (func $__$strGet (;3;) (type 9) (param $str (ref $_Str)) (param $idx i32) (result i32)
    local.get $str
    local.get $idx
    array.get_s $_Str
  )
  (func $__Str$eq (;4;) (type 10) (param $a (ref $_Str)) (param $b (ref $_Str)) (result i32)
    (local $len i32) (local $i i32)
    local.get $a
    local.get $b
    ref.eq
    if ;; label = @1
      i32.const 1
      return
    end
    local.get $a
    array.len
    local.set $len
    local.get $len
    local.get $b
    array.len
    i32.ne
    if ;; label = @1
      i32.const 0
      return
    end
    i32.const 0
    local.set $i
    block $done
      loop $loop
        local.get $i
        local.get $len
        i32.ge_s
        br_if $done
        local.get $a
        local.get $i
        array.get_s $_Str
        local.get $b
        local.get $i
        array.get_s $_Str
        i32.ne
        if ;; label = @3
          i32.const 0
          return
        end
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $loop
      end
    end
    i32.const 1
  )
  (func $__$getBuiltinString (;5;) (type 11) (param $offset i32) (param $size i32) (result (ref $_Str))
    local.get $offset
    local.get $size
    array.new_data $_Str $d0
  )
  (func $__Str$fromInt (;6;) (type 12) (param $this (ref eq)) (param $p0 i32) (result (ref $_Str))
    (local $conversion_result (ref null $_Str)) (local $is_negative i32) (local $temp i32) (local $arr_size i32) (local $len i32) (local $new_in i32) (local $arr_half_point i32) (local $rev_index i32)
    ref.null $_Str
    local.set $conversion_result
    block $B0
      block $B1
        local.get $p0
        i32.const -2147483648
        i32.eq
        br_if $B1
        block $B2
          local.get $p0
          br_if $B2
          i32.const 0
          i32.const 1
          array.new_data $_Str $d0
          local.set $conversion_result
          br $B0
        end
        local.get $p0
        local.set $temp
        i32.const 0
        local.set $is_negative
        i32.const 0
        local.set $len
        i32.const 0
        local.set $arr_size
        block $is_negative_block
          local.get $p0
          i32.const -1
          i32.gt_s
          br_if $is_negative_block
          i32.const 0
          local.get $p0
          i32.sub
          local.set $p0
          i32.const 1
          local.set $is_negative
          i32.const 1
          local.set $len
          i32.const 1
          local.set $arr_size
        end
        block $negate_temp_block
          local.get $temp
          i32.const -1
          i32.gt_s
          br_if $negate_temp_block
          i32.const 0
          local.get $temp
          i32.sub
          local.set $temp
        end
        block $find_size_block
          loop $find_size_loop
            local.get $temp
            i32.const 1
            i32.lt_s
            br_if $find_size_block
            local.get $temp
            i32.const 10
            i32.div_u
            local.set $temp
            local.get $arr_size
            i32.const 1
            i32.add
            local.set $arr_size
            br $find_size_loop
          end
        end
        i32.const 0
        local.get $arr_size
        array.new $_Str
        local.set $conversion_result
        block $set_negative_sign_block
          local.get $is_negative
          i32.eqz
          br_if $set_negative_sign_block
          local.get $conversion_result
          i32.const 0
          i32.const 45
          array.set $_Str
        end
        block $set_characters_loop_block
          loop $set_characters_loop
            local.get $p0
            i32.const 1
            i32.lt_s
            br_if $set_characters_loop_block
            local.get $conversion_result
            local.get $len
            local.get $p0
            local.get $p0
            i32.const 10
            i32.div_u
            local.tee $new_in
            i32.const 10
            i32.mul
            i32.sub
            i32.const 48
            i32.or
            array.set $_Str
            local.get $len
            i32.const 1
            i32.add
            local.set $len
            local.get $new_in
            local.set $p0
            br $set_characters_loop
          end
        end
        local.get $len
        local.get $is_negative
        i32.sub
        i32.const 2
        i32.div_u
        local.get $is_negative
        i32.add
        local.set $arr_half_point
        local.get $is_negative
        local.set $len
        block $reverse_block
          loop $reverse_block_loop
            local.get $len
            local.get $arr_half_point
            i32.ge_s
            br_if $B0
            local.get $conversion_result
            local.get $len
            array.get_s $_Str
            local.set $temp
            local.get $arr_size
            local.get $len
            i32.sub
            i32.const 1
            i32.sub
            local.get $is_negative
            i32.add
            local.set $rev_index
            local.get $conversion_result
            local.get $len
            local.get $conversion_result
            local.get $rev_index
            array.get_s $_Str
            array.set $_Str
            local.get $conversion_result
            local.get $rev_index
            local.get $temp
            array.set $_Str
            local.get $len
            i32.const 1
            i32.add
            local.set $len
            br $reverse_block_loop
          end
        end
      end
      i32.const 2
      i32.const 11
      array.new_data $_Str $d0
      local.set $conversion_result
    end
    local.get $conversion_result
    ref.cast (ref $_Str)
  )
  (func $__Str$toInt (;7;) (type 8) (param $p0 (ref $_Str)) (result i32)
    (local $len i32) (local $neg i32) (local $num i32) (local $character i32) (local $i i32) (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32)
    local.get $p0
    array.len
    local.set $len
    block $B0
      block $B0
        local.get $len
        br_if $B0
      end
      i32.const 45
      local.get $p0
      i32.const 0
      array.get_s $_Str
      i32.eq
      local.set $neg
      i32.const 0
      local.set $num
      local.get $neg
      local.set $i
      block $B1
        loop $L2
          local.get $i
          local.get $len
          i32.ge_s
          br_if $B1
          local.get $p0
          local.get $i
          array.get_s $_Str
          local.set $character
          local.get $character
          i32.const -48
          i32.add
          i32.const 255
          i32.and
          i32.const 9
          i32.gt_u
          br_if $B0
          local.get $i
          i32.const 1
          i32.add
          local.set $i
          local.get $num
          i32.const 10
          i32.mul
          local.get $character
          i32.add
          i32.const -48
          i32.add
          local.set $num
          br $L2
        end
      end
      i32.const 0
      local.get $num
      i32.sub
      local.get $num
      local.get $neg
      select
      return
    end
    i32.const 0
  )
  (func $__Str$concat (;8;) (type 13) (param $p0 (ref $_Str)) (param $p1 (ref $_Str)) (result (ref $_Str))
    (local $len1 i32) (local $len2 i32) (local $total_len i32) (local $index i32) (local $new_array (ref null $_Str))
    local.get $p0
    array.len
    local.set $len1
    local.get $p1
    array.len
    local.set $len2
    local.get $len1
    local.get $len2
    i32.add
    local.set $total_len
    i32.const 0
    local.get $total_len
    array.new $_Str
    local.set $new_array
    i32.const 0
    local.set $index
    block $copy_first_arr_block
      loop $copy_first_arr_loop
        local.get $index
        local.get $len1
        i32.ge_s
        br_if $copy_first_arr_block
        local.get $new_array
        ref.as_non_null
        local.get $index
        local.get $p0
        local.get $index
        array.get_s $_Str
        array.set $_Str
        local.get $index
        i32.const 1
        i32.add
        local.set $index
        br $copy_first_arr_loop
      end
    end
    i32.const 0
    local.set $index
    block $copy_second_arr_block
      loop $copy_second_arr_loop
        local.get $index
        local.get $len2
        i32.ge_s
        br_if $copy_second_arr_block
        local.get $new_array
        ref.as_non_null
        local.get $len1
        local.get $index
        i32.add
        local.get $p1
        local.get $index
        array.get_s $_Str
        array.set $_Str
        local.get $index
        i32.const 1
        i32.add
        local.set $index
        br $copy_second_arr_loop
      end
    end
    local.get $new_array
    ref.as_non_null
  )
  (func $__$unwrapI31 (;9;) (type 14) (param $v (ref eq)) (result i32)
    local.get $v
    ref.cast (ref i31)
    i31.get_s
  )
  (func $__Vec$empty (;10;) (type 15) (param $_this (ref eq)) (result (ref $_Vec))
    ref.null eq
    i32.const 0
    array.new $_VecData
    i32.const 0
    struct.new $_Vec
  )
  (func $__Vec$withCapacity (;11;) (type 16) (param $_this (ref eq)) (param $cap i32) (result (ref $_Vec))
    ref.null eq
    local.get $cap
    array.new $_VecData
    i32.const 0
    struct.new $_Vec
  )
  (func $__Vec$of (;12;) (type 17) (param $_this (ref eq)) (param $v eqref) (result (ref $_Vec))
    (local $d (ref $_VecData))
    local.get $v
    i32.const 1
    array.new $_VecData
    local.set $d
    local.get $d
    i32.const 1
    struct.new $_Vec
  )
  (func $__Vec$length (;13;) (type 18) (param $this (ref $_Vec)) (result i32)
    local.get $this
    struct.get $_Vec 1
  )
  (func $__Vec$capacity (;14;) (type 18) (param $this (ref $_Vec)) (result i32)
    local.get $this
    struct.get $_Vec 0
    array.len
  )
  (func $__Vec$reserve (;15;) (type 19) (param $this (ref $_Vec)) (param $min i32) (result i32)
    (local $cap i32) (local $new_cap i32) (local $old (ref $_VecData)) (local $new (ref $_VecData)) (local $len i32)
    local.get $this
    struct.get $_Vec 0
    local.set $old
    local.get $old
    array.len
    local.set $cap
    block $no_grow
      local.get $min
      local.get $cap
      i32.le_s
      br_if $no_grow
      local.get $cap
      i32.const 1
      i32.shl
      local.set $new_cap
      local.get $new_cap
      local.get $min
      i32.lt_s
      if ;; label = @2
        local.get $min
        local.set $new_cap
      end
      local.get $new_cap
      i32.const 4
      i32.lt_s
      if ;; label = @2
        i32.const 4
        local.set $new_cap
      end
      ref.null eq
      local.get $new_cap
      array.new $_VecData
      local.set $new
      local.get $this
      struct.get $_Vec 1
      local.set $len
      local.get $new
      i32.const 0
      local.get $old
      i32.const 0
      local.get $len
      array.copy $_VecData $_VecData
      local.get $this
      local.get $new
      struct.set $_Vec 0
    end
    i32.const 0
  )
  (func $__Vec$push (;16;) (type 20) (param $this (ref $_Vec)) (param $v eqref) (result i32)
    (local $len i32)
    local.get $this
    struct.get $_Vec 1
    local.set $len
    local.get $this
    local.get $len
    i32.const 1
    i32.add
    call $__Vec$reserve
    drop
    local.get $this
    struct.get $_Vec 0
    local.get $len
    local.get $v
    array.set $_VecData
    local.get $this
    local.get $len
    i32.const 1
    i32.add
    struct.set $_Vec 1
    i32.const 0
  )
  (func $__Vec$pop (;17;) (type 21) (param $this (ref $_Vec)) (result (ref eq))
    (local $len i32) (local $v eqref)
    local.get $this
    struct.get $_Vec 1
    local.set $len
    local.get $len
    i32.eqz
    if ;; label = @1
      unreachable
    end
    local.get $len
    i32.const 1
    i32.sub
    local.set $len
    local.get $this
    struct.get $_Vec 0
    local.get $len
    array.get $_VecData
    local.set $v
    local.get $this
    struct.get $_Vec 0
    local.get $len
    ref.null eq
    array.set $_VecData
    local.get $this
    local.get $len
    struct.set $_Vec 1
    local.get $v
    ref.as_non_null
  )
  (func $__Vec$get (;18;) (type 22) (param $this (ref $_Vec)) (param $i i32) (result (ref eq))
    local.get $i
    local.get $this
    struct.get $_Vec 1
    i32.ge_u
    if ;; label = @1
      unreachable
    end
    local.get $this
    struct.get $_Vec 0
    local.get $i
    array.get $_VecData
    ref.as_non_null
  )
  (func $__Vec$set (;19;) (type 23) (param $this (ref $_Vec)) (param $i i32) (param $v eqref) (result i32)
    local.get $i
    local.get $this
    struct.get $_Vec 1
    i32.ge_u
    if ;; label = @1
      unreachable
    end
    local.get $this
    struct.get $_Vec 0
    local.get $i
    local.get $v
    array.set $_VecData
    i32.const 0
  )
  (func $__Vec$eq (;20;) (type 24) (param $a (ref $_Vec)) (param $b (ref $_Vec)) (result i32)
    (local $len i32) (local $i i32) (local $ad (ref $_VecData)) (local $bd (ref $_VecData))
    local.get $a
    local.get $b
    ref.eq
    if ;; label = @1
      i32.const 1
      return
    end
    local.get $a
    struct.get $_Vec 1
    local.set $len
    local.get $len
    local.get $b
    struct.get $_Vec 1
    i32.ne
    if ;; label = @1
      i32.const 0
      return
    end
    local.get $a
    struct.get $_Vec 0
    local.set $ad
    local.get $b
    struct.get $_Vec 0
    local.set $bd
    i32.const 0
    local.set $i
    block $done
      loop $loop
        local.get $i
        local.get $len
        i32.ge_s
        br_if $done
        local.get $ad
        local.get $i
        array.get $_VecData
        local.get $bd
        local.get $i
        array.get $_VecData
        ref.eq
        i32.eqz
        if ;; label = @3
          i32.const 0
          return
        end
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $loop
      end
    end
    i32.const 1
  )
  (func $__$main (;21;) (type 25) (param $bar i32) (result i32)
    (local $b i32) (local $bin i32) (local $bin1 i32) (local $bin2 i32) (local $bin3 i32) (local $bin4 i32) (local $bin5 i32) (local $bin6 i32) (local $bin7 i32) (local $bin8 i32) (local $bin9 i32) (local $bin_gt i32) (local $bin_land i32) (local $bin_lor i32) (local $bin_lt i32) (local $bin_shl i32) (local $bin_shr i32) (local $c i32) (local $f i32) (local $i i32) (local $rc i32) (local $rs (ref null $_RefStruct)) (local $s (ref null $_TestStruct)) (local $struct_ptr (ref null $_TestStruct)) (local $un1 i32) (local $un2 i32) (local $v i32)
    i32.const 0
    i32.const 1
    i32.xor
    if ;; label = @1
      i32.const 0
      local.set $c
    end
    i32.const 0
    if ;; label = @1
      i32.const 0
      local.set $i
      loop $l0
        block $l1
          i32.const 0
          local.set $c
          i32.const 0
          local.set $c
          i32.const 0
          local.set $i
          br $l0
        end
      end
      global.get $GLOBAL_STRING_0
      ref.as_non_null
      local.set $f
    else
      loop $l2
        block $l3
          i32.const 0
          if ;; label = @4
            i32.const 0
            local.set $b
            br $l3
          end
          br $l2
        end
      end
      loop $l4
        block $l5
          i32.const 0
          i32.const 1
          i32.xor
          if ;; label = @4
            br $l5
          end
          br $l4
        end
      end
      i32.const 0
      local.set $f
    end
    i32.const 0
    i32.const 1
    i32.xor
    local.set $un1
    i32.const 0
    ref.test (ref $_Str)
    local.set $un2
    local.get $f
    i32.const 0
    i32.add
    local.set $bin
    local.get $f
    i32.const 0
    i32.mul
    local.set $bin1
    local.get $f
    i32.const 0
    i32.div_s
    local.set $bin2
    local.get $f
    i32.const 0
    i32.le_s
    local.set $bin3
    local.get $f
    i32.const 0
    i32.ge_s
    local.set $bin4
    local.get $f
    i32.const 0
    i32.ne
    local.set $bin5
    local.get $f
    i32.const 0
    i32.rem_s
    local.set $bin6
    local.get $f
    i32.const 0
    i32.and
    local.set $bin_land
    local.get $f
    i32.const 0
    i32.or
    local.set $bin_lor
    local.get $f
    i32.const 0
    i32.shl
    local.set $bin_shl
    local.get $f
    i32.const 0
    i32.shr_u
    local.set $bin_shr
    local.get $f
    i32.const 0
    i32.lt_s
    local.set $bin_lt
    local.get $f
    i32.const 0
    i32.gt_s
    local.set $bin_gt
    i32.const 1
    ref.i31
    i32.const 2
    ref.i31
    ref.eq
    local.set $bin7
    global.get $GLOBAL_STRING_0
    ref.as_non_null
    global.get $GLOBAL_STRING_1
    ref.as_non_null
    call $__Str$eq
    i32.const 1
    i32.xor
    local.set $bin8
    global.get $GLOBAL_STRING_0
    ref.as_non_null
    global.get $GLOBAL_STRING_1
    ref.as_non_null
    call $__Str$eq
    local.set $bin9
    i32.const 0
    call $__$main
    drop
    i32.const 0
    local.get $f
    call_indirect (type $__t0)
    local.set $rc
    local.get $struct_ptr
    ref.as_non_null
    struct.get $_TestStruct 3
    local.set $v
    i32.const 0
    local.get $v
    i32.const 0
    i32.const 0
    struct.new $_TestStruct
    local.set $s
    i32.const 0
    ref.i31
    struct.new $_RefStruct
    local.set $rs
    i32.const 0
  )
  (func $__$helper (;22;) (type 26) (param $arg (ref $_TestStruct)) (result i32)
    i32.const 0
  )
  (func $__$helper2 (;23;) (type 14) (param $arg (ref eq)) (result i32)
    i32.const 0
  )
  (func $__$method (;24;) (type $__t1) (param $_this (ref eq)) (result i32)
    (local $result i32) (local $result2 i32)
    local.get $_this
    ref.as_non_null
    ref.cast (ref $_TestStruct)
    call $__$helper
    local.set $result
    local.get $_this
    ref.as_non_null
    call $__$helper2
    local.set $result2
    local.get $result
  )
  (func $__$init_globals (;25;) (type 27)
    i32.const 0
    i32.const 3
    array.new_data $_Str $d2
    global.set $GLOBAL_STRING_0
    i32.const 3
    i32.const 3
    array.new_data $_Str $d2
    global.set $GLOBAL_STRING_1
  )
  (data $d0 (;0;) "0\00-2147483648")
  (data $d2 (;1;) "FOOBAR")
)
"#;
    assert_eq!(expected, actual);
  }

  #[test]
  #[should_panic(expected = "Non-pointer type in ref.cast/ref.test position.")]
  fn lir_ref_type_int32_panics() {
    lir_ref_type(&empty_pool(), &INT_32_TYPE);
  }

  #[test]
  #[should_panic(expected = "Non-pointer type in ref.cast/ref.test position.")]
  fn lir_ref_type_fn_panics() {
    lir_ref_type(&empty_pool(), &lir::Type::new_fn(Vec::new(), INT_32_TYPE));
  }

  #[test]
  fn lir_ref_type_abstract_ok() {
    // The Int31 / AnyPointer arms are unreachable from valid LIR, so exercise them directly.
    let pool = empty_pool();
    let _ = lir_ref_type(&pool, &INT_31_TYPE);
    let _ = lir_ref_type(&pool, &ANY_POINTER_TYPE);
  }

  #[test]
  fn empty_module_has_libsam() {
    let heap = &mut Heap::new();
    let actual = print_for_test(
      heap,
      Sources {
        symbol_table: mir::SymbolTable::new(),
        global_variables: Vec::new(),
        type_definitions: Vec::new(),
        main_function_names: Vec::new(),
        functions: Vec::new(),
      },
    );
    assert!(actual.contains("__Str$fromInt"));
    assert!(actual.contains("__Vec$push"));
  }

  fn indexed_access_of(pointer_expression: Expression) -> Sources {
    let heap = &mut Heap::new();
    Sources {
      symbol_table: mir::SymbolTable::new(),
      global_variables: Vec::new(),
      type_definitions: Vec::new(),
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: lir::Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![Statement::IndexedAccess {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
          pointer_expression,
          index: 0,
        }],
        return_value: ZERO,
      }],
    }
  }

  #[test]
  #[should_panic(expected = "Int32Literal in place that expects struct typed values.")]
  fn indexed_access_int32_pointer_panics() {
    print_for_test(&mut Heap::new(), indexed_access_of(Expression::Int32Literal(0)));
  }

  #[test]
  #[should_panic(expected = "Int31Literal in place that expects struct typed values.")]
  fn indexed_access_int31_pointer_panics() {
    print_for_test(&mut Heap::new(), indexed_access_of(Expression::Int31Literal(0)));
  }

  #[test]
  #[should_panic(expected = "FnName in place that expects struct typed values.")]
  fn indexed_access_fn_name_pointer_panics() {
    print_for_test(
      &mut Heap::new(),
      indexed_access_of(Expression::FnName(
        mir::FunctionName::new_for_test(PStr::MAIN_FN),
        lir::Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
      )),
    );
  }

  #[test]
  #[should_panic(expected = "The given expression doesn't have reference type.")]
  fn indexed_access_non_reference_pointer_panics() {
    print_for_test(
      &mut Heap::new(),
      indexed_access_of(Expression::Variable(PStr::LOWER_A, INT_32_TYPE)),
    );
  }

  // Covers the branches not reached by `comprehensive_test`: all 16 `i32` binary operators via a
  // direct `Statement::Binary` (so `MINUS` is not rewritten), extensible + subtype type
  // definitions, `Int31` / `Eq` locals and an `Int31` struct field, and a reference-returning
  // function (so the return value is wrapped in `ref.as_non_null`).
  #[test]
  fn remaining_branches_test() {
    let heap = &mut Heap::new();
    let mut symbol_table = mir::SymbolTable::new();
    let parent = symbol_table.create_type_name_for_test(heap.alloc_str_for_test("Parent"));
    let child = symbol_table.create_type_name_for_test(heap.alloc_str_for_test("Child"));

    let all_ops = [
      BinaryOperator::MUL,
      BinaryOperator::DIV,
      BinaryOperator::MOD,
      BinaryOperator::PLUS,
      BinaryOperator::MINUS,
      BinaryOperator::LAND,
      BinaryOperator::LOR,
      BinaryOperator::SHL,
      BinaryOperator::SHR,
      BinaryOperator::XOR,
      BinaryOperator::LT,
      BinaryOperator::LE,
      BinaryOperator::GT,
      BinaryOperator::GE,
      BinaryOperator::EQ,
      BinaryOperator::NE,
    ];
    let x = heap.alloc_str_for_test("x");
    let mut body = all_ops
      .iter()
      .map(|op| Statement::Binary {
        name: heap.alloc_str_for_test("b"),
        operator: *op,
        e1: Expression::Variable(x.dupe(), INT_32_TYPE),
        e2: Expression::Variable(x.dupe(), INT_32_TYPE),
      })
      .collect::<Vec<_>>();
    // An Int31 local (nullable Int31 local slot) and an Eq local (reading an AnyPointer variable).
    body.push(Statement::Cast {
      name: heap.alloc_str_for_test("i31l"),
      type_: INT_31_TYPE,
      assigned_expression: Expression::Int31Literal(5),
    });
    body.push(Statement::Cast {
      name: heap.alloc_str_for_test("eql"),
      type_: ANY_POINTER_TYPE,
      assigned_expression: Expression::Variable(heap.alloc_str_for_test("y"), ANY_POINTER_TYPE),
    });
    // A reference (non-string) NE comparison -> ref.eq followed by (i32.xor ... 1).
    body.push(Statement::Binary {
      name: heap.alloc_str_for_test("refne"),
      operator: BinaryOperator::NE,
      e1: Expression::Int31Literal(1),
      e2: Expression::Int31Literal(2),
    });
    // An indirect call whose function type has a reference-typed parameter and return, so the
    // named function type registers those reference type names.
    body.push(Statement::Call {
      callee: Expression::Variable(
        heap.alloc_str_for_test("f"),
        lir::Type::new_fn(vec![lir::Type::Id(child)], lir::Type::Id(child)),
      ),
      arguments: vec![Expression::Variable(heap.alloc_str_for_test("a"), lir::Type::Id(child))],
      return_type: lir::Type::Id(child),
      return_collector: Some(heap.alloc_str_for_test("rc")),
    });
    // An if with a non-empty then and an empty else (no `else` block is emitted).
    body.push(Statement::IfElse {
      condition: Expression::Variable(x.dupe(), INT_32_TYPE),
      s1: vec![Statement::Cast {
        name: heap.alloc_str_for_test("ifl"),
        type_: INT_32_TYPE,
        assigned_expression: ZERO,
      }],
      s2: Vec::new(),
      final_assignments: Vec::new(),
    });

    // Two closure functions (first param `_this`) with the *same* signature: the second reuses the
    // already-named function type.
    let closure_a = mir::FunctionName::new_for_test(heap.alloc_str_for_test("clA"));
    let closure_b = mir::FunctionName::new_for_test(heap.alloc_str_for_test("clB"));

    let sources = Sources {
      symbol_table,
      global_variables: Vec::new(),
      type_definitions: vec![
        lir::TypeDefinition {
          name: parent,
          parent_type: None,
          is_extensible: true,
          mappings: vec![INT_32_TYPE],
        },
        lir::TypeDefinition {
          name: child,
          parent_type: Some(parent),
          is_extensible: false,
          mappings: vec![INT_32_TYPE, INT_31_TYPE],
        },
      ],
      main_function_names: vec![mir::FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![
        Function {
          name: mir::FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![x],
          type_: lir::Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
          body,
          return_value: ZERO,
        },
        // Reference-returning function: the return value is wrapped in ref.as_non_null.
        Function {
          name: mir::FunctionName::new_for_test(heap.alloc_str_for_test("refret")),
          parameters: Vec::new(),
          type_: lir::Type::new_fn_unwrapped(Vec::new(), lir::Type::Id(child)),
          body: Vec::new(),
          return_value: Expression::Variable(heap.alloc_str_for_test("r"), lir::Type::Id(child)),
        },
        Function {
          name: closure_a,
          parameters: vec![PStr::UNDERSCORE_THIS],
          type_: lir::Type::new_fn_unwrapped(vec![ANY_POINTER_TYPE], INT_32_TYPE),
          body: Vec::new(),
          return_value: ZERO,
        },
        Function {
          name: closure_b,
          parameters: vec![PStr::UNDERSCORE_THIS],
          type_: lir::Type::new_fn_unwrapped(vec![ANY_POINTER_TYPE], INT_32_TYPE),
          body: Vec::new(),
          return_value: ZERO,
        },
      ],
    };
    let actual = print_for_test(heap, sources);
    // Subtyping text and every i32 binary op.
    assert!(actual.contains("sub $_Parent"), "missing Child subtype: {actual}");
    for wat in [
      "i32.mul",
      "i32.div_s",
      "i32.rem_s",
      "i32.add",
      "i32.sub",
      "i32.and",
      "i32.or",
      "i32.shl",
      "i32.shr_u",
      "i32.xor",
      "i32.lt_s",
      "i32.le_s",
      "i32.gt_s",
      "i32.ge_s",
      "i32.eq",
      "i32.ne",
    ] {
      assert!(actual.contains(wat), "missing {wat}");
    }
  }
}
