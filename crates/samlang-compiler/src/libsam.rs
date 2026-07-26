//! The samlang WASM runtime (previously `libsam.wat`), hand-translated into `wast` AST
//! constructions so the whole module can be encoded to binary without a text round-trip.
//!
//! Function bodies are written with the folded-expression combinators below: each
//! combinator takes its operands as nested expressions and emits the flat post-order
//! instruction sequence that wast expects, so `i32_add(lget("i"), i32c(1))` reads like
//! the WAT `(i32.add (local.get $i) (i32.const 1))` it encodes.
//!
//! It references the builtin GC types `$_Str`, `$_VecData` and `$_Vec` that are emitted
//! into the generated `(rec ...)` group by `wast_lowering`, so these fields are only
//! meaningful as part of that combined module.

use crate::wast_lowering::{block_type, expression, ref_abstract, ref_named, wid, widx, zspan};
use wast::core::{
  AbstractHeapType, ArrayCopy, ArrayNewData, Data, DataKind, DataVal, Func, FuncKind, FunctionType,
  Global, GlobalKind, GlobalType, HeapType, ImportItems, Imports, InlineExport, Instruction,
  ItemKind, ItemSig, Local, ModuleField, RefCast, RefType, SelectTypes, StructAccess, TypeUse,
  ValType,
};
use wast::token::Index;

// ----------------------------------------------------------------------------
// Value types
// ----------------------------------------------------------------------------

/// `i32`
fn i32t() -> ValType<'static> {
  ValType::I32
}

/// `(ref eq)`
fn ref_eq() -> ValType<'static> {
  ref_abstract(false, AbstractHeapType::Eq)
}

/// `(ref null eq)`
fn ref_null_eq() -> ValType<'static> {
  ref_abstract(true, AbstractHeapType::Eq)
}

/// `(ref $_Str)`
fn ref_str() -> ValType<'static> {
  ref_named(false, "_Str")
}

/// `(ref null $_Str)`
fn ref_null_str() -> ValType<'static> {
  ref_named(true, "_Str")
}

/// `(ref $_Vec)`
fn ref_vec() -> ValType<'static> {
  ref_named(false, "_Vec")
}

/// `(ref $_VecData)`
fn ref_vec_data() -> ValType<'static> {
  ref_named(false, "_VecData")
}

// ----------------------------------------------------------------------------
// Folded-expression combinators
//
// Each returns the flat instruction sequence of one folded WAT expression:
// operands first (left to right), the operator instruction last.
// ----------------------------------------------------------------------------

type Instrs = Vec<Instruction<'static>>;

/// The flat encoding of `(op operand...)`: all operands in order, then `op`.
fn fold(operands: Vec<Instrs>, op: Instruction<'static>) -> Instrs {
  let mut out: Instrs = operands.into_iter().flatten().collect();
  out.push(op);
  out
}

/// `(local.get $name)`
fn lget(name: &'static str) -> Instrs {
  vec![Instruction::LocalGet(widx(name))]
}

/// `(local.set $name value)`
fn lset(name: &'static str, value: Instrs) -> Instrs {
  fold(vec![value], Instruction::LocalSet(widx(name)))
}

/// `(local.tee $name value)`
fn ltee(name: &'static str, value: Instrs) -> Instrs {
  fold(vec![value], Instruction::LocalTee(widx(name)))
}

/// `(i32.const v)`
fn i32c(v: i32) -> Instrs {
  vec![Instruction::I32Const(v)]
}

/// `(ref.null eq)`
fn ref_null_eq_instr() -> Instrs {
  vec![Instruction::RefNull(HeapType::Abstract { shared: false, ty: AbstractHeapType::Eq })]
}

/// `(ref.null $_Str)`
fn ref_null_str_instr() -> Instrs {
  vec![Instruction::RefNull(HeapType::Concrete(widx("_Str")))]
}

/// `(<op> a b)` for each i32 binary operator, plus `(ref.eq a b)`.
macro_rules! binary_operators {
  ($($name:ident => $variant:ident),* $(,)?) => {
    $(fn $name(a: Instrs, b: Instrs) -> Instrs { fold(vec![a, b], Instruction::$variant) })*
  };
}
binary_operators! {
  i32_add => I32Add,
  i32_sub => I32Sub,
  i32_mul => I32Mul,
  i32_div_u => I32DivU,
  i32_and => I32And,
  i32_or => I32Or,
  i32_shl => I32Shl,
  i32_eq => I32Eq,
  i32_ne => I32Ne,
  i32_lt_s => I32LtS,
  i32_le_s => I32LeS,
  i32_gt_s => I32GtS,
  i32_gt_u => I32GtU,
  i32_ge_s => I32GeS,
  i32_ge_u => I32GeU,
  ref_eq_cmp => RefEq,
}

/// `(i32.eqz v)`
fn i32_eqz(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::I32Eqz)
}

/// `(array.len v)`
fn array_len(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::ArrayLen)
}

/// `(array.new $type init len)`
fn array_new(type_: &'static str, init: Instrs, len: Instrs) -> Instrs {
  fold(vec![init, len], Instruction::ArrayNew(widx(type_)))
}

/// `(array.new_data $type $data_segment offset size)`
fn array_new_data(
  type_: &'static str,
  data_segment: &'static str,
  offset: Instrs,
  size: Instrs,
) -> Instrs {
  fold(
    vec![offset, size],
    Instruction::ArrayNewData(ArrayNewData { array: widx(type_), data_idx: widx(data_segment) }),
  )
}

/// `(array.get $type array index)`
fn array_get(type_: &'static str, array: Instrs, index: Instrs) -> Instrs {
  fold(vec![array, index], Instruction::ArrayGet(widx(type_)))
}

/// `(array.get_s $type array index)`
fn array_get_s(type_: &'static str, array: Instrs, index: Instrs) -> Instrs {
  fold(vec![array, index], Instruction::ArrayGetS(widx(type_)))
}

/// `(array.set $type array index value)`
fn array_set(type_: &'static str, array: Instrs, index: Instrs, value: Instrs) -> Instrs {
  fold(vec![array, index, value], Instruction::ArraySet(widx(type_)))
}

/// `(array.copy $type $type dst dst_index src src_index len)`
fn array_copy(
  type_: &'static str,
  dst: Instrs,
  dst_index: Instrs,
  src: Instrs,
  src_index: Instrs,
  len: Instrs,
) -> Instrs {
  fold(
    vec![dst, dst_index, src, src_index, len],
    Instruction::ArrayCopy(ArrayCopy { dest_array: widx(type_), src_array: widx(type_) }),
  )
}

/// `(struct.new $type field...)`
fn struct_new(type_: &'static str, fields: Vec<Instrs>) -> Instrs {
  fold(fields, Instruction::StructNew(widx(type_)))
}

/// `(struct.get $type field struct_ref)`
fn struct_get(type_: &'static str, field: u32, struct_ref: Instrs) -> Instrs {
  fold(
    vec![struct_ref],
    Instruction::StructGet(StructAccess {
      r#struct: widx(type_),
      field: Index::Num(field, zspan()),
    }),
  )
}

/// `(struct.set $type field struct_ref value)`
fn struct_set(type_: &'static str, field: u32, struct_ref: Instrs, value: Instrs) -> Instrs {
  fold(
    vec![struct_ref, value],
    Instruction::StructSet(StructAccess {
      r#struct: widx(type_),
      field: Index::Num(field, zspan()),
    }),
  )
}

/// `(call $name argument...)`
fn call(name: &'static str, arguments: Vec<Instrs>) -> Instrs {
  fold(arguments, Instruction::Call(widx(name)))
}

/// `(ref.cast (ref $type) v)` for a concrete type.
fn ref_cast(type_: &'static str, v: Instrs) -> Instrs {
  fold(
    vec![v],
    Instruction::RefCast(RefCast {
      r#type: RefType { nullable: false, heap: HeapType::Concrete(widx(type_)) },
    }),
  )
}

/// `(ref.cast (ref i31) v)`
fn ref_cast_i31(v: Instrs) -> Instrs {
  fold(
    vec![v],
    Instruction::RefCast(RefCast {
      r#type: RefType {
        nullable: false,
        heap: HeapType::Abstract { shared: false, ty: AbstractHeapType::I31 },
      },
    }),
  )
}

/// `(ref.as_non_null v)`
fn ref_as_non_null(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::RefAsNonNull)
}

/// `(i31.get_s v)`
fn i31_get_s(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::I31GetS)
}

/// `(select v_if_nonzero v_if_zero condition)`
fn select(v_if_nonzero: Instrs, v_if_zero: Instrs, condition: Instrs) -> Instrs {
  fold(vec![v_if_nonzero, v_if_zero, condition], Instruction::Select(SelectTypes { tys: None }))
}

/// `(return v)`
fn ret(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::Return)
}

/// `(drop v)`
fn drop_(v: Instrs) -> Instrs {
  fold(vec![v], Instruction::Drop)
}

/// `(unreachable)`
fn unreachable() -> Instrs {
  vec![Instruction::Unreachable]
}

/// `(block $label body...)`
fn block(label: &'static str, body: Vec<Instrs>) -> Instrs {
  let mut out = vec![Instruction::Block(block_type(Some(label)))];
  out.extend(body.into_iter().flatten());
  out.push(Instruction::End(None));
  out
}

/// `(loop $label body...)`
fn loop_(label: &'static str, body: Vec<Instrs>) -> Instrs {
  let mut out = vec![Instruction::Loop(block_type(Some(label)))];
  out.extend(body.into_iter().flatten());
  out.push(Instruction::End(None));
  out
}

/// `(if condition (then then_branch...))`
fn if_then(condition: Instrs, then_branch: Vec<Instrs>) -> Instrs {
  let mut out = condition;
  out.push(Instruction::If(block_type(None)));
  out.extend(then_branch.into_iter().flatten());
  out.push(Instruction::End(None));
  out
}

/// `(br $label)`
fn br(label: &'static str) -> Instrs {
  vec![Instruction::Br(widx(label))]
}

/// `(br_if $label condition)`
fn br_if(label: &'static str, condition: Instrs) -> Instrs {
  fold(vec![condition], Instruction::BrIf(widx(label)))
}

// ----------------------------------------------------------------------------
// Module fields
// ----------------------------------------------------------------------------

/// `(import "builtins" "name" (func $name (param T)* (result T)))`
fn import_func(
  name: &'static str,
  params: Vec<ValType<'static>>,
  result: ValType<'static>,
) -> ModuleField<'static> {
  ModuleField::Import(Imports {
    span: zspan(),
    items: ImportItems::Single {
      module: "builtins",
      name,
      sig: ItemSig {
        span: zspan(),
        id: Some(wid(name)),
        name: None,
        kind: ItemKind::Func(TypeUse {
          index: None,
          inline: Some(FunctionType {
            params: params.into_iter().map(|t| (None, None, t)).collect(),
            results: Box::new([result]),
          }),
        }),
      },
    },
  })
}

/// `(func $name (export "...")? (param $p T)* (result T) (local $l T)* body...)`
fn func(
  name: &'static str,
  export: Option<&'static str>,
  params: Vec<(&'static str, ValType<'static>)>,
  result: ValType<'static>,
  locals: Vec<(&'static str, ValType<'static>)>,
  body: Vec<Instrs>,
) -> ModuleField<'static> {
  ModuleField::Func(Func {
    span: zspan(),
    id: Some(wid(name)),
    name: None,
    exports: InlineExport { names: export.into_iter().collect() },
    kind: FuncKind::Inline {
      locals: locals
        .into_iter()
        .map(|(local_name, t)| Local { id: Some(wid(local_name)), name: None, ty: t })
        .collect(),
      expression: expression(body.into_iter().flatten().collect()),
    },
    ty: TypeUse {
      index: None,
      inline: Some(FunctionType {
        params: params
          .into_iter()
          .map(|(param_name, t)| (Some(wid(param_name)), None, t))
          .collect(),
        results: Box::new([result]),
      }),
    },
  })
}

pub(crate) fn module_fields() -> Vec<ModuleField<'static>> {
  vec![
    import_func("__Process$println", vec![ref_eq(), ref_str()], i32t()),
    import_func("__Process$panic", vec![ref_eq(), ref_str()], i32t()),
    // Export helper functions for JavaScript to read GC string arrays
    func(
      "__$strLen",
      Some("__strLen"),
      vec![("str", ref_str())],
      i32t(),
      Vec::new(),
      vec![array_len(lget("str"))],
    ),
    func(
      "__$strGet",
      Some("__strGet"),
      vec![("str", ref_str()), ("idx", i32t())],
      i32t(),
      Vec::new(),
      vec![array_get_s("_Str", lget("str"), lget("idx"))],
    ),
    func(
      "__Str$eq",
      None,
      vec![("a", ref_str()), ("b", ref_str())],
      i32t(),
      vec![("len", i32t()), ("i", i32t())],
      vec![
        if_then(ref_eq_cmp(lget("a"), lget("b")), vec![ret(i32c(1))]),
        lset("len", array_len(lget("a"))),
        if_then(i32_ne(lget("len"), array_len(lget("b"))), vec![ret(i32c(0))]),
        lset("i", i32c(0)),
        block(
          "done",
          vec![loop_(
            "loop",
            vec![
              br_if("done", i32_ge_s(lget("i"), lget("len"))),
              if_then(
                i32_ne(
                  array_get_s("_Str", lget("a"), lget("i")),
                  array_get_s("_Str", lget("b"), lget("i")),
                ),
                vec![ret(i32c(0))],
              ),
              lset("i", i32_add(lget("i"), i32c(1))),
              br("loop"),
            ],
          )],
        ),
        i32c(1),
      ],
    ),
    // (global $g1 (mut (ref null $_Str)) (ref.null $_Str))
    ModuleField::Global(Global {
      span: zspan(),
      id: Some(wid("g1")),
      name: None,
      exports: InlineExport::default(),
      ty: GlobalType { ty: ref_null_str(), mutable: true, shared: false },
      kind: GlobalKind::Inline(expression(ref_null_str_instr())),
    }),
    // Passive data segment for string constants (used with array.new_data)
    // (data $d0 "0\00-2147483648")
    ModuleField::Data(Data {
      span: zspan(),
      id: Some(wid("d0")),
      name: None,
      kind: DataKind::Passive,
      data: vec![DataVal::String(b"0\x00-2147483648")],
    }),
    func(
      "__$getBuiltinString",
      None,
      vec![("offset", i32t()), ("size", i32t())],
      ref_str(),
      Vec::new(),
      vec![array_new_data("_Str", "d0", lget("offset"), lget("size"))],
    ),
    str_from_int(),
    str_to_int(),
    str_concat(),
    func(
      "__$unwrapI31",
      None,
      vec![("v", ref_eq())],
      i32t(),
      Vec::new(),
      vec![i31_get_s(ref_cast_i31(lget("v")))],
    ),
    func(
      "__Vec$empty",
      None,
      vec![("_this", ref_eq())],
      ref_vec(),
      Vec::new(),
      vec![struct_new("_Vec", vec![array_new("_VecData", ref_null_eq_instr(), i32c(0)), i32c(0)])],
    ),
    func(
      "__Vec$withCapacity",
      None,
      vec![("_this", ref_eq()), ("cap", i32t())],
      ref_vec(),
      Vec::new(),
      vec![struct_new(
        "_Vec",
        vec![array_new("_VecData", ref_null_eq_instr(), lget("cap")), i32c(0)],
      )],
    ),
    func(
      "__Vec$of",
      None,
      vec![("_this", ref_eq()), ("v", ref_null_eq())],
      ref_vec(),
      vec![("d", ref_vec_data())],
      vec![
        lset("d", array_new("_VecData", lget("v"), i32c(1))),
        struct_new("_Vec", vec![lget("d"), i32c(1)]),
      ],
    ),
    func(
      "__Vec$length",
      None,
      vec![("this", ref_vec())],
      i32t(),
      Vec::new(),
      vec![struct_get("_Vec", 1, lget("this"))],
    ),
    func(
      "__Vec$capacity",
      None,
      vec![("this", ref_vec())],
      i32t(),
      Vec::new(),
      vec![array_len(struct_get("_Vec", 0, lget("this")))],
    ),
    vec_reserve(),
    vec_push(),
    vec_pop(),
    vec_get(),
    vec_set(),
    vec_eq(),
  ]
}

fn str_from_int() -> ModuleField<'static> {
  func(
    "__Str$fromInt",
    None,
    vec![("this", ref_eq()), ("p0", i32t())],
    ref_str(),
    vec![
      ("conversion_result", ref_null_str()),
      ("is_negative", i32t()),
      ("temp", i32t()),
      ("arr_size", i32t()),
      ("len", i32t()),
      ("new_in", i32t()),
      ("arr_half_point", i32t()),
      ("rev_index", i32t()),
    ],
    vec![
      lset("conversion_result", ref_null_str_instr()),
      block(
        "B0",
        vec![
          block(
            "B1",
            vec![
              // i32.min can't be negated; its string is materialized from data instead,
              // by breaking to the $d0-based fallback right after this block.
              br_if("B1", i32_eq(lget("p0"), i32c(-2147483648))),
              block(
                "B2",
                vec![
                  br_if("B2", lget("p0")),
                  // 0 also short-circuits, straight to "0" from the data segment.
                  lset("conversion_result", array_new_data("_Str", "d0", i32c(0), i32c(1))),
                  br("B0"),
                ],
              ),
              lset("temp", lget("p0")),
              lset("is_negative", i32c(0)),
              lset("len", i32c(0)),
              lset("arr_size", i32c(0)),
              block(
                "is_negative_block",
                vec![
                  br_if("is_negative_block", i32_gt_s(lget("p0"), i32c(-1))),
                  // Mark as negative, negate the value
                  lset("p0", i32_sub(i32c(0), lget("p0"))),
                  lset("is_negative", i32c(1)),
                  lset("len", i32c(1)),
                  lset("arr_size", i32c(1)),
                ],
              ),
              // Also negate temp for size calculation if it was negative
              block(
                "negate_temp_block",
                vec![
                  br_if("negate_temp_block", i32_gt_s(lget("temp"), i32c(-1))),
                  lset("temp", i32_sub(i32c(0), lget("temp"))),
                ],
              ),
              // arr_size += number of digits (divide temp by 10 until it hits 0)
              block(
                "find_size_block",
                vec![loop_(
                  "find_size_loop",
                  vec![
                    br_if("find_size_block", i32_lt_s(lget("temp"), i32c(1))),
                    lset("temp", i32_div_u(lget("temp"), i32c(10))),
                    lset("arr_size", i32_add(lget("arr_size"), i32c(1))),
                    br("find_size_loop"),
                  ],
                )],
              ),
              lset("conversion_result", array_new("_Str", i32c(0), lget("arr_size"))),
              // Now set '-' sign if negative (after array allocation)
              block(
                "set_negative_sign_block",
                vec![
                  br_if("set_negative_sign_block", i32_eqz(lget("is_negative"))),
                  array_set("_Str", lget("conversion_result"), i32c(0), i32c(45)),
                ],
              ),
              // Emit digits least-significant first; they are reversed below.
              block(
                "set_characters_loop_block",
                vec![loop_(
                  "set_characters_loop",
                  vec![
                    br_if("set_characters_loop_block", i32_lt_s(lget("p0"), i32c(1))),
                    array_set(
                      "_Str",
                      lget("conversion_result"),
                      lget("len"),
                      // This is a clever trick. 48=0b110000.
                      // The rest of 0 can be filled with mod 10 result with bitwise OR.
                      // p0 - (new_in = p0 / 10) * 10 is equivalent to p0 % 10;
                      // local.tee conveniently also saves p0 / 10 into new_in.
                      i32_or(
                        i32_sub(
                          lget("p0"),
                          i32_mul(ltee("new_in", i32_div_u(lget("p0"), i32c(10))), i32c(10)),
                        ),
                        i32c(48),
                      ),
                    ),
                    lset("len", i32_add(lget("len"), i32c(1))),
                    lset("p0", lget("new_in")),
                    br("set_characters_loop"),
                  ],
                )],
              ),
              // Mid point for digit reversal: half of the digit count (excluding any
              // '-' sign), shifted past the '-' sign when there is one.
              lset(
                "arr_half_point",
                i32_add(
                  i32_div_u(i32_sub(lget("len"), lget("is_negative")), i32c(2)),
                  lget("is_negative"),
                ),
              ),
              // len is reused as the loop index; it starts at 0 or 1 depending on
              // is_negative, so the '-' sign is never swapped.
              lset("len", lget("is_negative")),
              block(
                "reverse_block",
                vec![loop_(
                  "reverse_block_loop",
                  vec![
                    // Reversal done: the result is complete, so break all the way out.
                    br_if("B0", i32_ge_s(lget("len"), lget("arr_half_point"))),
                    lset("temp", array_get_s("_Str", lget("conversion_result"), lget("len"))),
                    // rev_index = arr_size - len - 1 + is_negative, accounting for the
                    // minus sign offset when reversing just the digits.
                    lset(
                      "rev_index",
                      i32_add(
                        i32_sub(i32_sub(lget("arr_size"), lget("len")), i32c(1)),
                        lget("is_negative"),
                      ),
                    ),
                    array_set(
                      "_Str",
                      lget("conversion_result"),
                      lget("len"),
                      array_get_s("_Str", lget("conversion_result"), lget("rev_index")),
                    ),
                    array_set("_Str", lget("conversion_result"), lget("rev_index"), lget("temp")),
                    lset("len", i32_add(lget("len"), i32c(1))),
                    br("reverse_block_loop"),
                  ],
                )],
              ),
            ],
          ),
          // i32.min fallback: "-2147483648" straight from the data segment.
          lset("conversion_result", array_new_data("_Str", "d0", i32c(2), i32c(11))),
        ],
      ),
      ref_cast("_Str", lget("conversion_result")),
    ],
  )
}

fn str_to_int() -> ModuleField<'static> {
  func(
    "__Str$toInt",
    None,
    vec![("p0", ref_str())],
    i32t(),
    vec![
      ("len", i32t()),
      ("neg", i32t()),
      ("num", i32t()),
      ("character", i32t()),
      ("i", i32t()),
      ("l1", i32t()),
      ("l2", i32t()),
      ("l3", i32t()),
      ("l4", i32t()),
      ("l5", i32t()),
    ],
    vec![
      lset("len", array_len(lget("p0"))),
      // Any break to (the outer) $B0 returns 0: empty string or non-digit character.
      block(
        "B0",
        vec![
          // NOTE: this inner block shadows the outer $B0; wast resolves labels
          // innermost-first, matching the original text.
          block("B0", vec![br_if("B0", lget("len"))]),
          // neg = (first character is '-')
          lset("neg", i32_eq(i32c(45), array_get_s("_Str", lget("p0"), i32c(0)))),
          lset("num", i32c(0)),
          lset("i", lget("neg")),
          block(
            "B1",
            vec![loop_(
              "L2",
              vec![
                br_if("B1", i32_ge_s(lget("i"), lget("len"))),
                lset("character", array_get_s("_Str", lget("p0"), lget("i"))),
                // Bail out unless '0' <= character <= '9'.
                br_if(
                  "B0",
                  i32_gt_u(i32_and(i32_add(lget("character"), i32c(-48)), i32c(255)), i32c(9)),
                ),
                lset("i", i32_add(lget("i"), i32c(1))),
                lset(
                  "num",
                  i32_add(i32_add(i32_mul(lget("num"), i32c(10)), lget("character")), i32c(-48)),
                ),
                br("L2"),
              ],
            )],
          ),
          ret(select(i32_sub(i32c(0), lget("num")), lget("num"), lget("neg"))),
        ],
      ),
      i32c(0),
    ],
  )
}

fn str_concat() -> ModuleField<'static> {
  func(
    "__Str$concat",
    None,
    vec![("p0", ref_str()), ("p1", ref_str())],
    ref_str(),
    vec![
      ("len1", i32t()),
      ("len2", i32t()),
      ("total_len", i32t()),
      ("index", i32t()),
      ("new_array", ref_null_str()),
    ],
    vec![
      lset("len1", array_len(lget("p0"))),
      lset("len2", array_len(lget("p1"))),
      lset("total_len", i32_add(lget("len1"), lget("len2"))),
      lset("new_array", array_new("_Str", i32c(0), lget("total_len"))),
      lset("index", i32c(0)),
      block(
        "copy_first_arr_block",
        vec![loop_(
          "copy_first_arr_loop",
          vec![
            br_if("copy_first_arr_block", i32_ge_s(lget("index"), lget("len1"))),
            array_set(
              "_Str",
              ref_as_non_null(lget("new_array")),
              lget("index"),
              array_get_s("_Str", lget("p0"), lget("index")),
            ),
            lset("index", i32_add(lget("index"), i32c(1))),
            br("copy_first_arr_loop"),
          ],
        )],
      ),
      lset("index", i32c(0)),
      block(
        "copy_second_arr_block",
        vec![loop_(
          "copy_second_arr_loop",
          vec![
            br_if("copy_second_arr_block", i32_ge_s(lget("index"), lget("len2"))),
            array_set(
              "_Str",
              ref_as_non_null(lget("new_array")),
              i32_add(lget("len1"), lget("index")),
              array_get_s("_Str", lget("p1"), lget("index")),
            ),
            lset("index", i32_add(lget("index"), i32c(1))),
            br("copy_second_arr_loop"),
          ],
        )],
      ),
      ref_as_non_null(lget("new_array")),
    ],
  )
}

// -----------------------------------------------------------------------------
// Vec<T> runtime
//
// Vec is a builtin growable container with a uniform (ref null eq) element
// representation, regardless of the source-level element type. Element values
// that are i32 (e.g. `int`) are boxed/unboxed via i31 at the call site by the
// WASM lowering pass; reference values pass through untouched via subtyping.
//
// A Vec is a struct of {data: ref _VecData, length: i32}; capacity is the
// backing array's length. Static methods take a (ref eq) placeholder receiver,
// matching the pattern used by Str.fromInt and Process.println.
// -----------------------------------------------------------------------------

// reserve(min): grow data to at least min (geometric: max(min, 2*cap, 4))
fn vec_reserve() -> ModuleField<'static> {
  func(
    "__Vec$reserve",
    None,
    vec![("this", ref_vec()), ("min", i32t())],
    i32t(),
    vec![
      ("cap", i32t()),
      ("new_cap", i32t()),
      ("old", ref_vec_data()),
      ("new", ref_vec_data()),
      ("len", i32t()),
    ],
    vec![
      lset("old", struct_get("_Vec", 0, lget("this"))),
      lset("cap", array_len(lget("old"))),
      block(
        "no_grow",
        vec![
          br_if("no_grow", i32_le_s(lget("min"), lget("cap"))),
          lset("new_cap", i32_shl(lget("cap"), i32c(1))),
          if_then(i32_lt_s(lget("new_cap"), lget("min")), vec![lset("new_cap", lget("min"))]),
          if_then(i32_lt_s(lget("new_cap"), i32c(4)), vec![lset("new_cap", i32c(4))]),
          lset("new", array_new("_VecData", ref_null_eq_instr(), lget("new_cap"))),
          lset("len", struct_get("_Vec", 1, lget("this"))),
          array_copy("_VecData", lget("new"), i32c(0), lget("old"), i32c(0), lget("len")),
          struct_set("_Vec", 0, lget("this"), lget("new")),
        ],
      ),
      i32c(0),
    ],
  )
}

fn vec_push() -> ModuleField<'static> {
  func(
    "__Vec$push",
    None,
    vec![("this", ref_vec()), ("v", ref_null_eq())],
    i32t(),
    vec![("len", i32t())],
    vec![
      lset("len", struct_get("_Vec", 1, lget("this"))),
      drop_(call("__Vec$reserve", vec![lget("this"), i32_add(lget("len"), i32c(1))])),
      array_set("_VecData", struct_get("_Vec", 0, lget("this")), lget("len"), lget("v")),
      struct_set("_Vec", 1, lget("this"), i32_add(lget("len"), i32c(1))),
      i32c(0),
    ],
  )
}

fn vec_pop() -> ModuleField<'static> {
  func(
    "__Vec$pop",
    None,
    vec![("this", ref_vec())],
    ref_eq(),
    vec![("len", i32t()), ("v", ref_null_eq())],
    vec![
      lset("len", struct_get("_Vec", 1, lget("this"))),
      if_then(i32_eqz(lget("len")), vec![unreachable()]),
      lset("len", i32_sub(lget("len"), i32c(1))),
      lset("v", array_get("_VecData", struct_get("_Vec", 0, lget("this")), lget("len"))),
      // Clear the slot so the popped value can be GC'd.
      array_set("_VecData", struct_get("_Vec", 0, lget("this")), lget("len"), ref_null_eq_instr()),
      struct_set("_Vec", 1, lget("this"), lget("len")),
      ref_as_non_null(lget("v")),
    ],
  )
}

fn vec_get() -> ModuleField<'static> {
  func(
    "__Vec$get",
    None,
    vec![("this", ref_vec()), ("i", i32t())],
    ref_eq(),
    Vec::new(),
    vec![
      if_then(i32_ge_u(lget("i"), struct_get("_Vec", 1, lget("this"))), vec![unreachable()]),
      ref_as_non_null(array_get("_VecData", struct_get("_Vec", 0, lget("this")), lget("i"))),
    ],
  )
}

fn vec_set() -> ModuleField<'static> {
  func(
    "__Vec$set",
    None,
    vec![("this", ref_vec()), ("i", i32t()), ("v", ref_null_eq())],
    i32t(),
    Vec::new(),
    vec![
      if_then(i32_ge_u(lget("i"), struct_get("_Vec", 1, lget("this"))), vec![unreachable()]),
      array_set("_VecData", struct_get("_Vec", 0, lget("this")), lget("i"), lget("v")),
      i32c(0),
    ],
  )
}

fn vec_eq() -> ModuleField<'static> {
  func(
    "__Vec$eq",
    None,
    vec![("a", ref_vec()), ("b", ref_vec())],
    i32t(),
    vec![("len", i32t()), ("i", i32t()), ("ad", ref_vec_data()), ("bd", ref_vec_data())],
    vec![
      if_then(ref_eq_cmp(lget("a"), lget("b")), vec![ret(i32c(1))]),
      lset("len", struct_get("_Vec", 1, lget("a"))),
      if_then(i32_ne(lget("len"), struct_get("_Vec", 1, lget("b"))), vec![ret(i32c(0))]),
      lset("ad", struct_get("_Vec", 0, lget("a"))),
      lset("bd", struct_get("_Vec", 0, lget("b"))),
      lset("i", i32c(0)),
      block(
        "done",
        vec![loop_(
          "loop",
          vec![
            br_if("done", i32_ge_s(lget("i"), lget("len"))),
            if_then(
              i32_eqz(ref_eq_cmp(
                array_get("_VecData", lget("ad"), lget("i")),
                array_get("_VecData", lget("bd"), lget("i")),
              )),
              vec![ret(i32c(0))],
            ),
            lset("i", i32_add(lget("i"), i32c(1))),
            br("loop"),
          ],
        )],
      ),
      i32c(1),
    ],
  )
}
