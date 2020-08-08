package samlang.compiler.asm.ralloc

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.Mem
import samlang.ast.asm.AssemblyArgs.Mem.MultipleOf
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.*
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CALL
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.IDIV
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.NEG
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.asm.AssemblyInstruction.Companion.SHL
import samlang.ast.asm.AssemblyInstructionVisitor
import samlang.ast.asm.ConstOrReg
import samlang.compiler.asm.FunctionAbstractRegisterAllocator
import samlang.ast.asm.RegOrMem

/**
 * The program rewriter after spilling temporaries into stack.
 *
 * @param allocator the function context to aid program rewriting.
 * @param oldInstructions old instructions to be rewritten.
 * @param spilledVars the spilled vars to put onto the stack.
 * @param numberOfSpilledVarsSoFar number of spilled vars so far, before spilling the new ones.
 */
internal class SpillingProgramRewriter(
    private val allocator: FunctionAbstractRegisterAllocator,
    oldInstructions: List<AssemblyInstruction>,
    spilledVars: Set<String>,
    numberOfSpilledVarsSoFar: Int
) {
    /** The generated mappings for spilled vars. */
    private val spilledVarMappings: MutableMap<String, Mem> = mutableMapOf()
    /** The collector of new temps. */
    private val newTemps: MutableList<String> = mutableListOf()
    /** The collector for new instructions. */
    private val newInstructions: MutableList<AssemblyInstruction> = mutableListOf()

    init {
        var memId = 1 + numberOfSpilledVarsSoFar
        for (abstractRegId in spilledVars) {
            val mem = MEM(RBP, CONST(value = -memId * 8))
            memId++
            spilledVarMappings[abstractRegId] = mem
        }
        val visitor = ProgramRewriterVisitor()
        for (oldInstruction in oldInstructions) {
            oldInstruction.accept(visitor)
        }
    }

    /** @return the mappings of spilled vars. */
    fun getSpilledVarMappings(): Map<String, Mem> = spilledVarMappings

    /** @return generated new temps. */
    fun getNewTemps(): List<String> = newTemps

    /** @return generated new instructions. */
    fun getNewInstructions(): List<AssemblyInstruction> = newInstructions

    private fun getExpectedRegOrMem(reg: Reg): RegOrMem = spilledVarMappings[reg.id] ?: reg

    private fun nextReg(): Reg {
        val tempReg = allocator.nextReg()
        newTemps += tempReg.id
        return tempReg
    }

    private fun transformReg(reg: Reg): Reg =
        getExpectedRegOrMem(reg).matchRegOrMem(
            regF = { it },
            memF = { mem ->
                val tempReg = nextReg()
                newInstructions += MOVE(tempReg, mem)
                tempReg
            }
        )

    private fun transformMem(mem: Mem): Mem {
        var baseReg = mem.baseReg
        if (baseReg != null) {
            baseReg = transformReg(baseReg)
        }
        var multipleOf = mem.multipleOf
        if (multipleOf != null) {
            val multipleOfBaseReg = transformReg(multipleOf.baseReg)
            multipleOf = MultipleOf(multipleOfBaseReg, multipleOf.multipliedConstant)
        }
        return Mem(baseReg = baseReg, multipleOf = multipleOf, displacement = mem.displacement)
    }

    private fun transformRegOrMem(regOrMem: RegOrMem): RegOrMem =
        regOrMem.matchRegOrMem(
            regF = { reg -> getExpectedRegOrMem(reg) },
            memF = { mem -> transformMem(mem) }
        )

    private fun transformConstOrReg(constOrReg: ConstOrReg): ConstOrReg =
        constOrReg.matchConstOrReg(
            constF = { it },
            regF = { reg -> transformReg(reg) }
        )

    private fun transformArg(arg: AssemblyArg): AssemblyArg =
        arg.match(
            constF = { it },
            regF = { reg -> getExpectedRegOrMem(reg) },
            memF = { mem -> transformMem(mem) }
        )

    private fun transformRegDest(dest: Reg, instructionAdder: (Reg) -> Unit) {
        getExpectedRegOrMem(dest).matchRegOrMem(
            regF = { regDest: Reg -> instructionAdder(regDest) },
            memF = { memDest: Mem ->
                val tempReg = nextReg()
                instructionAdder(tempReg)
                newInstructions += MOVE(memDest, tempReg)
            }
        )
    }

    private inner class ProgramRewriterVisitor : AssemblyInstructionVisitor {
        override fun visit(node: MoveFromLong) {
            transformRegDest(dest = node.dest) { dest -> newInstructions += MOVE(dest, node.value) }
        }

        override fun visit(node: MoveToMem) {
            newInstructions += MOVE(transformMem(node.dest), transformConstOrReg(node.src))
        }

        override fun visit(node: MoveToReg) {
            val transformedSrc = transformArg(node.src)
            val expectedDest = getExpectedRegOrMem(node.dest)
            expectedDest.matchRegOrMem(
                regF = { regDest -> newInstructions += MOVE(regDest, transformedSrc) },
                memF = { memDest: Mem ->
                    transformedSrc.matchConstOrRegVsMem(
                        constOrRegF = { constOrRegSrc ->
                            newInstructions += MOVE(memDest, constOrRegSrc)
                        },
                        memF = { memSrc ->
                            val tempReg = nextReg()
                            newInstructions += MOVE(tempReg, memSrc)
                            newInstructions += MOVE(memDest, tempReg)
                        }
                    )
                }
            )
        }

        override fun visit(node: LoadEffectiveAddress) {
            transformRegDest(dest = node.dest) { dest ->
                newInstructions.add(LEA(dest, transformMem(node.mem)))
            }
        }

        override fun visit(node: CmpConstOrReg) {
            newInstructions += CMP(
                minuend = transformRegOrMem(regOrMem = node.minuend),
                subtrahend = transformConstOrReg(constOrReg = node.subtrahend)
            )
        }

        override fun visit(node: CmpMem) {
            newInstructions += CMP(
                minuend = transformReg(reg = node.minuend),
                subtrahend = transformMem(mem = node.subtrahend)
            )
        }

        override fun visit(node: SetOnFlag) {
            if (!RegisterAllocationConstants.PRE_COLORED_REGS.contains(node.reg.id)) {
                throw Error()
            }
            newInstructions += node
        }

        override fun visit(node: JumpLabel) {
            newInstructions += node
        }

        override fun visit(node: CallAddress) {
            newInstructions += CALL(transformArg(node.address))
        }

        override fun visit(node: Return) {
            newInstructions += node
        }

        override fun visit(node: AlBinaryOpMemDest) {
            newInstructions += BIN_OP(
                type = node.type,
                dest = transformMem(node.dest),
                src = transformConstOrReg(node.src)
            )
        }

        override fun visit(node: AlBinaryOpRegDest) {
            val transformedSrc = transformArg(node.src)
            val expectedDest = getExpectedRegOrMem(node.dest)
            val type = node.type
            expectedDest.matchRegOrMem(
                regF = { regDest -> newInstructions += BIN_OP(type, regDest, transformedSrc) },
                memF = { memDest ->
                    transformedSrc.matchConstOrRegVsMem(
                        constOrRegF = { constOrRegSrc ->
                            newInstructions += BIN_OP(type, memDest, constOrRegSrc)
                        },
                        memF = { memSrc ->
                            val tempReg = nextReg()
                            newInstructions += MOVE(tempReg, memDest)
                            newInstructions += BIN_OP(type, tempReg, memSrc)
                            newInstructions += MOVE(memDest, tempReg)
                        }
                    )
                }
            )
        }

        override fun visit(node: IMulTwoArgs) {
            val transformedSrc = transformRegOrMem(node.src)
            val expectedDest = getExpectedRegOrMem(node.dest)
            expectedDest.matchRegOrMem<Any?>(
                { regDest: Reg? ->
                    newInstructions.add(IMUL(regDest!!, transformedSrc))
                    null
                }
            ) { memDest: Mem? ->
                val tempReg = nextReg()
                newInstructions.add(MOVE(tempReg, memDest!!))
                newInstructions.add(IMUL(tempReg, transformedSrc))
                newInstructions.add(MOVE(memDest, tempReg))
                null
            }
        }

        override fun visit(node: IMulThreeArgs) {
            transformRegDest(dest = node.dest) { dest ->
                newInstructions += IMUL(dest, transformRegOrMem(node.src), node.immediate)
            }
        }

        override fun visit(node: Cqo) {
            newInstructions += node
        }

        override fun visit(node: IDiv) {
            newInstructions += IDIV(transformRegOrMem(node.divisor))
        }

        override fun visit(node: Neg) {
            node.dest.matchRegOrMem(
                regF = { regDest -> newInstructions += NEG(getExpectedRegOrMem(regDest)) },
                memF = { memDest -> newInstructions += NEG(transformMem(memDest)) }
            )
        }

        override fun visit(node: ShiftLeft) {
            val count = node.count
            node.dest.matchRegOrMem(
                regF = { regDest -> newInstructions += SHL(getExpectedRegOrMem(regDest), count) },
                memF = { memDest -> newInstructions += SHL(transformMem(memDest), count) }
            )
        }

        override fun visit(node: Push) {
            newInstructions += PUSH(transformArg(node.arg))
        }

        override fun visit(node: PopRBP) {
            newInstructions += PopRBP
        }

        override fun visit(node: Label) {
            newInstructions += node
        }

        override fun visit(node: Comment) {
            newInstructions += node
        }
    }
}
