package samlang.compiler.asm.ralloc

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpMemDest
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpRegDest
import samlang.ast.asm.AssemblyInstruction.AlUnaryOp
import samlang.ast.asm.AssemblyInstruction.CallAddress
import samlang.ast.asm.AssemblyInstruction.CmpConstOrReg
import samlang.ast.asm.AssemblyInstruction.CmpMem
import samlang.ast.asm.AssemblyInstruction.Cqo
import samlang.ast.asm.AssemblyInstruction.IDiv
import samlang.ast.asm.AssemblyInstruction.IMulOneArg
import samlang.ast.asm.AssemblyInstruction.IMulThreeArgs
import samlang.ast.asm.AssemblyInstruction.IMulTwoArgs
import samlang.ast.asm.AssemblyInstruction.JumpAddress
import samlang.ast.asm.AssemblyInstruction.JumpLabel
import samlang.ast.asm.AssemblyInstruction.LoadEffectiveAddress
import samlang.ast.asm.AssemblyInstruction.MoveFromLong
import samlang.ast.asm.AssemblyInstruction.MoveToMem
import samlang.ast.asm.AssemblyInstruction.MoveToReg
import samlang.ast.asm.AssemblyInstruction.Pop
import samlang.ast.asm.AssemblyInstruction.Push
import samlang.ast.asm.AssemblyInstruction.SetOnFlag
import samlang.ast.asm.AssemblyInstruction.Shift
import samlang.ast.asm.AssemblyInstructionVisitor
import samlang.ast.asm.ConstOrReg
import samlang.ast.asm.RegOrMem

/**
 * The collector for registers in a program segment.
 */
internal object RegisterCollector {
    /**
     * @param abstractAssemblyInstruction the instructions to collect non-machine registers.
     * @param excludeMachineRegisters whether to exclude machine registers.
     * @return collected non-machine registers.
     */
    fun collect(
        abstractAssemblyInstruction: List<AssemblyInstruction>,
        excludeMachineRegisters: Boolean
    ): Set<String> {
        val visitor = RegisterCollectorVisitor(excludeMachineRegisters)
        for (instruction in abstractAssemblyInstruction) {
            instruction.accept(visitor)
        }
        return visitor.collector
    }

    private class RegisterCollectorVisitor(
        private val excludeMachineRegisters: Boolean
    ) : AssemblyInstructionVisitor {
        val collector: MutableSet<String> = hashSetOf()

        private fun f(arg: AssemblyArg) {
            arg.match(constF = { }, regF = { reg -> f(reg) }) { mem -> f(mem) }
        }

        private fun f(regOrMem: RegOrMem) {
            regOrMem.matchRegOrMem(regF = { reg -> f(reg) }) { mem -> f(mem) }
        }

        private fun f(constOrReg: ConstOrReg) {
            constOrReg.matchConstOrReg(constF = { }, regF = { reg -> f(reg) })
        }

        private fun f(reg: Reg) {
            val id = reg.id
            if (!excludeMachineRegisters ||
                    !RegisterAllocationConstants.PRE_COLORED_REGS.contains(id)) {
                collector.add(id)
            }
        }

        private fun f(mem: AssemblyArgs.Mem) {
            val baseReg = mem.baseReg
            baseReg?.let { f(it) }
            val multipleOf = mem.multipleOf
            if (multipleOf != null) {
                f(multipleOf.baseReg)
            }
        }

        override fun visit(node: MoveFromLong): Unit = f(node.dest)

        override fun visit(node: MoveToMem) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: MoveToReg) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: LoadEffectiveAddress) {
            f(node.dest)
            f(node.mem)
        }

        override fun visit(node: CmpConstOrReg) {
            f(node.minuend)
            f(node.subtrahend)
        }

        override fun visit(node: CmpMem) {
            f(node.minuend)
            f(node.subtrahend)
        }

        override fun visit(node: SetOnFlag): Unit = f(node.reg)
        override fun visit(node: JumpLabel): Unit = Unit
        override fun visit(node: JumpAddress): Unit = f(node.arg)
        override fun visit(node: CallAddress): Unit = f(node.address)
        override fun visit(node: AssemblyInstruction.Return): Unit = Unit

        override fun visit(node: AlBinaryOpMemDest) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: AlBinaryOpRegDest) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: IMulOneArg): Unit = f(node.arg)

        override fun visit(node: IMulTwoArgs) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: IMulThreeArgs) {
            f(node.dest)
            f(node.src)
        }

        override fun visit(node: Cqo): Unit = Unit
        override fun visit(node: IDiv): Unit = f(node.divisor)
        override fun visit(node: AlUnaryOp): Unit = f(node.dest)
        override fun visit(node: Shift): Unit = f(node.dest)
        override fun visit(node: Push): Unit = f(node.arg)
        override fun visit(node: Pop): Unit = f(node.arg)
        override fun visit(node: AssemblyInstruction.Label): Unit = Unit
        override fun visit(node: AssemblyInstruction.Comment): Unit = Unit
    }
}
