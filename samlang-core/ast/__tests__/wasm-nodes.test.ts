import {
  WasmConst,
  WasmDrop,
  WasmLocalGet,
  WasmLocalSet,
  WasmBinary,
  WasmLoad,
  WasmStore,
  WasmDirectCall,
  WasmIndirectCall,
  WasmIfElse,
  WasmJump,
  WasmLoop,
  prettyPrintWebAssemblyModule,
} from '../wasm-nodes';

describe('wasm-nodes', () => {
  it('prettyPrintWebAssemblyModule test 1', () => {
    expect(
      prettyPrintWebAssemblyModule({
        functionTypeParameterCounts: [0, 1, 2, 3],
        globalVariables: ['', 'hi'],
        exportedFunctions: ['main'],
        functions: [
          {
            name: 'main',
            parameters: ['a', 'b'],
            localVariables: ['c', 'd'],
            instructions: [
              WasmIfElse(
                [WasmConst(1), WasmDrop, WasmLocalGet('a'), WasmLocalSet('b')],
                [
                  WasmBinary('+'),
                  WasmBinary('-'),
                  WasmBinary('*'),
                  WasmBinary('/'),
                  WasmBinary('%'),
                  WasmBinary('^'),
                  WasmBinary('<'),
                  WasmBinary('<='),
                  WasmBinary('>'),
                  WasmBinary('>='),
                  WasmBinary('=='),
                  WasmBinary('!='),
                ]
              ),
              WasmJump('aa'),
              WasmLoop({
                continueLabel: 'cl',
                exitLabel: 'el',
                instructions: [
                  WasmLoad(3),
                  WasmStore(3),
                  WasmDirectCall('main'),
                  WasmIndirectCall('dff'),
                ],
              }),
            ],
          },
        ],
      })
    ).toBe(`(module
(type $none_=>_i32 (func (result i32)))
(type $i32_=>_i32 (func (param i32) (result i32)))
(type $i32_i32_=>_i32 (func (param i32 i32) (result i32)))
(type $i32_i32_i32_=>_i32 (func (param i32 i32 i32) (result i32)))
(memory $0 1)
(data (i32.const 1024) "\\\\00\\\\00\\\\00\\\\00\\\\02\\\\00\\\\00\\\\00")
(data (i32.const 1026) "\\\\00\\\\00\\\\00\\\\00\\\\04\\\\00\\\\00\\\\00\\\\68\\\\00\\\\00\\\\00\\\\69\\\\00\\\\00\\\\00")
(table $0 1 funcref)
(elem $0 (i32.const 0) $main)
(export "main" (func main))
(func $main (param $a i32) (param $b i32) (result i32)
  (local $c i32)
  (local $d i32)
  if
    i32.const 1
    drop
    local.get $a
    local.set $b
  else
    i32.add
    i32.sub
    i32.mul
    i32.div_s
    i32.rem_s
    i32.xor
    i32.lt_s
    i32.le_s
    i32.gt_s
    i32.ge_s
    i32.eq
    i32.ne
  end
  br $aa
  loop $cl
    block $el
      local.load offset=12
      local.store offset=12
      call $main
      call_indirect $0 (type $dff)
    end
  end
)
)
`);
  });
});
