package samlang.ast.asm

/** The common interface for assembly register or mem. */
interface RegOrMem : AssemblyArg {
    /**
     * Run a pattern matching function on this reg or mem.
     *
     * @param regF the function to be called when this arg is a register.
     * @param memF the function to be called when this arg is a mem.
     * @param T the return type.
     * @return the return value of one of the function.
     */
    fun <T> matchRegOrMem(regF: (AssemblyArgs.Reg) -> T, memF: (AssemblyArgs.Mem) -> T): T
}
