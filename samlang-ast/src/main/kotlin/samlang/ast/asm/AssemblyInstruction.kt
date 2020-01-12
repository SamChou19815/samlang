package samlang.ast.asm

import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.Const
import samlang.ast.asm.AssemblyArgs.Mem
import samlang.ast.asm.AssemblyArgs.Reg

sealed class AssemblyInstruction {
    abstract fun accept(visitor: AssemblyInstructionVisitor)

    @Suppress(names = ["FunctionName"])
    companion object {
        /*
         * --------------------------------------------------------------------------------
         * Section 0: Factory Functions
         * --------------------------------------------------------------------------------
         */

        // / 1 - data transfer

        @JvmStatic
        fun MOVE(dest: Reg, value: Long): AssemblyInstruction {
            return try {
                val intValue = Math.toIntExact(value)
                MoveToReg(dest, CONST(value = intValue))
            } catch (e: ArithmeticException) {
                MoveFromLong(dest, value)
            }
        }

        @JvmStatic
        fun MOVE(dest: Mem, src: ConstOrReg): MoveToMem = MoveToMem(dest = dest, src = src)

        @JvmStatic
        fun MOVE(dest: Reg, src: AssemblyArg): MoveToReg = MoveToReg(dest = dest, src = src)

        @JvmStatic
        fun LEA(dest: Reg, src: Mem): LoadEffectiveAddress =
            LoadEffectiveAddress(dest = dest, mem = src)

        // / 2 - control flow

        @JvmStatic
        fun CMP(minuend: RegOrMem, subtrahend: ConstOrReg): CmpConstOrReg =
            CmpConstOrReg(minuend = minuend, subtrahend = subtrahend)

        @JvmStatic
        fun CMP(minuend: Reg, subtrahend: Mem): CmpMem =
            CmpMem(minuend = minuend, subtrahend = subtrahend)

        @JvmStatic
        fun SET(type: JumpType, reg: Reg): SetOnFlag = SetOnFlag(type = type, reg = reg)

        @JvmStatic
        fun JUMP(type: JumpType, label: String): JumpLabel = JumpLabel(type = type, label = label)

        @JvmStatic
        fun JUMP(type: JumpType, arg: AssemblyArg): JumpAddress =
            JumpAddress(type = type, arg = arg)

        @JvmStatic
        fun CALL(address: AssemblyArg): CallAddress = CallAddress(address = address)

        @JvmStatic
        fun RET(): Return = Return

        // / 3 - arithmetic
        @JvmStatic
        fun BIN_OP(type: AlBinaryOpType, dest: Mem, src: ConstOrReg): AlBinaryOpMemDest =
            AlBinaryOpMemDest(type = type, dest = dest, src = src)

        @JvmStatic
        fun BIN_OP(type: AlBinaryOpType, dest: Reg, src: AssemblyArg): AlBinaryOpRegDest =
            AlBinaryOpRegDest(type = type, dest = dest, src = src)

        @JvmStatic
        fun IMUL(arg: RegOrMem): IMulOneArg = IMulOneArg(arg = arg)

        @JvmStatic
        fun IMUL(dest: Reg, src: RegOrMem): IMulTwoArgs = IMulTwoArgs(dest = dest, src = src)

        @JvmStatic
        fun IMUL(dest: Reg, src: RegOrMem, immediate: Const): IMulThreeArgs =
            IMulThreeArgs(dest = dest, src = src, immediate = immediate)

        @JvmStatic
        fun CQO(): Cqo = Cqo

        @JvmStatic
        fun IDIV(arg: RegOrMem): IDiv = IDiv(divisor = arg)

        @JvmStatic
        fun UN_OP(type: AlUnaryOpType, arg: RegOrMem): AlUnaryOp =
            AlUnaryOp(type = type, dest = arg)

        @JvmStatic
        fun SHIFT(type: ShiftType, dest: RegOrMem, count: Int): Shift =
            Shift(type = type, dest = dest, count = count)

        // / 4 - other

        @JvmStatic
        fun PUSH(arg: AssemblyArg): Push = Push(arg = arg)

        @JvmStatic
        fun POP(regOrMem: RegOrMem): Pop = Pop(arg = regOrMem)

        @JvmStatic
        fun LABEL(label: String): Label = Label(label = label)

        @JvmStatic
        fun COMMENT(comment: Any): Comment = Comment(comment = comment.toString())

        private fun argToString(arg: AssemblyArg): String =
            arg.match({ it.toString() }, { it.toString() }) { mem -> "qword ptr $mem" }
    }

    /*
     * --------------------------------------------------------------------------------
     * Section 1: Data Transfer Instructions
     * Link: https://en.wikibooks.org/wiki/X86_Assembly/Data_Transfer
     * --------------------------------------------------------------------------------
     */

    /** mov instruction. */
    data class MoveFromLong(val dest: Reg, val value: Long) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "movabs ${argToString(dest)}, $value"
    }

    /** mov instruction. */
    data class MoveToMem(val dest: Mem, val src: ConstOrReg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "mov ${argToString(dest)}, ${argToString(src)}"
    }

    /** mov instruction. */
    data class MoveToReg(val dest: Reg, val src: AssemblyArg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "mov ${argToString(dest)}, ${argToString(src)}"
    }

    /**
     * The lea instruction calculates the address of the src operand and
     * loads it into the dest operand.
     */
    data class LoadEffectiveAddress(val dest: Reg, val mem: Mem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "lea ${argToString(dest)}, ${argToString(mem)}"
    }

    /*
     * --------------------------------------------------------------------------------
     * Section 2: Control Flow Instructions
     * Link: https://en.wikibooks.org/wiki/X86_Assembly/Control_Flow
     * --------------------------------------------------------------------------------
     */

    /** cmp instruction. */
    data class CmpConstOrReg(
        val minuend: RegOrMem,
        val subtrahend: ConstOrReg
    ) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "cmp ${argToString(minuend)}, ${argToString(subtrahend)}"
    }

    /** cmp instruction  */
    data class CmpMem(val minuend: Reg, val subtrahend: Mem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "cmp ${argToString(minuend)}, ${argToString(subtrahend)}"
    }

    /** All supported jump instruction types. */
    enum class JumpType(val displayName: String) {
        JMP(displayName = "jmp"), JE(displayName = "je"), JNE(displayName = "jne"),
        JG(displayName = "jg"), JGE(displayName = "jge"), JL(displayName = "jl"),
        JLE(displayName = "jle"), JZ(displayName = "jz"), JNZ(displayName = "jnz");
    }

    /**
     * A pseudo-instruction invented by Sam.
     * It will turned into
     * setcc (change end based on type) [1-byte form of reg]
     * movez reg [1-byte form of reg]
     * when it's turned into actual assembly.
     */
    data class SetOnFlag(val type: JumpType, val reg: Reg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String {
            val setType = when (type) {
                JumpType.JMP -> throw Error("Impossible!")
                JumpType.JE -> "sete"
                JumpType.JNE -> "setne"
                JumpType.JG -> "setg"
                JumpType.JGE -> "setge"
                JumpType.JL -> "setl"
                JumpType.JLE -> "setle"
                JumpType.JZ -> "setz"
                JumpType.JNZ -> "setnz"
            }
            val reg1Byte = when (reg.id) {
                "rax" -> "al"
                "rbx" -> "bl"
                "rcx" -> "cl"
                "rdx" -> "dl"
                "rsi" -> "sil"
                "rdi" -> "dil"
                "rsp" -> "spl"
                "rbp" -> "bpl"
                "r8" -> "r8b"
                "r9" -> "r9b"
                "r10" -> "r10b"
                "r11" -> "r11b"
                "r12" -> "r12b"
                "r13" -> "r13b"
                "r14" -> "r14b"
                "r15" -> "r15b"
                else -> error(message = "Impossible Register Value")
            }
            return "$setType $reg1Byte\nmovzx ${argToString(reg)}, $reg1Byte"
        }
    }

    /** jmp instruction. */
    data class JumpLabel(val type: JumpType, val label: String) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} $label"
    }

    /** jmp instruction. */
    data class JumpAddress(val type: JumpType, val arg: AssemblyArg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} ${argToString(arg)}"
    }

    /** call instruction. */
    data class CallAddress(val address: AssemblyArg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "call ${argToString(address)}"
    }

    /** ret instruction. */
    object Return : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "ret"
    }

    // we do not need other CPU control instructions.

    /*
     * --------------------------------------------------------------------------------
     * Section 3: Arithmetic & Logic Instructions
     * Links:
     * https://en.wikibooks.org/wiki/X86_Assembly/Arithmetic
     * https://en.wikibooks.org/wiki/X86_Assembly/Logic
     * Link: https://en.wikibooks.org/wiki/X86_Assembly/Shift_and_Rotate
     * https://www.tutorialspoint.com/assembly_programming/assembly_arithmetic_instructions.htm
     * --------------------------------------------------------------------------------
     * Many instructions that have the same format have been merged into one AST node
     * for simplicity and uniformity. The name usually starts with "Al", with stands
     * for "arithmetic and logical".
     * --------------------------------------------------------------------------------
     */

    /**
     * Type of an AL instruction with dest and src as args.
     */
    enum class AlBinaryOpType(val displayName: String) {
        ADD(displayName = "add"), SUB(displayName = "sub"),
        AND(displayName = "and"), OR(displayName = "or"), XOR(displayName = "xor");
    }

    /** binop instruction, see types above. */
    class AlBinaryOpMemDest(
        val type: AlBinaryOpType,
        val dest: Mem,
        val src: ConstOrReg
    ) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} ${argToString(dest)}, ${argToString(src)}"
    }

    /** binop instruction, see types above. */
    data class AlBinaryOpRegDest(
        val type: AlBinaryOpType,
        val dest: Reg,
        val src: AssemblyArg
    ) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} ${argToString(dest)}, ${argToString(src)}"
    }

    /** imul instruction */
    data class IMulOneArg(val arg: RegOrMem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "imul ${argToString(arg)}"
    }

    /** imul instruction */
    data class IMulTwoArgs(val dest: Reg, val src: RegOrMem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "imul ${argToString(dest)}, ${argToString(src)}"
    }

    /** imul instruction */
    data class IMulThreeArgs(
        val dest: Reg,
        val src: RegOrMem,
        val immediate: Const
    ) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "imul ${argToString(dest)}, ${argToString(src)}, ${argToString(immediate)}"
    }

    /** cqo instruction. */
    object Cqo : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "cqo"
    }

    /** idiv instruction. */
    data class IDiv(val divisor: RegOrMem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "idiv ${argToString(divisor)}"
    }

    /** Type of an AL instruction with only dest as args and does not have any implicit args. */
    enum class AlUnaryOpType(val displayName: String) {
        NEG(displayName = "neg"), INC(displayName = "inc"), DEC(displayName = "dec");
    }

    /** unop instruction, see types above. */
    data class AlUnaryOp(val type: AlUnaryOpType, val dest: RegOrMem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} ${argToString(dest)}"
    }

    /**
     * All supported shifting types.
     */
    enum class ShiftType(val displayName: String) {
        SHL(displayName = "shl"),
        SHR(displayName = "shr"),
        SAL(displayName = "sal"),
        SAR(displayName = "sar")
    }

    /** shift instruction. */
    data class Shift(
        val type: ShiftType,
        val dest: RegOrMem,
        val count: Int
    ) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "${type.displayName} ${argToString(dest)}, $count"
    }

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
    data class Push(val arg: AssemblyArg) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "push ${argToString(arg)}"
    }

    /**
     * pop instruction.
     * This instruction loads the data stored in the location pointed to by the stack pointer
     * into the argument specified and then increments the stack pointer
     */
    data class Pop(val arg: RegOrMem) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "pop ${argToString(arg)}"
    }

    // other system control instructions are not useful to us.

    data class Label(val label: String) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "$label:"
    }

    data class Comment(val comment: String) : AssemblyInstruction() {
        override fun accept(visitor: AssemblyInstructionVisitor): Unit = visitor.visit(node = this)
        override fun toString(): String = "## $comment"
    }
}
