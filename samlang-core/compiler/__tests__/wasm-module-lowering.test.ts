import { ENCODED_FUNCTION_NAME_PRINTLN, ENCODED_FUNCTION_NAME_THROW } from '../../ast/common-names';
import {
  MIR_BINARY,
  MIR_BREAK,
  MIR_CAST,
  MIR_FALSE,
  MIR_FUNCTION_CALL,
  MIR_FUNCTION_TYPE,
  MIR_IF_ELSE,
  MIR_INDEX_ACCESS,
  MIR_INDEX_ASSIGN,
  MIR_INT_TYPE as INT,
  MIR_NAME,
  MIR_SINGLE_IF,
  MIR_STRUCT_INITIALIZATION,
  MIR_VARIABLE,
  MIR_WHILE,
  MIR_ZERO,
  MIR_ZERO as ZERO,
} from '../../ast/mir-nodes';
import { prettyPrintWebAssemblyModule } from '../../ast/wasm-nodes';
import lowerMidIRSourcesToWasmModule from '../wasm-module-lowering';

describe('wasm-module-lowering', () => {
  it('lowerMidIRSourcesToWasmModule test 1', () => {
    expect(
      prettyPrintWebAssemblyModule(
        lowerMidIRSourcesToWasmModule({
          globalVariables: [
            { name: 'FOO', content: 'foo' },
            { name: 'BAR', content: 'bar' },
          ],
          typeDefinitions: [],
          mainFunctionNames: ['main'],
          functions: [
            {
              name: 'main',
              parameters: ['bar'],
              type: MIR_FUNCTION_TYPE([], INT),
              body: [
                MIR_IF_ELSE({ booleanExpression: MIR_FALSE, s1: [], s2: [], finalAssignments: [] }),
                MIR_IF_ELSE({
                  booleanExpression: MIR_FALSE,
                  s1: [],
                  s2: [MIR_CAST({ name: 'c', type: INT, assignedExpression: ZERO })],
                  finalAssignments: [],
                }),
                MIR_IF_ELSE({
                  booleanExpression: MIR_FALSE,
                  s1: [
                    MIR_WHILE({
                      loopVariables: [
                        { name: 'i', type: INT, initialValue: ZERO, loopValue: ZERO },
                      ],
                      statements: [MIR_CAST({ name: 'c', type: INT, assignedExpression: ZERO })],
                    }),
                  ],
                  s2: [
                    MIR_WHILE({
                      loopVariables: [],
                      breakCollector: { name: 'b', type: INT },
                      statements: [
                        MIR_SINGLE_IF({
                          booleanExpression: MIR_FALSE,
                          invertCondition: false,
                          statements: [MIR_BREAK(MIR_ZERO)],
                        }),
                      ],
                    }),
                    MIR_WHILE({
                      loopVariables: [],
                      statements: [
                        MIR_SINGLE_IF({
                          booleanExpression: MIR_FALSE,
                          invertCondition: true,
                          statements: [MIR_BREAK(MIR_ZERO)],
                        }),
                      ],
                    }),
                  ],
                  finalAssignments: [
                    {
                      name: 'f',
                      type: INT,
                      branch1Value: MIR_NAME('FOO', INT),
                      branch2Value: MIR_NAME('main', MIR_FUNCTION_TYPE([], INT)),
                    },
                  ],
                }),
                MIR_BINARY({ name: 'bin', operator: '+', e1: MIR_VARIABLE('f', INT), e2: ZERO }),
                MIR_FUNCTION_CALL({
                  functionExpression: MIR_NAME('main', MIR_FUNCTION_TYPE([], INT)),
                  functionArguments: [ZERO],
                  returnType: INT,
                }),
                MIR_FUNCTION_CALL({
                  functionExpression: MIR_VARIABLE('f', INT),
                  functionArguments: [ZERO],
                  returnType: INT,
                  returnCollector: 'rc',
                }),
                MIR_INDEX_ACCESS({ name: 'v', type: INT, pointerExpression: ZERO, index: 3 }),
                MIR_INDEX_ASSIGN({
                  assignedExpression: MIR_VARIABLE('v', INT),
                  pointerExpression: ZERO,
                  index: 3,
                }),
                MIR_STRUCT_INITIALIZATION({
                  structVariableName: 's',
                  type: INT,
                  expressionList: [ZERO, MIR_VARIABLE('v', INT)],
                }),
              ],
              returnValue: ZERO,
            },
          ],
        })
      )
    ).toBe(`(type $i32_=>_i32 (func (param i32) (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_PRINTLN}" (func $${ENCODED_FUNCTION_NAME_PRINTLN} (param i32) (result i32)))
(import "builtins" "${ENCODED_FUNCTION_NAME_THROW}" (func $${ENCODED_FUNCTION_NAME_THROW} (param i32) (result i32)))
(data (i32.const 4096) "\\00\\00\\00\\00\\03\\00\\00\\00\\66\\00\\00\\00\\6f\\00\\00\\00\\6f\\00\\00\\00")
(data (i32.const 4116) "\\00\\00\\00\\00\\03\\00\\00\\00\\62\\00\\00\\00\\61\\00\\00\\00\\72\\00\\00\\00")
(table $0 1 funcref)
(elem $0 (i32.const 0) $main)
(func $main (param $bar i32) (result i32)
  (local $c i32)
  (local $i i32)
  (local $f i32)
  (local $b i32)
  (local $bin i32)
  (local $rc i32)
  (local $v i32)
  (local $s i32)
  (if (i32.xor (i32.const 0) (i32.const 1)) (then
    (local.set $c (i32.const 0))
  ))
  (if (i32.const 0) (then
    (local.set $i (i32.const 0))
    (loop $l0_loop_continue
      (block $l1_loop_exit
        (local.set $c (i32.const 0))
        (local.set $i (i32.const 0))
        (br $l0_loop_continue)
      )
    )
    (local.set $f (i32.const 4096))
  ) (else
    (loop $l2_loop_continue
      (block $l3_loop_exit
        (if (i32.const 0) (then
          (local.set $b (i32.const 0))
          (br $l3_loop_exit)
        ))
        (br $l2_loop_continue)
      )
    )
    (loop $l4_loop_continue
      (block $l5_loop_exit
        (if (i32.xor (i32.const 0) (i32.const 1)) (then
          (br $l5_loop_exit)
        ))
        (br $l4_loop_continue)
      )
    )
    (local.set $f (i32.const 0))
  ))
  (local.set $bin (i32.add (local.get $f) (i32.const 0)))
  (drop (call $main (i32.const 0)))
  (local.set $rc (call_indirect $0 (type $i32_=>_i32) (i32.const 0) (local.get $f)))
  (local.set $v (i32.load offset=12 (i32.const 0)))
  (i32.store offset=12 (i32.const 0) (local.get $v))
  (local.set $s (call $_builtin_malloc (i32.const 8)))
  (i32.store (local.get $s) (i32.const 0))
  (i32.store offset=4 (local.get $s) (local.get $v))
  (i32.const 0)
)
(export "main" (func $main))
`);
  });
});
