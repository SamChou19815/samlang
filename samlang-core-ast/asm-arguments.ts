export type AssemblyConst = { readonly __type__: 'AssemblyConst'; readonly value: number | string };

export type AssemblyRegister = { readonly __type__: 'AssemblyRegister'; readonly id: string };

export type AssemblyMemoryMultipleOf = {
  readonly baseRegister: AssemblyRegister;
  readonly multipliedConstant: 1 | 2 | 4 | 8;
};
export type AssemblyMemory = {
  readonly __type__: 'AssemblyMemory';
  readonly baseRegister?: AssemblyRegister;
  readonly multipleOf?: AssemblyMemoryMultipleOf;
  readonly displacementConstant?: AssemblyConst;
};

export type AssemblyConstOrRegister = AssemblyConst | AssemblyRegister;
export type AssemblyRegisterOrMemory = AssemblyRegister | AssemblyMemory;
export type AssemblyArgument = AssemblyConst | AssemblyRegister | AssemblyMemory;

export const ASM_CONST = (value: number): AssemblyConst => ({ __type__: 'AssemblyConst', value });

export const ASM_NAME = (name: string): AssemblyConst => ({
  __type__: 'AssemblyConst',
  value: name,
});

export const ASM_REG = (id: string): AssemblyRegister => ({ __type__: 'AssemblyRegister', id });

export const RIP: AssemblyRegister = ASM_REG('rip');
export const RAX: AssemblyRegister = ASM_REG('rax');
export const RBX: AssemblyRegister = ASM_REG('rbx');
export const RCX: AssemblyRegister = ASM_REG('rcx');
export const RDX: AssemblyRegister = ASM_REG('rdx');
export const RSI: AssemblyRegister = ASM_REG('rsi');
export const RDI: AssemblyRegister = ASM_REG('rdi');
export const RSP: AssemblyRegister = ASM_REG('rsp');
export const RBP: AssemblyRegister = ASM_REG('rbp');
export const R8: AssemblyRegister = ASM_REG('r8');
export const R9: AssemblyRegister = ASM_REG('r9');
export const R10: AssemblyRegister = ASM_REG('r10');
export const R11: AssemblyRegister = ASM_REG('r11');
export const R12: AssemblyRegister = ASM_REG('r12');
export const R13: AssemblyRegister = ASM_REG('r13');
export const R14: AssemblyRegister = ASM_REG('r14');
export const R15: AssemblyRegister = ASM_REG('r15');

export const ASM_MEM_CONST = (displacementConstant: AssemblyConst): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  displacementConstant,
});

export const ASM_MEM_REG = (baseRegister: AssemblyRegister): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  baseRegister,
});

export const ASM_MEM_MUL = (multipleOf: AssemblyMemoryMultipleOf): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  multipleOf,
});

export const ASM_MEM_REG_WITH_CONST = (
  baseRegister: AssemblyRegister,
  displacementConstant: AssemblyConst
): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  baseRegister,
  displacementConstant,
});

export const ASM_MEM_REG_WITH_MUL = (
  baseRegister: AssemblyRegister,
  multipleOf: AssemblyMemoryMultipleOf
): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  baseRegister,
  multipleOf,
});

export const ASM_MEM_REG_SUM = (
  baseRegister: AssemblyRegister,
  anotherRegister: AssemblyRegister
): AssemblyMemory =>
  ASM_MEM_REG_WITH_MUL(baseRegister, { baseRegister: anotherRegister, multipliedConstant: 1 });

export const ASM_MEM_MUL_WITH_CONST = (
  multipleOf: AssemblyMemoryMultipleOf,
  displacementConstant: AssemblyConst
): AssemblyMemory => ({ __type__: 'AssemblyMemory', multipleOf, displacementConstant });

export const ASM_MEM = (
  baseRegister?: AssemblyRegister,
  multipleOf?: AssemblyMemoryMultipleOf,
  displacementConstant?: AssemblyConst
): AssemblyMemory => ({
  __type__: 'AssemblyMemory',
  baseRegister,
  multipleOf,
  displacementConstant,
});

export const assemblyArgumentToString = (
  assemblyArgument: AssemblyArgument,
  isLinux = false
): string => {
  switch (assemblyArgument.__type__) {
    case 'AssemblyConst':
      if (typeof assemblyArgument.value === 'string') {
        const name = assemblyArgument.value;
        return isLinux && name.startsWith('_') ? name.substring(1) : name;
      }
      return String(assemblyArgument.value);
    case 'AssemblyRegister':
      return assemblyArgument.id;
    case 'AssemblyMemory': {
      const { baseRegister, multipleOf, displacementConstant } = assemblyArgument;
      let string = '';
      if (baseRegister != null) {
        string += baseRegister.id;
      }
      if (multipleOf != null) {
        if (string.length > 0) {
          string += '+';
        }
        string += `${multipleOf.baseRegister.id}*${multipleOf.multipliedConstant}`;
      }
      if (displacementConstant != null) {
        const { value } = displacementConstant;
        if (typeof value === 'string') {
          const prefixFixed = isLinux && value.startsWith('_') ? value.substring(1) : value;
          string += string.length > 0 ? `+${prefixFixed}` : prefixFixed;
        } else {
          // eslint-disable-next-line no-lonely-if
          if (value < 0) {
            string += value;
          } else {
            string += string.length > 0 ? `+${value}` : value;
          }
        }
      }
      return `qword ptr [${string}]`;
    }
  }
};
