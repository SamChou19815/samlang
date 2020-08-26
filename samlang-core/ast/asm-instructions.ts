import { bigIntIsWithin32BitIntegerRange } from '../util/int-util';
import {
  AssemblyConst,
  AssemblyRegister,
  AssemblyMemory,
  AssemblyArgument,
  AssemblyConstOrRegister,
  AssemblyRegisterOrMemory,
  assemblyArgumentToString as argToString,
} from './asm-arguments';

/*
 * --------------------------------------------------------------------------------
 * Section 1: Data Transfer Instructions
 * Link: https://en.wikibooks.org/wiki/X86_Assembly/Data_Transfer
 * --------------------------------------------------------------------------------
 */

/** movabs instruction. */
export type AssemblyMoveFromLong = {
  readonly __type__: 'AssemblyMoveFromLong';
  readonly destination: AssemblyRegister;
  readonly value: bigint;
};

/** mov instruction. */
export type AssemblyMoveToMemory = {
  readonly __type__: 'AssemblyMoveToMemory';
  readonly destination: AssemblyMemory;
  readonly source: AssemblyConstOrRegister;
};

/** mov instruction. */
export type AssemblyMoveToRegister = {
  readonly __type__: 'AssemblyMoveToRegister';
  readonly destination: AssemblyRegister;
  readonly source: AssemblyArgument;
};

/**
 * lea instruction.
 * It calculates the address of the source operand and loads it into the destination operand.
 */
export type AssemblyLoadEffectiveAddress = {
  readonly __type__: 'AssemblyLoadEffectiveAddress';
  readonly destination: AssemblyRegister;
  readonly source: AssemblyMemory;
};

/*
 * --------------------------------------------------------------------------------
 * Section 2: Control Flow Instructions
 * Link: https://en.wikibooks.org/wiki/X86_Assembly/Control_Flow
 * --------------------------------------------------------------------------------
 */

/** cmp instruction. */
export type AssemblyCompareMemory = {
  readonly __type__: 'AssemblyCompareMemory';
  readonly minuend: AssemblyRegister;
  readonly subtrahend: AssemblyMemory;
};

/** cmp instruction. */
export type AssemblyCompareConstOrRegister = {
  readonly __type__: 'AssemblyCompareConstOrRegister';
  readonly minuend: AssemblyRegisterOrMemory;
  readonly subtrahend: AssemblyConstOrRegister;
};

export type AssemblyConditionalJumpType = 'je' | 'jne' | 'jl' | 'jle' | 'jg' | 'jge' | 'jz' | 'jnz';
export type AssemblyJumpType = 'jmp' | AssemblyConditionalJumpType;

/**
 * A pseudo-instruction invented by dev-sam.
 * It will turned into
 * - setcc (change end based on type) [1-byte form of reg]
 * - movez reg [1-byte form of reg]
 * when it's turned into actual assembly.
 */
export type AssemblySetOnFlag = {
  readonly __type__: 'AssemblySetOnFlag';
  readonly type: AssemblyConditionalJumpType;
  readonly register: AssemblyRegister;
};

/** jmp instruction. */
export type AssemblyJump = {
  readonly __type__: 'AssemblyJump';
  readonly type: AssemblyJumpType;
  readonly label: string;
};

/** call instruction. */
export type AssemblyCall = {
  readonly __type__: 'AssemblyCall';
  readonly address: AssemblyArgument;
};

/** ret instruction. */
export type AssemblyReturn = { readonly __type__: 'AssemblyReturn' };

/*
 * --------------------------------------------------------------------------------
 * Section 3: Arithmetic Instructions
 * Links:
 * https://en.wikibooks.org/wiki/X86_Assembly/Arithmetic
 * https://en.wikibooks.org/wiki/X86_Assembly/Logic
 * https://en.wikibooks.org/wiki/X86_Assembly/Shift_and_Rotate
 * https://www.tutorialspoint.com/assembly_programming/assembly_arithmetic_instructions.htm
 * --------------------------------------------------------------------------------
 */

export type AssemblyArithmeticBinaryOpType = 'add' | 'sub' | 'xor';

/** binop instruction, see types above. */
export type AssemblyArithmeticBinaryMemoryDestination = {
  readonly __type__: 'AssemblyArithmeticBinaryMemoryDestination';
  readonly type: AssemblyArithmeticBinaryOpType;
  readonly destination: AssemblyMemory;
  readonly source: AssemblyConstOrRegister;
};

/** binop instruction, see types above. */
export type AssemblyArithmeticBinaryRegisterDestination = {
  readonly __type__: 'AssemblyArithmeticBinaryRegisterDestination';
  readonly type: AssemblyArithmeticBinaryOpType;
  readonly destination: AssemblyRegister;
  readonly source: AssemblyArgument;
};

/** imul instruction */
export type AssemblyIMulTwoArgs = {
  readonly __type__: 'AssemblyIMulTwoArgs';
  readonly destination: AssemblyRegister;
  readonly source: AssemblyRegisterOrMemory;
};

/** imul instruction */
export type AssemblyIMulThreeArgs = {
  readonly __type__: 'AssemblyIMulThreeArgs';
  readonly destination: AssemblyRegister;
  readonly source: AssemblyRegisterOrMemory;
  readonly immediate: AssemblyConst;
};

/** cqo instruction. */
export type AssemblyCqo = { readonly __type__: 'AssemblyCqo' };

/** idiv instruction. */
export type AssemblyIDiv = {
  readonly __type__: 'AssemblyIDiv';
  readonly divisor: AssemblyRegisterOrMemory;
};

/** neg instruction. */
export type AssemblyNeg = {
  readonly __type__: 'AssemblyNeg';
  readonly destination: AssemblyRegisterOrMemory;
};

/** shl instruction. */
export type AssemblyShiftLeft = {
  readonly __type__: 'AssemblyShiftLeft';
  readonly destination: AssemblyRegisterOrMemory;
  readonly count: number;
};

/*
 * --------------------------------------------------------------------------------
 * Section 4: Other Instructions
 * Link: https://en.wikibooks.org/wiki/X86_Assembly/Other_Instructions
 * --------------------------------------------------------------------------------
 */

/**
 * push instruction.
 * This instruction decrements the stack pointer and stores the data specified as the argument
 * into the location pointed to by the stack pointer.
 */
export type AssemblyPush = {
  readonly __type__: 'AssemblyPush';
  readonly pushArgument: AssemblyArgument;
};

/**
 * pop instruction.
 * This instruction loads the data stored in RBP pointed to by the stack pointer
 * into the argument specified and then increments the stack pointer
 */
export type AssemblyPopRBP = { readonly __type__: 'AssemblyPopRBP' };

export type AssemblyLabel = {
  readonly __type__: 'AssemblyLabel';
  readonly label: string;
};

export type AssemblyComment = {
  readonly __type__: 'AssemblyComment';
  readonly comment: string;
};

export type AssemblyInstruction =
  | AssemblyMoveFromLong
  | AssemblyMoveToMemory
  | AssemblyMoveToRegister
  | AssemblyLoadEffectiveAddress
  | AssemblyCompareMemory
  | AssemblyCompareConstOrRegister
  | AssemblySetOnFlag
  | AssemblyJump
  | AssemblyCall
  | AssemblyReturn
  | AssemblyArithmeticBinaryMemoryDestination
  | AssemblyArithmeticBinaryRegisterDestination
  | AssemblyIMulTwoArgs
  | AssemblyIMulThreeArgs
  | AssemblyCqo
  | AssemblyIDiv
  | AssemblyNeg
  | AssemblyShiftLeft
  | AssemblyPush
  | AssemblyPopRBP
  | AssemblyLabel
  | AssemblyComment;

export const ASM_MOVE_CONST_TO_REG = (
  destination: AssemblyRegister,
  value: bigint
): AssemblyMoveFromLong | AssemblyMoveToRegister => {
  if (!bigIntIsWithin32BitIntegerRange(value)) {
    return { __type__: 'AssemblyMoveFromLong', destination, value };
  }
  return {
    __type__: 'AssemblyMoveToRegister',
    destination,
    source: { __type__: 'AssemblyConst', value: Number(value) },
  };
};

export const ASM_MOVE_MEM = (
  destination: AssemblyMemory,
  source: AssemblyConstOrRegister
): AssemblyMoveToMemory => ({
  __type__: 'AssemblyMoveToMemory',
  destination,
  source,
});

export const ASM_MOVE_REG = (
  destination: AssemblyRegister,
  source: AssemblyArgument
): AssemblyMoveToRegister => ({
  __type__: 'AssemblyMoveToRegister',
  destination,
  source,
});

export const ASM_LEA = (
  destination: AssemblyRegister,
  source: AssemblyMemory
): AssemblyLoadEffectiveAddress => ({
  __type__: 'AssemblyLoadEffectiveAddress',
  destination,
  source,
});

export const ASM_CMP_MEM = (
  minuend: AssemblyRegister,
  subtrahend: AssemblyMemory
): AssemblyCompareMemory => ({
  __type__: 'AssemblyCompareMemory',
  minuend,
  subtrahend,
});

export const ASM_CMP_CONST_OR_REG = (
  minuend: AssemblyRegisterOrMemory,
  subtrahend: AssemblyConstOrRegister
): AssemblyCompareConstOrRegister => ({
  __type__: 'AssemblyCompareConstOrRegister',
  minuend,
  subtrahend,
});

export const ASM_SET = (
  type: AssemblyConditionalJumpType,
  register: AssemblyRegister
): AssemblySetOnFlag => ({
  __type__: 'AssemblySetOnFlag',
  type,
  register,
});

export const ASM_JUMP = (type: AssemblyJumpType, label: string): AssemblyJump => ({
  __type__: 'AssemblyJump',
  type,
  label,
});

export const ASM_CALL = (address: AssemblyArgument): AssemblyCall => ({
  __type__: 'AssemblyCall',
  address,
});

export const ASM_RET: AssemblyReturn = { __type__: 'AssemblyReturn' };

export const ASM_BIN_OP_MEM_DEST = (
  type: AssemblyArithmeticBinaryOpType,
  destination: AssemblyMemory,
  source: AssemblyConstOrRegister
): AssemblyArithmeticBinaryMemoryDestination => ({
  __type__: 'AssemblyArithmeticBinaryMemoryDestination',
  type,
  destination,
  source,
});

export const ASM_BIN_OP_REG_DEST = (
  type: AssemblyArithmeticBinaryOpType,
  destination: AssemblyRegister,
  source: AssemblyArgument
): AssemblyArithmeticBinaryRegisterDestination => ({
  __type__: 'AssemblyArithmeticBinaryRegisterDestination',
  type,
  destination,
  source,
});

export const ASM_IMUL = (
  destination: AssemblyRegister,
  source: AssemblyRegisterOrMemory,
  immediate?: AssemblyConst
): AssemblyIMulTwoArgs | AssemblyIMulThreeArgs =>
  immediate == null
    ? { __type__: 'AssemblyIMulTwoArgs', destination, source }
    : { __type__: 'AssemblyIMulThreeArgs', destination, source, immediate };

export const ASM_CQO: AssemblyCqo = { __type__: 'AssemblyCqo' };

export const ASM_IDIV = (divisor: AssemblyRegisterOrMemory): AssemblyIDiv => ({
  __type__: 'AssemblyIDiv',
  divisor,
});

export const ASM_NEG = (destination: AssemblyRegisterOrMemory): AssemblyNeg => ({
  __type__: 'AssemblyNeg',
  destination,
});

export const ASM_SHL = (
  destination: AssemblyRegisterOrMemory,
  count: number
): AssemblyShiftLeft => ({
  __type__: 'AssemblyShiftLeft',
  destination,
  count,
});

export const ASM_PUSH = (pushArgument: AssemblyArgument): AssemblyPush => ({
  __type__: 'AssemblyPush',
  pushArgument,
});

export const ASM_POP_RBP: AssemblyPopRBP = { __type__: 'AssemblyPopRBP' };

export const ASM_LABEL = (label: string): AssemblyLabel => ({ __type__: 'AssemblyLabel', label });

export const ASM_COMMENT = (comment: string): AssemblyComment => ({
  __type__: 'AssemblyComment',
  comment,
});

export const assemblyInstructionToString = (instruction: AssemblyInstruction): string => {
  switch (instruction.__type__) {
    case 'AssemblyMoveFromLong':
      return `movabs ${argToString(instruction.destination)}, ${instruction.value}`;
    case 'AssemblyMoveToMemory':
    case 'AssemblyMoveToRegister':
      return `mov ${argToString(instruction.destination)}, ${argToString(instruction.source)}`;
    case 'AssemblyLoadEffectiveAddress':
      return `lea ${argToString(instruction.destination)}, ${argToString(instruction.source)}`;
    case 'AssemblyCompareMemory':
    case 'AssemblyCompareConstOrRegister':
      return `cmp ${argToString(instruction.minuend)}, ${argToString(instruction.subtrahend)}`;
    case 'AssemblySetOnFlag': {
      const setType = `set${instruction.type.slice(1)}`;
      let reg1Byte: string;
      switch (instruction.register.id) {
        case 'rax':
          reg1Byte = 'al';
          break;
        case 'rbx':
          reg1Byte = 'bl';
          break;
        case 'rcx':
          reg1Byte = 'cl';
          break;
        case 'rdx':
          reg1Byte = 'dl';
          break;
        case 'rsi':
          reg1Byte = 'sil';
          break;
        case 'rdi':
          reg1Byte = 'dil';
          break;
        case 'rsp':
          reg1Byte = 'spl';
          break;
        case 'rbp':
          reg1Byte = 'bpl';
          break;
        case 'r8':
          reg1Byte = 'r8b';
          break;
        case 'r9':
          reg1Byte = 'r9b';
          break;
        case 'r10':
          reg1Byte = 'r10b';
          break;
        case 'r11':
          reg1Byte = 'r11b';
          break;
        case 'r12':
          reg1Byte = 'r12b';
          break;
        case 'r13':
          reg1Byte = 'r13b';
          break;
        case 'r14':
          reg1Byte = 'r14b';
          break;
        case 'r15':
          reg1Byte = 'r15b';
          break;
        default:
          throw new Error(`Impossible register value: ${instruction.register.id}`);
      }
      return `${setType} ${reg1Byte}\nmovzx ${argToString(instruction.register)}, ${reg1Byte}`;
    }
    case 'AssemblyJump':
      return `${instruction.type} ${instruction.label}`;
    case 'AssemblyCall':
      return `call ${argToString(instruction.address)}`;
    case 'AssemblyReturn':
      return 'ret';
    case 'AssemblyArithmeticBinaryMemoryDestination':
    case 'AssemblyArithmeticBinaryRegisterDestination': {
      const { type, destination, source } = instruction;
      return `${type} ${argToString(destination)}, ${argToString(source)}`;
    }
    case 'AssemblyIMulTwoArgs':
      return `imul ${argToString(instruction.destination)}, ${argToString(instruction.source)}`;
    case 'AssemblyIMulThreeArgs': {
      const { destination, source, immediate } = instruction;
      return `imul ${argToString(destination)}, ${argToString(source)}, ${immediate.value}`;
    }
    case 'AssemblyCqo':
      return 'cqo';
    case 'AssemblyIDiv':
      return `idiv ${argToString(instruction.divisor)}`;
    case 'AssemblyNeg':
      return `neg ${argToString(instruction.destination)}`;
    case 'AssemblyShiftLeft':
      return `shl ${argToString(instruction.destination)}, ${instruction.count}`;
    case 'AssemblyPush':
      return `push ${argToString(instruction.pushArgument)}`;
    case 'AssemblyPopRBP':
      return 'pop rbp';
    case 'AssemblyLabel':
      return `${instruction.label}:`;
    case 'AssemblyComment':
      return `## ${instruction.comment}`;
  }
};
