package samlang.ast.asm

@Suppress(names = ["FunctionName"])
object AssemblyArgs {
    val RIP: Reg = Reg(id = "rip")
    val RAX: Reg = Reg(id = "rax")
    val RBX: Reg = Reg(id = "rbx")
    val RCX: Reg = Reg(id = "rcx")
    val RDX: Reg = Reg(id = "rdx")
    val RSI: Reg = Reg(id = "rsi")
    val RDI: Reg = Reg(id = "rdi")
    val RSP: Reg = Reg(id = "rsp")
    val RBP: Reg = Reg(id = "rbp")
    val R8: Reg = Reg(id = "r8")
    val R9: Reg = Reg(id = "r9")
    val R10: Reg = Reg(id = "r10")
    val R11: Reg = Reg(id = "r11")
    val R12: Reg = Reg(id = "r12")
    val R13: Reg = Reg(id = "r13")
    val R14: Reg = Reg(id = "r14")
    val R15: Reg = Reg(id = "r15")

    fun CONST(value: Int): Const = Const(value = value)

    fun NAME(name: String): Const = Const(name = name)

    fun REG(id: String): Reg = Reg(id = id)

    fun MEM(displacement: Const): Mem =
        Mem(baseReg = null, multipleOf = null, displacement = displacement)

    fun MEM(baseReg: Reg, displacement: Const): Mem =
        Mem(baseReg = baseReg, multipleOf = null, displacement = displacement)

    fun MEM(baseReg: Reg, anotherReg: Reg): Mem = MEM(
        baseReg = baseReg,
        multipleOf = Mem.MultipleOf(
            baseReg = anotherReg,
            multipliedConstant = Mem.MultipleOf.MultipliedConstant.ONE
        )
    )

    fun MEM(reg: Reg): Mem = Mem(baseReg = reg, multipleOf = null, displacement = null)

    fun MEM_MUL(multipleOf: Mem.MultipleOf): Mem =
        Mem(baseReg = null, multipleOf = multipleOf, displacement = null)

    fun MEM(baseReg: Reg, multipleOf: Mem.MultipleOf): Mem =
        Mem(baseReg = baseReg, multipleOf = multipleOf, displacement = null)

    fun MEM(multipleOf: Mem.MultipleOf, displacement: Const): Mem =
        Mem(baseReg = null, multipleOf = multipleOf, displacement = displacement)

    data class Const(val value: Int?, val name: String?) : ConstOrReg {
        constructor(value: Int) : this(value = value, name = null)
        constructor(name: String) : this(value = null, name = name)

        override fun <T> matchConstOrReg(constF: (Const) -> T, regF: (Reg) -> T): T = constF(this)

        override fun <T> match(constF: (Const) -> T, regF: (Reg) -> T, memF: (Mem) -> T): T =
            constF(this)

        override fun toString(): String {
            if (value == null && name == null || value != null && name != null) {
                error(message = "Impossible")
            }
            return value?.toString() ?: name!!
        }
    }

    data class Reg(val id: String) : ConstOrReg, RegOrMem, Comparable<Reg> {
        override fun <T> matchConstOrReg(constF: (Const) -> T, regF: (Reg) -> T): T = regF(this)
        override fun <T> matchRegOrMem(regF: (Reg) -> T, memF: (Mem) -> T): T = regF(this)

        override fun <T> match(constF: (Const) -> T, regF: (Reg) -> T, memF: (Mem) -> T): T =
            regF(this)

        override fun compareTo(other: Reg): Int = id.compareTo(other = other.id)
        override fun toString(): String = id
    }

    data class Mem(
        val baseReg: Reg?,
        val multipleOf: MultipleOf?,
        val displacement: Const?
    ) : RegOrMem {
        override fun <T> matchRegOrMem(regF: (Reg) -> T, memF: (Mem) -> T): T = memF(this)

        override fun <T> match(constF: (Const) -> T, regF: (Reg) -> T, memF: (Mem) -> T): T =
            memF(this)

        override fun toString(): String {
            val sb = StringBuilder()
            sb.append('[')
            val initialLength = sb.length
            if (baseReg != null) {
                sb.append(baseReg.id)
            }
            if (multipleOf != null) {
                if (sb.length > initialLength) {
                    sb.append('+')
                }
                sb.append(multipleOf.baseReg.id).append('*')
                val multiplier = when (multipleOf.multipliedConstant) {
                    MultipleOf.MultipliedConstant.ONE -> 1
                    MultipleOf.MultipliedConstant.TWO -> 2
                    MultipleOf.MultipliedConstant.FOUR -> 4
                    MultipleOf.MultipliedConstant.EIGHT -> 8
                }
                sb.append(multiplier)
            }
            if (displacement != null) {
                val value = displacement.value
                if (value == null) {
                    if (sb.length > initialLength) {
                        sb.append('+')
                    }
                    sb.append(displacement.name)
                } else {
                    if (value < 0) {
                        sb.append(value)
                    } else {
                        if (sb.length > initialLength) {
                            sb.append('+')
                        }
                        sb.append(value)
                    }
                }
            }
            sb.append(']')
            return sb.toString()
        }

        data class MultipleOf(val baseReg: Reg, val multipliedConstant: MultipliedConstant) {
            enum class MultipliedConstant(val constant: Long) {
                ONE(constant = 1), TWO(constant = 2), FOUR(constant = 4), EIGHT(constant = 8);
            }
        }
    }
}
