import {
  AssemblyRegister,
  AssemblyMemory,
  AssemblyConstOrRegister,
  AssemblyRegisterOrMemory,
  AssemblyArgument,
  ASM_REG,
  ASM_MEM,
} from '../../ast/asm-arguments';
import {
  AssemblyInstruction,
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_MEM,
  ASM_MOVE_REG,
  ASM_LEA,
  ASM_CMP_MEM,
  ASM_CMP_CONST_OR_REG,
  ASM_CALL,
  ASM_BIN_OP_MEM_DEST,
  ASM_BIN_OP_REG_DEST,
  ASM_IMUL,
  ASM_IDIV,
  ASM_NEG,
  ASM_SHL,
  ASM_PUSH,
  ASM_COMMENT,
} from '../../ast/asm-instructions';
import type { ReadonlyAssemblyMemoryMapping } from './asm-memory-mapping';
import { PRE_COLORED_REGISTERS } from './asm-register-allocation-utils';

/** The program rewriter after coloring is finished. */
class AssemblyColoringProgramRewriter {
  readonly newInstructions: readonly AssemblyInstruction[];

  constructor(
    private readonly colors: ReadonlyMap<string, string>,
    private readonly newSpilledVarMemMapping: ReadonlyAssemblyMemoryMapping,
    private readonly unusedCalleeSavedRegisters: ReadonlySet<string>,
    oldInstructions: readonly AssemblyInstruction[]
  ) {
    this.newInstructions = oldInstructions.map(this.rewrite);
  }

  private transformRegister = (register: AssemblyRegister): AssemblyRegister => {
    const mappedId = this.colors.get(register.id);
    return mappedId == null ? register : ASM_REG(mappedId);
  };

  private transformMemory = (mem: AssemblyMemory): AssemblyMemory => {
    const potentialNewMemMapping = this.newSpilledVarMemMapping.get(mem);
    if (potentialNewMemMapping != null) {
      return potentialNewMemMapping;
    }
    const baseRegister =
      mem.baseRegister == null ? undefined : this.transformRegister(mem.baseRegister);
    const multipleOf =
      mem.multipleOf == null
        ? undefined
        : {
            baseRegister: this.transformRegister(mem.multipleOf.baseRegister),
            multipliedConstant: mem.multipleOf.multipliedConstant,
          };
    return ASM_MEM(baseRegister, multipleOf, mem.displacementConstant);
  };

  private transformRegisterOrMemory = (
    registerOrMemory: AssemblyRegisterOrMemory
  ): AssemblyRegisterOrMemory => {
    switch (registerOrMemory.__type__) {
      case 'AssemblyRegister':
        return this.transformRegister(registerOrMemory);
      case 'AssemblyMemory':
        return this.transformMemory(registerOrMemory);
    }
  };

  private transformConstOrRegister = (
    constOrRegister: AssemblyConstOrRegister
  ): AssemblyConstOrRegister => {
    switch (constOrRegister.__type__) {
      case 'AssemblyConst':
        return constOrRegister;
      case 'AssemblyRegister':
        return this.transformRegister(constOrRegister);
    }
  };

  private transformAssemblyArgument = (assemblyArgument: AssemblyArgument): AssemblyArgument => {
    switch (assemblyArgument.__type__) {
      case 'AssemblyConst':
        return assemblyArgument;
      case 'AssemblyRegister':
        return this.transformRegister(assemblyArgument);
      case 'AssemblyMemory':
        return this.transformMemory(assemblyArgument);
    }
  };

  private rewrite = (node: AssemblyInstruction): AssemblyInstruction => {
    switch (node.__type__) {
      case 'AssemblyMoveFromLong':
        return ASM_MOVE_CONST_TO_REG(this.transformRegister(node.destination), node.value);
      case 'AssemblyMoveToMemory': {
        const source = this.transformConstOrRegister(node.source);
        if (
          source.__type__ === 'AssemblyRegister' &&
          this.unusedCalleeSavedRegisters.has(source.id)
        ) {
          return ASM_COMMENT(`unnecessary 'mov [mem], ${source.id}' is optimized away.`);
        }
        return ASM_MOVE_MEM(this.transformMemory(node.destination), source);
      }
      case 'AssemblyMoveToRegister': {
        const destination = this.transformRegister(node.destination);
        if (this.unusedCalleeSavedRegisters.has(destination.id)) {
          return ASM_COMMENT(`unnecessary 'mov ${destination.id}, [mem]' is optimized away.`);
        }
        const source = this.transformAssemblyArgument(node.source);
        if (source.__type__ === 'AssemblyRegister' && source.id === destination.id) {
          return ASM_COMMENT(`'mov ${destination.id}, ${destination.id}' is optimized away.`);
        }
        return ASM_MOVE_REG(destination, source);
      }
      case 'AssemblyLoadEffectiveAddress':
        return ASM_LEA(this.transformRegister(node.destination), this.transformMemory(node.source));
      case 'AssemblyCompareMemory':
        return ASM_CMP_MEM(
          this.transformRegister(node.minuend),
          this.transformMemory(node.subtrahend)
        );
      case 'AssemblyCompareConstOrRegister':
        return ASM_CMP_CONST_OR_REG(
          this.transformRegisterOrMemory(node.minuend),
          this.transformConstOrRegister(node.subtrahend)
        );
      case 'AssemblySetOnFlag':
        // istanbul ignore next
        if (!PRE_COLORED_REGISTERS.has(node.register.id)) throw new Error();
        return node;
      case 'AssemblyCall':
        return ASM_CALL(this.transformAssemblyArgument(node.address));
      case 'AssemblyArithmeticBinaryMemoryDestination':
        return ASM_BIN_OP_MEM_DEST(
          node.type,
          this.transformMemory(node.destination),
          this.transformConstOrRegister(node.source)
        );
      case 'AssemblyArithmeticBinaryRegisterDestination':
        return ASM_BIN_OP_REG_DEST(
          node.type,
          this.transformRegister(node.destination),
          this.transformAssemblyArgument(node.source)
        );
      case 'AssemblyIMulTwoArgs':
        return ASM_IMUL(
          this.transformRegister(node.destination),
          this.transformRegisterOrMemory(node.source)
        );
      case 'AssemblyIMulThreeArgs':
        return ASM_IMUL(
          this.transformRegister(node.destination),
          this.transformRegisterOrMemory(node.source),
          node.immediate
        );
      case 'AssemblyIDiv':
        return ASM_IDIV(this.transformRegisterOrMemory(node.divisor));
      case 'AssemblyNeg':
        return ASM_NEG(this.transformRegisterOrMemory(node.destination));
      case 'AssemblyShiftLeft':
        return ASM_SHL(this.transformRegisterOrMemory(node.destination), node.count);
      case 'AssemblyPush':
        return ASM_PUSH(this.transformAssemblyArgument(node.pushArgument));
      case 'AssemblyJump':
      case 'AssemblyReturn':
      case 'AssemblyCqo':
      case 'AssemblyPopRBP':
      case 'AssemblyLabel':
      case 'AssemblyComment':
        return node;
    }
  };
}

/**
 * @param colors all the coloring produced by the register allocator.
 * @param newSpilledVarMemMapping the new mapping for spilled var's memory location.
 * @param unusedCalleeSavedRegisters a set of unused callee saved registers as a reference.
 * @param oldInstructions a list of instructions to rewrite.
 */
const assemblyInstructionColoringRewrite = (
  colors: ReadonlyMap<string, string>,
  newSpilledVarMemMapping: ReadonlyAssemblyMemoryMapping,
  unusedCalleeSavedRegisters: ReadonlySet<string>,
  oldInstructions: readonly AssemblyInstruction[]
): readonly AssemblyInstruction[] =>
  new AssemblyColoringProgramRewriter(
    colors,
    newSpilledVarMemMapping,
    unusedCalleeSavedRegisters,
    oldInstructions
  ).newInstructions;

export default assemblyInstructionColoringRewrite;
