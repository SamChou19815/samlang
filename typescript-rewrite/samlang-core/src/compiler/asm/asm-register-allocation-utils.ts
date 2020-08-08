import {
  RAX,
  RBX,
  RCX,
  RDX,
  RSI,
  RDI,
  RSP,
  RBP,
  RIP,
  R8,
  R9,
  R10,
  R11,
  R12,
  R13,
  R14,
  R15,
} from '../../ast/asm/asm-arguments';

/**
 * The coloring problem constant.
 * The number comes from 16 - 2, where 16 refers to 16 GPR and 2 refers to RSP and RBP that are
 * not considered to be suitable for use.
 * The list is shown below.
 */
export const AVAILABLE_REGISTERS_NUMBER = 14;

/** The set of registers that is OK to use for coloring temporary registers. */
export const AVAILABLE_REGISTERS: ReadonlySet<string> = new Set([
  RAX.id,
  RBX.id,
  RCX.id,
  RDX.id,
  RSI.id,
  RDI.id,
  R8.id,
  R9.id,
  R10.id,
  R11.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);

/** Machine registers, preassigned a color. The color is the same as the register name. */
export const PRE_COLORED_REGISTERS: ReadonlySet<string> = new Set([
  RIP.id,
  RAX.id,
  RBX.id,
  RCX.id,
  RDX.id,
  RSI.id,
  RDI.id,
  RSP.id,
  RBP.id,
  R8.id,
  R9.id,
  R10.id,
  R11.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);

/** A set of callee-saved registers, available for use. */
export const CALLEE_SAVED_REGISTERS: ReadonlySet<string> = new Set([
  RBX.id,
  R12.id,
  R13.id,
  R14.id,
  R15.id,
]);
