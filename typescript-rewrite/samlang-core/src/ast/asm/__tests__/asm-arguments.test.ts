import {
  assemblyArgumentToString,
  ASM_CONST,
  ASM_NAME,
  RIP,
  ASM_REG,
  ASM_MEM_CONST,
  ASM_MEM_REG,
  ASM_MEM_MUL,
  ASM_MEM_REG_WITH_CONST,
  ASM_MEM_REG_SUM,
  RAX,
  ASM_MEM_MUL_WITH_CONST,
  ASM_MEM,
} from '../asm-arguments';

it('assemblyArgumentToString tests', () => {
  expect(assemblyArgumentToString(ASM_CONST(1))).toBe('1');
  expect(assemblyArgumentToString(ASM_NAME('hi'))).toBe('hi');
  expect(assemblyArgumentToString(RIP)).toBe('rip');

  expect(assemblyArgumentToString(ASM_MEM_CONST(ASM_CONST(1)))).toBe('qword ptr [1]');
  expect(assemblyArgumentToString(ASM_MEM_CONST(ASM_NAME('foo')))).toBe('qword ptr [foo]');
  expect(assemblyArgumentToString(ASM_MEM_REG(ASM_REG('foo')))).toBe('qword ptr [foo]');
  expect(assemblyArgumentToString(ASM_MEM_MUL({ baseRegister: RIP, multipliedConstant: 2 }))).toBe(
    'qword ptr [rip*2]'
  );
  expect(assemblyArgumentToString(ASM_MEM_REG_WITH_CONST(RIP, ASM_CONST(5)))).toBe(
    'qword ptr [rip+5]'
  );
  expect(assemblyArgumentToString(ASM_MEM_REG_SUM(RIP, RAX))).toBe('qword ptr [rip+rax*1]');
  expect(
    assemblyArgumentToString(
      ASM_MEM_MUL_WITH_CONST({ baseRegister: RAX, multipliedConstant: 8 }, ASM_NAME('foo'))
    )
  ).toBe('qword ptr [rax*8+foo]');
  expect(
    assemblyArgumentToString(
      ASM_MEM(RAX, { baseRegister: RIP, multipliedConstant: 4 }, ASM_CONST(-2))
    )
  ).toBe('qword ptr [rax+rip*4-2]');
});
