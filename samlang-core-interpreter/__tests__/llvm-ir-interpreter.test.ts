import interpretLLVMModule from '../llvm-ir-interpreter';

import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import {
  LLVM_INT_TYPE,
  LLVM_BOOL_TYPE,
  LLVM_STRING_TYPE,
  LLVM_STRUCT_TYPE,
  LLVM_FUNCTION_TYPE,
  LLVM_INT,
  LLVM_NAME,
  LLVM_VARIABLE,
  LLVM_CAST,
  LLVM_GET_ELEMENT_PTR,
  LLVM_BINARY,
  LLVM_LOAD,
  LLVM_STORE,
  LLVM_PHI,
  LLVM_CALL,
  LLVM_LABEL,
  LLVM_JUMP,
  LLVM_CJUMP,
  LLVM_SWITCH,
  LLVM_RETURN,
} from 'samlang-core-ast/llvm-nodes';

const ZERO = LLVM_INT(0);
const ONE = LLVM_INT(1);
const EIGHT = LLVM_INT(8);

it('interpretLLVMModule hello world test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [{ name: 'HW', content: 'Hello World!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CAST({
              resultVariable: 'hw',
              resultType: LLVM_STRING_TYPE(),
              sourceValue: LLVM_NAME('HW'),
              sourceType: LLVM_STRING_TYPE(13),
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('hw'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('Hello World!\n');
});

it('interpretLLVMModule string-int conversion test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: EIGHT, type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'a',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'b',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('b'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'c',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('c'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('8\n');
});

it('interpretLLVMModule failed string-int conversion test', () => {
  expect(() =>
    interpretLLVMModule({
      globalVariables: [{ name: 'HW', content: 'Hello World!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT),
              functionArguments: [{ value: LLVM_NAME('HW'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
          ],
        },
      ],
    })
  ).toThrow('Bad string: Hello World!');
});

it('interpretLLVMModule string concat test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [
        { name: 'HW1', content: 'Hello World!' },
        { name: 'HW2', content: ' Hi World!' },
      ],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT),
              functionArguments: [
                { value: LLVM_NAME('HW1'), type: LLVM_STRING_TYPE() },
                { value: LLVM_NAME('HW2'), type: LLVM_STRING_TYPE() },
              ],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'a',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('Hello World! Hi World!\n');
});

it('interpretLLVMModule panic test', () => {
  expect(() =>
    interpretLLVMModule({
      globalVariables: [{ name: 'Ahh', content: 'Panic!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_THROW),
              functionArguments: [{ value: LLVM_NAME('Ahh'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'a',
            }),
          ],
        },
      ],
    })
  ).toThrow('Panic!');
});

it('interpretLLVMModule setup tuple and print test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_MALLOC),
              functionArguments: [{ value: LLVM_INT(16), type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'tuple',
            }),
            LLVM_STORE({ targetVariable: 'tuple', sourceValue: EIGHT, valueType: LLVM_INT_TYPE }),
            LLVM_GET_ELEMENT_PTR({
              resultVariable: 'second_pointer',
              sourceValue: LLVM_VARIABLE('tuple'),
              sourcePointerType: LLVM_STRUCT_TYPE([LLVM_INT_TYPE, LLVM_INT_TYPE]),
              offset: 1,
            }),
            LLVM_STORE({
              targetVariable: 'second_pointer',
              sourceValue: LLVM_INT(42),
              valueType: LLVM_INT_TYPE,
            }),
            LLVM_LOAD({ resultVariable: 'v1', sourceVariable: 'tuple', valueType: LLVM_INT_TYPE }),
            LLVM_LOAD({
              resultVariable: 'v2',
              sourceVariable: 'second_pointer',
              valueType: LLVM_INT_TYPE,
            }),
            LLVM_BINARY({
              resultVariable: 'sum',
              operator: '+',
              v1: LLVM_VARIABLE('v1'),
              v2: LLVM_VARIABLE('v2'),
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('sum'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'sum_string',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('sum_string'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ONE, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('50\n');
});

it('interpretLLVMModule jump test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [{ name: 'Ahh', content: 'Panic!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_JUMP('foo'),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_THROW),
              functionArguments: [{ value: LLVM_NAME('Ahh'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_LABEL('foo'),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretLLVMModule cjump test 1', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [{ name: 'Ahh', content: 'Panic!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CJUMP(EIGHT, 'foo', 'call'),
            LLVM_LABEL('call'),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_THROW),
              functionArguments: [{ value: LLVM_NAME('Ahh'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_LABEL('foo'),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretLLVMModule cjump test 2', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [{ name: 'Ahh', content: 'Panic!' }],
      typeDefinitions: [],
      functions: [
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CJUMP(ZERO, 'foo', 'ret'),
            LLVM_LABEL('ret'),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
            LLVM_LABEL('foo'),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_THROW),
              functionArguments: [{ value: LLVM_NAME('Ahh'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretLLVMModule dummy function call integration test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'dummy',
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [LLVM_RETURN(ZERO, LLVM_INT_TYPE)],
        },
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME('dummy'),
              functionArguments: [],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretLLVMModule factorial function call integration test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'factorial',
          parameters: [
            { parameterName: 'n', parameterType: LLVM_INT_TYPE },
            { parameterName: 'acc', parameterType: LLVM_INT_TYPE },
          ],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_LABEL('start'),
            LLVM_BINARY({
              resultVariable: 'com',
              operator: '==',
              v1: LLVM_VARIABLE('n'),
              v2: ZERO,
            }),
            LLVM_CJUMP(LLVM_VARIABLE('com'), 'ret', 'rec_call'),
            LLVM_LABEL('rec_call'),
            LLVM_BINARY({
              resultVariable: 'new_n',
              operator: '-',
              v1: LLVM_VARIABLE('n'),
              v2: ONE,
            }),
            LLVM_BINARY({
              resultVariable: 'new_acc',
              operator: '*',
              v1: LLVM_VARIABLE('acc'),
              v2: LLVM_VARIABLE('n'),
            }),
            LLVM_CALL({
              functionName: LLVM_NAME('factorial'),
              functionArguments: [
                { value: LLVM_VARIABLE('new_n'), type: LLVM_INT_TYPE },
                { value: LLVM_VARIABLE('new_acc'), type: LLVM_INT_TYPE },
              ],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'rec_call_val',
            }),
            LLVM_LABEL('ret'),
            LLVM_PHI({
              resultVariable: 'ret_v',
              variableType: LLVM_INT_TYPE,
              valueBranchTuples: [
                { value: LLVM_VARIABLE('acc'), branch: 'start' },
                { value: LLVM_VARIABLE('rec_call_val'), branch: 'rec_call' },
              ],
            }),
            LLVM_RETURN(LLVM_VARIABLE('ret_v'), LLVM_INT_TYPE),
          ],
        },
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CALL({
              functionName: LLVM_NAME('factorial'),
              functionArguments: [
                { value: LLVM_INT(4), type: LLVM_INT_TYPE },
                { value: ONE, type: LLVM_INT_TYPE },
              ],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'a',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'b',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('b'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('24\n');
});

it('interpretLLVMModule switch integration test 1/2', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'id',
          parameters: [{ parameterName: 'n', parameterType: LLVM_INT_TYPE }],
          returnType: LLVM_INT_TYPE,
          body: [LLVM_RETURN(LLVM_VARIABLE('n'), LLVM_INT_TYPE)],
        },
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_SWITCH(ONE, 'end', [
              { value: 0, branch: 'b0' },
              { value: 1, branch: 'b1' },
            ]),
            LLVM_LABEL('b0'),
            LLVM_CALL({
              functionName: LLVM_NAME('id'),
              functionArguments: [{ value: ZERO, type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'v0',
            }),
            LLVM_JUMP('end'),
            LLVM_LABEL('b1'),
            LLVM_CALL({
              functionName: LLVM_NAME('id'),
              functionArguments: [{ value: ONE, type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'v1',
            }),
            LLVM_JUMP('end'),
            LLVM_LABEL('end'),
            LLVM_PHI({
              resultVariable: 'a',
              variableType: LLVM_INT_TYPE,
              valueBranchTuples: [
                { value: LLVM_VARIABLE('v0'), branch: 'b0' },
                { value: LLVM_VARIABLE('v1'), branch: 'b1' },
              ],
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'b',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('b'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('1\n');
});

it('interpretLLVMModule switch integration test 2/2', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'id',
          parameters: [{ parameterName: 'n', parameterType: LLVM_INT_TYPE }],
          returnType: LLVM_INT_TYPE,
          body: [LLVM_RETURN(LLVM_VARIABLE('n'), LLVM_INT_TYPE)],
        },
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_LABEL('start'),
            LLVM_SWITCH(EIGHT, 'end', [
              { value: 0, branch: 'b0' },
              { value: 1, branch: 'b1' },
            ]),
            LLVM_LABEL('b0'),
            LLVM_CALL({
              functionName: LLVM_NAME('id'),
              functionArguments: [{ value: ZERO, type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'v0',
            }),
            LLVM_JUMP('end'),
            LLVM_LABEL('b1'),
            LLVM_CALL({
              functionName: LLVM_NAME('id'),
              functionArguments: [{ value: ONE, type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'v1',
            }),
            LLVM_JUMP('end'),
            LLVM_LABEL('end'),
            LLVM_PHI({
              resultVariable: 'a',
              variableType: LLVM_INT_TYPE,
              valueBranchTuples: [
                { value: EIGHT, branch: 'start' },
                { value: LLVM_VARIABLE('v0'), branch: 'b0' },
                { value: LLVM_VARIABLE('v1'), branch: 'b1' },
              ],
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'b',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('b'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('8\n');
});

it('interpretLLVMModule id function reference call integration test', () => {
  expect(
    interpretLLVMModule({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'id',
          parameters: [{ parameterName: 'n', parameterType: LLVM_INT_TYPE }],
          returnType: LLVM_INT_TYPE,
          body: [LLVM_RETURN(LLVM_VARIABLE('n'), LLVM_INT_TYPE)],
        },
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          returnType: LLVM_INT_TYPE,
          body: [
            LLVM_CAST({
              resultVariable: 'name',
              resultType: LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_INT_TYPE),
              sourceValue: LLVM_NAME('id'),
              sourceType: LLVM_FUNCTION_TYPE([LLVM_INT_TYPE], LLVM_BOOL_TYPE),
            }),
            LLVM_CALL({
              functionName: LLVM_VARIABLE('name'),
              functionArguments: [{ value: ONE, type: LLVM_INT_TYPE }],
              resultType: LLVM_INT_TYPE,
              resultVariable: 'a',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              functionArguments: [{ value: LLVM_VARIABLE('a'), type: LLVM_INT_TYPE }],
              resultType: LLVM_STRING_TYPE(),
              resultVariable: 'b',
            }),
            LLVM_CALL({
              functionName: LLVM_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
              functionArguments: [{ value: LLVM_VARIABLE('b'), type: LLVM_STRING_TYPE() }],
              resultType: LLVM_INT_TYPE,
            }),
            LLVM_RETURN(ZERO, LLVM_INT_TYPE),
          ],
        },
      ],
    })
  ).toBe('1\n');
});
