package samlang.compiler.asm

import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.Reg

internal class FunctionAbstractRegisterAllocator {
    private var nextRegisterId: Int = 0

    /** @return the allocated next register. */
    fun nextReg(): Reg {
        val id = nextRegisterId
        nextRegisterId++
        return REG(id = "_INFINITE_REG_$id")
    }
}
