package samlang.ast.asm

/** The common interface for assembly arguments. */
interface AssemblyArg {
    /**
     * Run a pattern matching function on this assembly arg.
     *
     * @param constF the function to be called when this arg is a const.
     * @param regF the function to be called when this arg is a register.
     * @param memF the function to be called when this arg is a mem expression.
     * @param T the return type.
     * @return the return value of one of the function.
     */
    fun <T> match(
        constF: (AssemblyArgs.Const) -> T,
        regF: (AssemblyArgs.Reg) -> T,
        memF: (AssemblyArgs.Mem) -> T
    ): T

    fun <T> matchConstVsRegOrMem(
        constF: (AssemblyArgs.Const) -> T,
        regOrMemF: (RegOrMem) -> T
    ): T = match(constF, regOrMemF, regOrMemF)

    fun <T> matchConstOrRegVsMem(
        constOrRegF: (ConstOrReg) -> T,
        memF: (AssemblyArgs.Mem) -> T
    ): T = match(constOrRegF, constOrRegF, memF)
}
