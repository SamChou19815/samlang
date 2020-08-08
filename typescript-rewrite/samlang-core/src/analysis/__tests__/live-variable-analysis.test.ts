import {
  RAX,
  RDX,
  RDI,
  RSI,
  RBP,
  ASM_NAME,
  ASM_CONST,
  ASM_REG,
  ASM_MEM_REG,
  ASM_MEM_CONST,
  ASM_MEM_REG_SUM,
} from '../../ast/asm/asm-arguments';
import {
  AssemblyInstruction,
  ASM_MOVE_MEM,
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_REG,
  ASM_LEA,
  ASM_CMP_MEM,
  ASM_CMP_CONST_OR_REG,
  ASM_SET,
  ASM_JUMP,
  ASM_CALL,
  ASM_BIN_OP_MEM_DEST,
  ASM_BIN_OP_REG_DEST,
  ASM_IMUL,
  ASM_CQO,
  ASM_IDIV,
  ASM_NEG,
  ASM_SHL,
  ASM_PUSH,
  ASM_POP,
  ASM_RET,
  ASM_LABEL,
  ASM_COMMENT,
} from '../../ast/asm/asm-instructions';
import analyzeLiveVariablesAtTheEndOfEachInstruction from '../live-variable-analysis';

const analyze = (
  instructions: readonly AssemblyInstruction[],
  hasReturn = true
): readonly (readonly string[])[] =>
  analyzeLiveVariablesAtTheEndOfEachInstruction(instructions, hasReturn).map((it) =>
    Array.from(it)
  );

it('analyzeLiveVariablesAtTheEndOfEachInstruction test 1', () => {
  expect(
    analyze([
      /* 00 */ ASM_MOVE_CONST_TO_REG(ASM_REG('x'), BigInt(100000000000)),
      /* 01 */ ASM_CMP_CONST_OR_REG(ASM_REG('x'), ASM_CONST(2)),
      /* 02 */ ASM_JUMP('jle', 'true'),
      /* 03 */ ASM_CALL(ASM_NAME('f')),
      /* 04 */ ASM_MOVE_REG(ASM_REG('z2'), RAX),
      /* 05 */ ASM_MOVE_MEM(ASM_MEM_REG(ASM_REG('z2')), ASM_CONST(1)),
      /* 06 */ ASM_JUMP('jmp', 'r'),
      /* 07 */ ASM_LABEL('r'),
      /* 08 */ ASM_RET,
      /* 09 */ ASM_LABEL('true'),
      /* 10 */ ASM_MOVE_REG(ASM_REG('y'), ASM_REG('x')),
      /* 11 */ ASM_MOVE_REG(ASM_REG('z1'), ASM_MEM_CONST(ASM_CONST(1))),
      /* 12 */ ASM_MOVE_REG(ASM_REG('z2'), ASM_CONST(1)),
      /* 13 */ ASM_LABEL('end'),
      /* 14 */ ASM_LEA(RAX, ASM_MEM_REG_SUM(ASM_REG('y'), ASM_REG('z2'))),
      /* 15 */ ASM_RET,
    ])
  ).toEqual([
    /* 00 */ ['x', 'rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'],
    /* 01 */ ['x', 'rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'],
    /* 02 */ ['x', 'rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'],
    /* 03 */ ['rax'],
    /* 04 */ ['rax', 'z2'],
    /* 05 */ ['rax'],
    /* 06 */ ['rax'],
    /* 07 */ ['rax'],
    /* 08 */ [],
    /* 09 */ ['x'],
    /* 10 */ ['y'],
    /* 11 */ ['y'],
    /* 12 */ ['y', 'z2'],
    /* 13 */ ['y', 'z2'],
    /* 14 */ ['rax'],
    /* 15 */ [],
  ]);
});

it('analyzeLiveVariablesAtTheEndOfEachInstruction test 2', () => {
  expect(
    analyze([
      {
        __type__: 'AssemblyMoveFromLong',
        destination: ASM_MEM_REG(RAX),
        value: BigInt(1),
      },
      ASM_RET,
    ])
  ).toEqual([['rax'], []]);

  expect(analyze([ASM_SET('je', RAX), ASM_RET])).toEqual([['rax'], []]);

  expect(analyze([ASM_SET('je', RAX), ASM_RET], false)).toEqual([[], []]);
});

it('analyzeLiveVariablesAtTheEndOfEachInstruction test 3', () => {
  expect(
    analyze([
      /* 0 */ ASM_NEG(RDI),
      /* 1 */ ASM_SHL(RSI, 1),
      /* 2 */ ASM_BIN_OP_REG_DEST('add', RDI, RSI),
      /* 3 */ ASM_IMUL(RSI, RDI),
      /* 4 */ ASM_MOVE_REG(RAX, RSI),
      /* 5 */ ASM_MOVE_REG(RDX, RDI),
      /* 6 */ ASM_CQO,
      /* 7 */ ASM_IDIV(RSI),
      /* 8 */ ASM_RET,
    ])
  ).toEqual([
    /* 0 */ ['rdi', 'rsi'],
    /* 1 */ ['rsi', 'rdi'],
    /* 2 */ ['rdi', 'rsi'],
    /* 3 */ ['rsi', 'rdi'],
    /* 4 */ ['rsi', 'rax', 'rdi'],
    /* 5 */ ['rsi', 'rax'],
    /* 6 */ ['rsi', 'rax', 'rdx'],
    /* 7 */ ['rax'],
    /* 8 */ [],
  ]);
});

it('analyzeLiveVariablesAtTheEndOfEachInstruction test 4', () => {
  expect(
    analyze([
      /* 0 */ ASM_BIN_OP_MEM_DEST('xor', ASM_MEM_REG(RDI), RSI),
      /* 1 */ ASM_IMUL(RAX, ASM_MEM_REG(RDI), ASM_CONST(2)),
      /* 2 */ ASM_PUSH(RBP),
      /* 3 */ ASM_POP(RBP),
      /* 4 */ ASM_RET,
    ])
  ).toEqual([
    /* 0 */ ['rbp', 'rsp', 'rdi'],
    /* 1 */ ['rax', 'rbp', 'rsp'],
    /* 2 */ ['rax', 'rsp'],
    /* 3 */ ['rax'],
    /* 4 */ [],
  ]);
});

it('analyzeLiveVariablesAtTheEndOfEachInstruction test 5', () => {
  expect(
    analyze([
      ASM_COMMENT(''),
      ASM_CMP_MEM(RAX, ASM_MEM_CONST(ASM_CONST(1))),
      ASM_SHL(ASM_MEM_REG(RDI), 2),
      ASM_PUSH(ASM_MEM_REG(RDI)),
      ASM_RET,
    ])
  ).toEqual([['rax', 'rdi', 'rsp'], ['rax', 'rdi', 'rsp'], ['rax', 'rdi', 'rsp'], ['rax'], []]);
});
