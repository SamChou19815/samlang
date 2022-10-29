import { ENCODED_FUNCTION_NAME_PRINTLN, ENCODED_FUNCTION_NAME_THROW } from "../common-names";
import {
  prettyPrintWebAssemblyModule,
  WasmBinary,
  WasmConst,
  WasmDirectCall,
  WasmDrop,
  WasmIfElse,
  WasmIndirectCall,
  WasmJump,
  WasmLoad,
  WasmLocalGet,
  WasmLocalSet,
  WasmLoop,
  WasmStore,
} from "../wasm-nodes";

describe("wasm-nodes", () => {
  it("prettyPrintWebAssemblyModule test", () => {
    expect(
      prettyPrintWebAssemblyModule({
        functionTypeParameterCounts: [0, 1, 2, 3],
        globalVariables: [
          { constantPointer: 1024, ints: [0, 0] },
          { constantPointer: 323, ints: [3, 2] },
        ],
        exportedFunctions: ["main"],
        functions: [
          {
            name: "main",
            parameters: ["a", "b"],
            localVariables: ["c", "d"],
            instructions: [
              WasmIfElse(
                WasmConst(1),
                [
                  WasmConst(1),
                  WasmDrop(WasmConst(0)),
                  WasmLocalGet("a"),
                  WasmLocalSet("b", WasmConst(0)),
                ],
                [
                  WasmBinary(WasmConst(0), "+", WasmConst(0)),
                  WasmBinary(WasmConst(0), "-", WasmConst(0)),
                  WasmBinary(WasmConst(0), "*", WasmConst(0)),
                  WasmBinary(WasmConst(0), "/", WasmConst(0)),
                  WasmBinary(WasmConst(0), "%", WasmConst(0)),
                  WasmBinary(WasmConst(0), "^", WasmConst(0)),
                  WasmBinary(WasmConst(0), "<", WasmConst(0)),
                  WasmBinary(WasmConst(0), "<=", WasmConst(0)),
                  WasmBinary(WasmConst(0), ">", WasmConst(0)),
                  WasmBinary(WasmConst(0), ">=", WasmConst(0)),
                  WasmBinary(WasmConst(0), "==", WasmConst(0)),
                  WasmBinary(WasmConst(0), "!=", WasmConst(0)),
                ],
              ),
              WasmJump("aa"),
              WasmLoop({
                continueLabel: "cl",
                exitLabel: "el",
                instructions: [
                  WasmLoad(WasmConst(0), 0),
                  WasmLoad(WasmConst(0), 3),
                  WasmStore(WasmConst(0), 0, WasmConst(0)),
                  WasmStore(WasmConst(0), 3, WasmConst(0)),
                  WasmDirectCall("main", [WasmConst(0)]),
                  WasmIndirectCall(WasmConst(0), "dff", [WasmConst(0)]),
                ],
              }),
            ],
          },
        ],
      }),
    ).toBe(
      `(type $none_=>_i32 (func (result i32)))
(type $i32_=>_i32 (func (param i32) (result i32)))
(type $i32_i32_=>_i32 (func (param i32 i32) (result i32)))
(type $i32_i32_i32_=>_i32 (func (param i32 i32 i32) (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_PRINTLN}" (func $${ENCODED_FUNCTION_NAME_PRINTLN} (param i32) (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_THROW}" (func $${ENCODED_FUNCTION_NAME_THROW} (param i32) (result i32)))
(data (i32.const 1024) "\\00\\00\\00\\00\\00\\00\\00\\00")
(data (i32.const 323) "\\03\\00\\00\\00\\02\\00\\00\\00")
(table $0 1 funcref)
(elem $0 (i32.const 0) $main)
(func $main (param $a i32) (param $b i32) (result i32)
  (local $c i32)
  (local $d i32)
  (if (i32.const 1) (then
    (i32.const 1)
    (drop (i32.const 0))
    (local.get $a)
    (local.set $b (i32.const 0))
  ) (else
    (i32.add (i32.const 0) (i32.const 0))
    (i32.sub (i32.const 0) (i32.const 0))
    (i32.mul (i32.const 0) (i32.const 0))
    (i32.div_s (i32.const 0) (i32.const 0))
    (i32.rem_s (i32.const 0) (i32.const 0))
    (i32.xor (i32.const 0) (i32.const 0))
    (i32.lt_s (i32.const 0) (i32.const 0))
    (i32.le_s (i32.const 0) (i32.const 0))
    (i32.gt_s (i32.const 0) (i32.const 0))
    (i32.ge_s (i32.const 0) (i32.const 0))
    (i32.eq (i32.const 0) (i32.const 0))
    (i32.ne (i32.const 0) (i32.const 0))
  ))
  (br $aa)
  (loop $cl
    (block $el
      (i32.load (i32.const 0))
      (i32.load offset=12 (i32.const 0))
      (i32.store (i32.const 0) (i32.const 0))
      (i32.store offset=12 (i32.const 0) (i32.const 0))
      (call $main (i32.const 0))
      (call_indirect $0 (type $dff) (i32.const 0) (i32.const 0))
    )
  )
)
(export "main" (func $main))
`,
    );
  });
});
