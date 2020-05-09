package samlang.compiler.asm.ralloc

import samlang.ast.asm.AssemblyArgs.R10
import samlang.ast.asm.AssemblyArgs.R11
import samlang.ast.asm.AssemblyArgs.R12
import samlang.ast.asm.AssemblyArgs.R13
import samlang.ast.asm.AssemblyArgs.R14
import samlang.ast.asm.AssemblyArgs.R15
import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RBX
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.RIP
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP

/**
 * A set of constants for register allocation.
 */
internal object RegisterAllocationConstants {
    /**
     * The coloring problem constant.
     * The number comes from 16 - 2, where 16 refers to 16 GPR and 2 refers to RSP and RBP that are
     * not considered to be suitable for use.
     * The list is shown below.
     */
    const val K = 14
    /** The set of registers that is OK to use for coloring temporary registers. */
    val OK_REGS: Set<String> = setOf(
            RAX.id, RBX.id, RCX.id, RDX.id, RSI.id, RDI.id,
            R8.id, R9.id, R10.id, R11.id, R12.id, R13.id, R14.id, R15.id
    )

    /** Machine registers, preassigned a color. The color is the same as the register name. */
    val PRE_COLORED_REGS: Set<String> = setOf(
            RIP.id,
            RAX.id, RBX.id, RCX.id, RDX.id,
            RSI.id, RDI.id, RSP.id, RBP.id,
            R8.id, R9.id, R10.id, R11.id,
            R12.id, R13.id, R14.id, R15.id
    )

    /** A set of callee-saved registers, available for use. */
    val CALLEE_SAVED_REGS: Set<String> = setOf(RBX.id, R12.id, R13.id, R14.id, R15.id)
}
