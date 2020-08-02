import {
  AssemblyRegister,
  AssemblyMemory,
  AssemblyArgument,
  AssemblyConstOrRegister,
  AssemblyRegisterOrMemory,
  AssemblyConst,
} from './asm-arguments';

/*
 * --------------------------------------------------------------------------------
 * Section 1: Data Transfer Instructions
 * Link: https://en.wikibooks.org/wiki/X86_Assembly/Data_Transfer
 * --------------------------------------------------------------------------------
 */

/** mov instruction. */
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
  readonly destination: AssemblyMoveToRegister;
  readonly source: AssemblyArgument;
};

/**
 * lea instruction.
 * It calculates the address of the source operand and loads it into the destination operand.
 */
export type AssemblyLoadEffectiveAddress = {
  readonly __type__: 'AssemblyLoadEffectiveAddress';
  readonly destination: AssemblyMoveToRegister;
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
  readonly destination: AssemblyMemory;
  readonly source: AssemblyConstOrRegister;
};

/** binop instruction, see types above. */
export type AssemblyArithmeticBinaryRegisterDestination = {
  readonly __type__: 'AssemblyArithmeticBinaryRegisterDestination';
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
 * This instruction loads the data stored in the location pointed to by the stack pointer
 * into the argument specified and then increments the stack pointer
 */
export type AssemblyPop = {
  readonly __type__: 'AssemblyPop';
  readonly popArgument: AssemblyRegisterOrMemory;
};

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
  | AssemblyPop
  | AssemblyLabel
  | AssemblyComment;
