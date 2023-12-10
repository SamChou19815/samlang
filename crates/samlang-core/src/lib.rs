#![allow(clippy::expect_fun_call)]
#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]

use samlang_heap::{Heap, ModuleReference, PStr};
pub use samlang_parser::builtin_std_raw_sources;
use std::collections::{BTreeMap, HashMap};

pub fn reformat_source(source: &str) -> String {
  let mut heap = Heap::new();
  let mut error_set = samlang_errors::ErrorSet::new();
  let module = samlang_parser::parse_source_module_from_text(
    source,
    ModuleReference::DUMMY,
    &mut heap,
    &mut error_set,
  );
  if error_set.has_errors() {
    source.to_string()
  } else {
    samlang_printer::pretty_print_source_module(&heap, 100, &module)
  }
}

pub struct SourcesCompilationResult {
  pub text_code_results: BTreeMap<String, String>,
  pub wasm_file: Vec<u8>,
}

const EMITTED_WASM_FILE: &str = "__all__.wasm";
const EMITTED_WAT_FILE: &str = "__all__.wat";

pub fn compile_sources(
  heap: &mut Heap,
  source_handles: HashMap<ModuleReference, String>,
  entry_module_references: Vec<ModuleReference>,
  enable_profiling: bool,
) -> Result<SourcesCompilationResult, String> {
  let mut error_set = samlang_errors::ErrorSet::new();
  let mut parsed_sources = HashMap::new();
  samlang_profiling::measure_time(enable_profiling, "Parsing", || {
    for (module_reference, source) in &source_handles {
      let parsed = samlang_parser::parse_source_module_from_text(
        source,
        *module_reference,
        heap,
        &mut error_set,
      );
      parsed_sources.insert(*module_reference, parsed);
    }
  });
  for module_reference in &entry_module_references {
    if !parsed_sources.contains_key(module_reference) {
      return Err(format!(
        "Invalid entry point: {} does not exist.",
        module_reference.pretty_print(heap)
      ));
    }
  }
  let checked_sources = samlang_profiling::measure_time(enable_profiling, "Type checking", || {
    samlang_checker::type_check_sources(&parsed_sources, &mut error_set).0
  });
  let errors = error_set.pretty_print_error_messages(heap, &source_handles);
  if error_set.has_errors() {
    return Err(errors);
  }

  let unoptimized_mir_sources =
    samlang_profiling::measure_time(enable_profiling, "Compile to MIR", || {
      samlang_compiler::compile_sources_to_mir(heap, &checked_sources)
    });
  let optimized_mir_sources =
    samlang_profiling::measure_time(enable_profiling, "Optimize MIR", || {
      samlang_optimization::optimize_sources(
        heap,
        unoptimized_mir_sources,
        &samlang_optimization::ALL_ENABLED_CONFIGURATION,
      )
    });
  let mut lir_sources = samlang_profiling::measure_time(enable_profiling, "Compile to LIR", || {
    samlang_compiler::compile_mir_to_lir(heap, optimized_mir_sources)
  });
  let common_ts_code = lir_sources.pretty_print(heap);
  let (wat_text, wasm_file) =
    samlang_profiling::measure_time(enable_profiling, "Compile to WASM", || {
      samlang_compiler::compile_lir_to_wasm(heap, &lir_sources)
    });

  let mut text_code_results = BTreeMap::new();
  for module_reference in &entry_module_references {
    let mut main_fn_name = String::new();
    samlang_ast::mir::FunctionName {
      type_name: lir_sources.symbol_table.create_main_type_name(*module_reference),
      fn_name: PStr::MAIN_FN,
    }
    .write_encoded(&mut main_fn_name, heap, &lir_sources.symbol_table);
    let ts_code = format!("{common_ts_code}\n{main_fn_name}();\n");
    let wasm_js_code = format!(
      r#"// @{}
const binary = require('fs').readFileSync(require('path').join(__dirname, '{}'));
require('./__samlang_loader__.js')(binary).{}();
"#,
      "generated", EMITTED_WASM_FILE, main_fn_name
    );
    text_code_results.insert(format!("{}.ts", module_reference.pretty_print(heap)), ts_code);
    text_code_results
      .insert("__samlang_loader__.js".to_string(), include_str!("loader.js").to_string());
    text_code_results
      .insert(format!("{}.wasm.js", module_reference.pretty_print(heap)), wasm_js_code);
  }
  text_code_results.insert(EMITTED_WAT_FILE.to_string(), wat_text);

  Ok(SourcesCompilationResult { text_code_results, wasm_file })
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_heap::Heap;
  use std::collections::HashMap;

  #[test]
  fn reformat_tests() {
    super::reformat_source("d");
    super::reformat_source("class Foo {}");
  }

  #[test]
  fn compile_tests() {
    let heap = &mut Heap::new();
    let mod_ref_a = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let mod_ref_demo = heap.alloc_module_reference_from_string_vec(vec!["Demo".to_string()]);

    assert_eq!(
      "Invalid entry point: A does not exist.",
      super::compile_sources(heap, HashMap::new(), vec![mod_ref_a], false,).err().unwrap()
    );

    assert_eq!(
      r#"
Error ----------------------------------- Demo.sam:1:37-1:44

`int` [1] is incompatible with `Str` [2].

  1| class Main { function main(): Str = 42 + "" }
                                         ^^^^^^^

  [1] Demo.sam:1:37-1:44
  ----------------------
  1| class Main { function main(): Str = 42 + "" }
                                         ^^^^^^^

  [2] Demo.sam:1:31-1:34
  ----------------------
  1| class Main { function main(): Str = 42 + "" }
                                   ^^^


Error ----------------------------------- Demo.sam:1:42-1:44

`Str` [1] is incompatible with `int` [2].

  1| class Main { function main(): Str = 42 + "" }
                                              ^^

  [1] Demo.sam:1:42-1:44
  ----------------------
  1| class Main { function main(): Str = 42 + "" }
                                              ^^

  [2] Demo.sam:1:37-1:44
  ----------------------
  1| class Main { function main(): Str = 42 + "" }
                                         ^^^^^^^


Found 2 errors.
"#
      .trim(),
      super::compile_sources(
        heap,
        HashMap::from([(
          mod_ref_demo,
          "class Main { function main(): Str = 42 + \"\" }".to_string()
        )]),
        vec![mod_ref_demo],
        false,
      )
      .err()
      .unwrap()
    );

    assert!(super::compile_sources(
      heap,
      HashMap::from([(
        mod_ref_demo,
        r#"
class Foo(val a: int) {}

class Option<T>(None, Some(T)) {}

class List(Nil(unit), Cons(int, List)) {
  function of(i: int): List = List.Cons(
    i,
    List.Nil({  })
  )
}

class FooOrFoo(F1(Foo), F2(Foo)) {
  function f1(): FooOrFoo = FooOrFoo.F1(Foo.init(1))
  function f2(): FooOrFoo = FooOrFoo.F2(Foo.init(2))

  function intValue(): int = FooOrFoo.f1().getInt() + FooOrFoo.f2().getInt()

  method getInt(): int =
    match (this) {
      F1(foo) -> foo.a,
      F2(foo) -> foo.a,
    }
}

class GenericObject<T1, T2>(val v1: T1, val v2: T2) {
  function print(): unit = {
    let f = (v2: int) -> (
      if (v2 + 1 == 3) then
        GenericObject.init(3, v2)
      else
        GenericObject.init(3, 42)
    );
    let _ = Process.println(Str.fromInt(f(2).v2)); // print 2
    let _ = Process.println(Str.fromInt(f(3).v2)); // print 42
  }
}

class Main {
  function nestedVal(): int = {
    let _ = List.of(1);
    let veryOpt = Option.Some(Option.Some(Option.Some(Foo.init(1))));
    let opt = match veryOpt {
      None -> 0,
      Some(v1) -> match v1 {
        None -> 1,
        Some(v2) -> match v2 {
          None -> 2,
          Some(v3) -> 3, // <- get this
        }
      },
    };
    let _ = Option.Some(FooOrFoo.f1());
    opt // 3
  }

  function main(): unit = {
    let _ = Process.println(Str.fromInt(
      39 + Main.nestedVal() + FooOrFoo.intValue() - FooOrFoo.intValue()
    ));
    let _ = GenericObject.print();
  }
}
"#
        .to_string()
      )]),
      vec![mod_ref_demo],
      false,
    )
    .is_ok());
  }
}
