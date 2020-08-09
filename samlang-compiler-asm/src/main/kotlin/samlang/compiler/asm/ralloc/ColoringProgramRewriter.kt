package samlang.compiler.asm.ralloc

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.Mem
import samlang.ast.asm.AssemblyArgs.Mem.MultipleOf
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.*
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CALL
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.IDIV
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.NEG
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.asm.AssemblyInstruction.Companion.SHL
import samlang.ast.asm.AssemblyInstructionVisitor
import samlang.ast.asm.ConstOrReg
import samlang.ast.asm.RegOrMem

/**
 * The program rewriter after coloring is finished.
 *
 * @param colors all the coloring produced by the register allocator.
 * @param newSpilledVarMemMapping the new mapping for spilled var's memory location.
 * @param unusedCalleeSavedRegisters a set of unused callee saved registers as a reference.
 * @param oldInstructions a list of instructions to rewrite.
 */
internal class ColoringProgramRewriter(
    private val colors: Map<String, String>,
    private val newSpilledVarMemMapping: Map<Mem, Mem>,
    private val unusedCalleeSavedRegisters: Set<String>,
    oldInstructions: List<AssemblyInstruction>
) {
    /** The collector for new instructions. */
    private val newInstructions: MutableList<AssemblyInstruction> = mutableListOf()

    init {
        val visitor = Visitor()
        oldInstructions.forEach { it.accept(visitor) }
    }

    fun getNewInstructions(): List<AssemblyInstruction> = newInstructions

    private fun transform(reg: Reg): Reg {
        val mappedId = colors[reg.id]
        return mappedId?.let { Reg(it) } ?: reg
    }

    private fun transform(mem: Mem): Mem {
        val potentialNewMemMapping = newSpilledVarMemMapping[mem]
        if (potentialNewMemMapping != null) {
            return potentialNewMemMapping
        }
        var baseReg = mem.baseReg
        if (baseReg != null) {
            baseReg = transform(baseReg)
        }
        var multipleOf = mem.multipleOf
        if (multipleOf != null) {
            multipleOf = MultipleOf(transform(multipleOf.baseReg), multipleOf.multipliedConstant)
        }
        return Mem(baseReg, multipleOf, mem.displacement)
    }

    private fun transformRegOrMem(regOrMem: RegOrMem): RegOrMem =
            regOrMem.matchRegOrMem(regF = { transform(reg = it) }, memF = { transform(mem = it) })

    private fun transformConstOrReg(constOrReg: ConstOrReg): ConstOrReg =
            constOrReg.matchConstOrReg(constF = { it }, regF = { transform(reg = it) })

    private fun transformArg(arg: AssemblyArg): AssemblyArg =
            arg.match(constF = { it }, regF = { transform(reg = it) }, memF = { transform(mem = it) })

    private inner class Visitor : AssemblyInstructionVisitor {
        override fun visit(node: MoveFromLong) {
            newInstructions += MOVE(transform(node.dest), node.value)
        }

        override fun visit(node: MoveToMem) {
            val newSrc = transformConstOrReg(node.src)
            if (newSrc is Reg) {
                val id = newSrc.id
                if (unusedCalleeSavedRegisters.contains(id)) {
                    newInstructions += COMMENT(comment = "unnecessary 'mov [mem], $id' is optimized away.")
                    return
                }
            }
            val newDest = transform(node.dest)
            newInstructions += MOVE(newDest, newSrc)
        }

        override fun visit(node: MoveToReg) {
            val newDest = transform(node.dest)
            if (unusedCalleeSavedRegisters.contains(newDest.id)) {
                newInstructions += COMMENT(comment = "unnecessary 'mov ${newDest.id}, [mem]' is optimized away.")
                return
            }
            val newSource = transformArg(node.src)
            if (newDest == newSource) {
                // optimize away things like move x1, x1.
                val name = newDest.id
                newInstructions += COMMENT(comment = "'mov $name, $name' is optimized away.")
            } else {
                newInstructions += MOVE(newDest, newSource)
            }
        }

        override fun visit(node: LoadEffectiveAddress) {
            newInstructions += LEA(transform(node.dest), transform(node.mem))
        }

        override fun visit(node: CmpConstOrReg) {
            newInstructions += CMP(transformRegOrMem(regOrMem = node.minuend), transformConstOrReg(node.subtrahend))
        }

        override fun visit(node: CmpMem) {
            newInstructions += CMP(transform(node.minuend), transform(node.subtrahend))
        }

        override fun visit(node: SetOnFlag) {
            if (!RegisterAllocationConstants.PRE_COLORED_REGS.contains(node.reg.id)) {
                throw Error()
            }
            newInstructions += node
        }

        override fun visit(node: CallAddress) {
            newInstructions += CALL(transformArg(node.address))
        }

        override fun visit(node: AlBinaryOpMemDest) {
            newInstructions += BIN_OP(node.type, transform(node.dest), transformConstOrReg(node.src))
        }

        override fun visit(node: AlBinaryOpRegDest) {
            newInstructions += BIN_OP(node.type, transform(node.dest), transformArg(node.src))
        }

        override fun visit(node: IMulTwoArgs) {
            newInstructions += IMUL(transform(node.dest), transformRegOrMem(node.src))
        }

        override fun visit(node: IMulThreeArgs) {
            newInstructions += IMUL(dest = transform(node.dest), src = transformRegOrMem(node.src), immediate = node.immediate)
        }

        override fun visit(node: IDiv) { newInstructions += IDIV(transformRegOrMem(node.divisor)) }

        override fun visit(node: Neg) { newInstructions += NEG(transformRegOrMem(node.dest)) }

        override fun visit(node: ShiftLeft) { newInstructions += SHL(transformRegOrMem(node.dest), node.count) }

        override fun visit(node: Push) { newInstructions += PUSH(transformArg(node.arg)) }

        override fun visit(node: JumpLabel) { newInstructions += node }
        override fun visit(node: Return) { newInstructions += node }
        override fun visit(node: Cqo) { newInstructions += node }
        override fun visit(node: PopRBP) { newInstructions += node }
        override fun visit(node: Label) { newInstructions += node }
        override fun visit(node: Comment) { newInstructions += node }
    }
}
