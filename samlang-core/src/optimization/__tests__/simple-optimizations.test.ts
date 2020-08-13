import { RAX, RBX } from '../../ast/asm/asm-arguments';
import {
  AssemblyInstruction,
  assemblyInstructionToString,
  ASM_MOVE_REG,
  ASM_JUMP,
  ASM_RET,
  ASM_LABEL,
  ASM_COMMENT,
} from '../../ast/asm/asm-instructions';
import {
  MidIRStatement,
  midIRStatementToString,
  MIR_MOVE_TEMP,
  MIR_LABEL,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  MIR_TEMP,
} from '../../ast/mir';
import {
  optimizeIrWithSimpleOptimization,
  optimizeAssemblyWithSimpleOptimization,
  optimizeIRWithUnusedNameElimination,
} from '../simple-optimizations';

const optimizeIRAndConvertToString = (midIRStatements: readonly MidIRStatement[]): string =>
  optimizeIrWithSimpleOptimization(midIRStatements).map(midIRStatementToString).join('\n');

const optimizeASMAndConvertToString = (
  instructions: readonly AssemblyInstruction[],
  removeComments = true
): string =>
  optimizeAssemblyWithSimpleOptimization(instructions, removeComments)
    .map(assemblyInstructionToString)
    .join('\n');

it('optimizeIrWithSimpleOptimization test.', () => {
  expect(optimizeIRAndConvertToString([MIR_RETURN()])).toBe('return;');

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_RETURN(),
    ])
  ).toBe(`if (boolVar) goto A;
a = b;
A:
return;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('A'),
      MIR_RETURN(),
    ])
  ).toBe(`return;`);

  expect(optimizeIRAndConvertToString([MIR_JUMP('A'), MIR_LABEL('A'), MIR_JUMP('A')])).toBe(
    'A:\ngoto A;'
  );

  expect(
    optimizeIRAndConvertToString([
      MIR_LABEL('A'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_JUMP('B'),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
    ])
  ).toBe(`A:
if (boolVar) goto A;
B:
a = b;
goto B;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_JUMP('B'),
      MIR_LABEL('A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('B'),
    ])
  ).toBe(`if (boolVar) goto A;
goto B;
A:
a = b;
B:`);

  expect(
    optimizeIRAndConvertToString([
      MIR_JUMP('C'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
      MIR_LABEL('C'),
    ])
  ).toBe('');

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
    ])
  ).toBe(`if (boolVar) goto B;
a = b;
B:
c = d;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_JUMP('A'),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_LABEL('C'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
      MIR_LABEL('D'),
      MIR_LABEL('E'),
      MIR_LABEL('F'),
      MIR_JUMP('G'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'G'),
      MIR_LABEL('G'),
      MIR_JUMP('C'),
      MIR_RETURN(),
      MIR_RETURN(),
      MIR_RETURN(),
    ])
  ).toBe(`C:
a = b;
c = d;
goto C;`);
});

it('optimizeIRWithUnusedNameElimination test', () => {
  expect(
    optimizeIRWithUnusedNameElimination({
      globalVariables: [
        { name: 'v1', content: '' },
        { name: 'v2', content: 'v2' },
      ],
      functions: [
        { functionName: 'f1', argumentNames: [], hasReturn: false, mainBodyStatements: [] },
        { functionName: 'f2', argumentNames: [], hasReturn: false, mainBodyStatements: [] },
      ],
    })
  ).toEqual({
    globalVariables: [],
    functions: [],
  });
});

it('optimizeAssemblyWithSimpleOptimization test', () => {
  expect(optimizeASMAndConvertToString([])).toBe('');

  expect(optimizeASMAndConvertToString([ASM_COMMENT('A'), ASM_MOVE_REG(RAX, RBX)])).toBe(
    'mov rax, rbx'
  );
  expect(optimizeASMAndConvertToString([ASM_MOVE_REG(RAX, RBX)], false)).toBe('mov rax, rbx');

  expect(
    optimizeASMAndConvertToString([
      ASM_JUMP('jl', 'A'),
      ASM_LABEL('B'),
      ASM_MOVE_REG(RAX, RBX),
      ASM_LABEL('A'),
    ])
  ).toBe(`jl A
mov rax, rbx
A:`);

  expect(
    optimizeASMAndConvertToString([
      ASM_JUMP('jmp', 'A'),
      ASM_LABEL('A'),
      ASM_LABEL('B'),
      ASM_LABEL('C'),
      ASM_MOVE_REG(RAX, RBX),
      ASM_MOVE_REG(RAX, RBX),
      ASM_LABEL('D'),
      ASM_LABEL('E'),
      ASM_LABEL('F'),
      ASM_JUMP('jmp', 'G'),
      ASM_JUMP('jl', 'G'),
      ASM_LABEL('G'),
      ASM_JUMP('jmp', 'C'),
      ASM_RET,
      ASM_RET,
      ASM_RET,
    ])
  ).toBe(`C:
mov rax, rbx
mov rax, rbx
jmp C`);
});
