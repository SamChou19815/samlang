import { AssemblyRegister, ASM_REG } from 'samlang-core-ast/asm-arguments';

export default class AssemblyFunctionAbstractRegisterAllocator {
  private nextRegisterId = 0;

  nextReg(): AssemblyRegister {
    const id = this.nextRegisterId;
    this.nextRegisterId += 1;
    return ASM_REG(`_ABSTRACT_REG_${id}`);
  }
}
