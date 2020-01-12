package samlang.ast.asm

/** The common interface for assembly constant or register. */
interface ConstOrReg : AssemblyArg {
    /**
     * Run a pattern matching function on this reg or mem.
     *
     * @param constF the function to be called when this arg is a constant.
     * @param regF the function to be called when this arg is a register.
     * @param T the return type.
     * @return the return value of one of the function.
     */
    fun <T> matchConstOrReg(constF: (AssemblyArgs.Const) -> T, regF: (AssemblyArgs.Reg) -> T): T
}
