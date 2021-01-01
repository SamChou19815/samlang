import generateAssemblyInstructionsFromMidIRCompilationUnit from '../asm-toplevel-generator';

import { assemblyInstructionToString } from 'samlang-core-ast/asm-instructions';
import {
  MidIRCompilationUnit,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  MIR_ZERO,
  MIR_ONE,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MidIRTemporaryExpression,
  MidIRExpression,
  MIR_JUMP,
  MIR_CONST,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const compile = (
  compilationUnit: MidIRCompilationUnit,
  checkInvariant = true,
  removeComments = true
): string =>
  generateAssemblyInstructionsFromMidIRCompilationUnit(
    compilationUnit,
    checkInvariant,
    removeComments
  )
    .instructions.map((it) => assemblyInstructionToString(it))
    .join('\n');

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 0', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'emptyFunction',
          argumentNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
          hasReturn: false,
          mainBodyStatements: [MIR_RETURN()],
        },
      ],
    })
  ).toBe(`emptyFunction:
mov rax, qword ptr [rbp+16]
mov rax, qword ptr [rbp+24]
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 1', () => {
  expect(
    compile(
      {
        globalVariables: [],
        functions: [
          {
            functionName: 'emptyFunction',
            argumentNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
            hasReturn: false,
            mainBodyStatements: [MIR_RETURN()],
          },
        ],
      },
      false,
      false
    )
  ).toBe(`emptyFunction:
## emptyFunction prologue starts
## emptyFunction prologue ends
## 'mov rbx, rbx' is optimized away.
## 'mov r12, r12' is optimized away.
## 'mov r13, r13' is optimized away.
## 'mov r14, r14' is optimized away.
## 'mov r15, r15' is optimized away.
## 'mov rdi, rdi' is optimized away.
## 'mov rsi, rsi' is optimized away.
## 'mov rdx, rdx' is optimized away.
## 'mov rcx, rcx' is optimized away.
## 'mov r8, r8' is optimized away.
## 'mov r9, r9' is optimized away.
mov rax, qword ptr [rbp+16]
## return;
## 'mov rbx, rbx' is optimized away.
## 'mov r12, r12' is optimized away.
## 'mov r13, r13' is optimized away.
## 'mov r14, r14' is optimized away.
## 'mov r15, r15' is optimized away.
## Dummy end of program.
## emptyFunction epilogue starts
ret
## emptyFunction epilogue ends`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 2', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'moveMove',
          argumentNames: ['a'],
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('a')),
            MIR_MOVE_IMMUTABLE_MEM(
              MIR_IMMUTABLE_MEM(MIR_TEMP('a')),
              MIR_IMMUTABLE_MEM(MIR_TEMP('a'))
            ),
            MIR_RETURN(),
          ],
        },
      ],
    })
  ).toBe(`moveMove:
mov rax, qword ptr [rdi]
mov qword ptr [rdi], rax
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 3', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'infiniteLoop',
          argumentNames: [],
          hasReturn: false,
          mainBodyStatements: [MIR_CALL_FUNCTION('infiniteLoop', []), MIR_RETURN()],
        },
      ],
    })
  ).toBe(`infiniteLoop:
push rbp
mov rbp, rsp
call infiniteLoop
mov rsp, rbp
pop rbp
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 4', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'factorial',
          argumentNames: ['n', 'acc'],
          hasReturn: true,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_CALL_FUNCTION(
              'factorial',
              [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
              'dummy'
            ),
            MIR_RETURN(MIR_TEMP('dummy')),
            MIR_LABEL('LABEL_RETURN_ACC'),
            MIR_RETURN(MIR_TEMP('acc')),
          ],
        },
      ],
    })
  ).toBe(`factorial:
push rbp
mov rbp, rsp
mov r10, rdi
mov rax, rsi
cmp r10, 0
je LABEL_FUNCTION_CALL_EPILOGUE_FOR_factorial
lea rdi, qword ptr [r10-1]
mov rsi, rax
imul rsi, r10
call factorial
LABEL_FUNCTION_CALL_EPILOGUE_FOR_factorial:
mov rsp, rbp
pop rbp
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 5', () => {
  const temps: MidIRTemporaryExpression[] = [];
  for (let i = 0; i < 30; i += 1) {
    temps.push(MIR_TEMP(`v${i}`));
  }
  let op: MidIRExpression = checkNotNull(temps[0]);
  for (let i = 1; i < 30; i += 1) {
    op = MIR_OP('+', op, checkNotNull(temps[i]));
  }
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'tooMuchInterference',
          argumentNames: [],
          hasReturn: true,
          mainBodyStatements: [
            ...temps.map((temp) => MIR_MOVE_TEMP(temp, MIR_ZERO)),
            MIR_RETURN(op),
          ],
        },
      ],
    })
  ).toBe(`tooMuchInterference:
push rbp
mov rbp, rsp
sub rsp, 168
mov qword ptr [rbp-168], rbx
mov qword ptr [rbp-160], r12
mov qword ptr [rbp-152], r13
mov qword ptr [rbp-144], r14
mov qword ptr [rbp-136], r15
mov rax, 0
mov qword ptr [rbp-8], 0
mov qword ptr [rbp-16], 0
mov qword ptr [rbp-24], 0
mov qword ptr [rbp-32], 0
mov qword ptr [rbp-40], 0
mov qword ptr [rbp-48], 0
mov qword ptr [rbp-56], 0
mov qword ptr [rbp-64], 0
mov qword ptr [rbp-72], 0
mov qword ptr [rbp-80], 0
mov qword ptr [rbp-88], 0
mov qword ptr [rbp-96], 0
mov qword ptr [rbp-104], 0
mov qword ptr [rbp-112], 0
mov qword ptr [rbp-120], 0
mov qword ptr [rbp-128], 0
mov r15, 0
mov rbx, 0
mov rcx, 0
mov rdx, 0
mov rsi, 0
mov rdi, 0
mov r8, 0
mov r9, 0
mov r10, 0
mov r11, 0
mov r12, 0
mov r13, 0
mov r14, 0
add rax, qword ptr [rbp-8]
add rax, qword ptr [rbp-16]
add rax, qword ptr [rbp-24]
add rax, qword ptr [rbp-32]
add rax, qword ptr [rbp-40]
add rax, qword ptr [rbp-48]
add rax, qword ptr [rbp-56]
add rax, qword ptr [rbp-64]
add rax, qword ptr [rbp-72]
add rax, qword ptr [rbp-80]
add rax, qword ptr [rbp-88]
add rax, qword ptr [rbp-96]
add rax, qword ptr [rbp-104]
add rax, qword ptr [rbp-112]
add rax, qword ptr [rbp-120]
add rax, qword ptr [rbp-128]
add rax, r15
add rax, rbx
add rax, rcx
add rax, rdx
add rax, rsi
add rax, rdi
add rax, r8
add rax, r9
add rax, r10
add rax, r11
add rax, r12
add rax, r13
add rax, r14
mov rbx, qword ptr [rbp-168]
mov r12, qword ptr [rbp-160]
mov r13, qword ptr [rbp-152]
mov r14, qword ptr [rbp-144]
mov r15, qword ptr [rbp-136]
mov rsp, rbp
pop rbp
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 6', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'factorial',
          argumentNames: ['n'],
          hasReturn: true,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('acc'), MIR_ONE),
            MIR_LABEL('begin'),
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_MOVE_TEMP(MIR_TEMP('n1'), MIR_OP('-', MIR_TEMP('n'), MIR_ONE)),
            MIR_MOVE_TEMP(MIR_TEMP('acc'), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))),
            MIR_MOVE_TEMP(MIR_TEMP('n'), MIR_TEMP('n1')),
            MIR_JUMP('begin'),
            MIR_LABEL('LABEL_RETURN_ACC'),
            MIR_RETURN(MIR_TEMP('acc')),
          ],
        },
      ],
    })
  ).toBe(`factorial:
mov rax, 1
begin:
cmp rdi, 0
je LABEL_RETURN_ACC
lea rcx, qword ptr [rdi-1]
imul rax, rdi
mov rdi, rcx
jmp begin
LABEL_RETURN_ACC:
ret`);
});

it('generateAssemblyInstructionsFromMidIRCompilationUnit test 7', () => {
  expect(
    compile({
      globalVariables: [],
      functions: [
        {
          functionName: 'factorial',
          argumentNames: ['n'],
          hasReturn: true,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_1'),
            MIR_CALL_FUNCTION('factorial', [MIR_OP('-', MIR_TEMP('n'), MIR_ONE)], 'dummy'),
            MIR_RETURN(MIR_OP('*', MIR_TEMP('n'), MIR_TEMP('dummy'))),
            MIR_LABEL('LABEL_RETURN_1'),
            MIR_RETURN(MIR_ONE),
          ],
        },
      ],
    })
  ).toBe(`factorial:
push rbp
mov rbp, rsp
sub rsp, 16
mov qword ptr [rbp-8], rbx
mov rbx, rdi
cmp rbx, 0
je LABEL_RETURN_1
lea rdi, qword ptr [rbx-1]
call factorial
mov rcx, rax
mov rax, rbx
imul rax, rcx
jmp LABEL_FUNCTION_CALL_EPILOGUE_FOR_factorial
LABEL_RETURN_1:
mov rax, 1
LABEL_FUNCTION_CALL_EPILOGUE_FOR_factorial:
mov rbx, qword ptr [rbp-8]
mov rsp, rbp
pop rbp
ret`);
});
