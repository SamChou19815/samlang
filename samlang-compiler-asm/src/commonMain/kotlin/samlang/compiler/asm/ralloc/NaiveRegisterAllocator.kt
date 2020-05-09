package samlang.compiler.asm.ralloc

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.Mem
import samlang.ast.asm.AssemblyArgs.Mem.MultipleOf
import samlang.ast.asm.AssemblyArgs.R10
import samlang.ast.asm.AssemblyArgs.R11
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpMemDest
import samlang.ast.asm.AssemblyInstruction.AlBinaryOpRegDest
import samlang.ast.asm.AssemblyInstruction.AlUnaryOp
import samlang.ast.asm.AssemblyInstruction.CallAddress
import samlang.ast.asm.AssemblyInstruction.CmpConstOrReg
import samlang.ast.asm.AssemblyInstruction.CmpMem
import samlang.ast.asm.AssemblyInstruction.Companion.BIN_OP
import samlang.ast.asm.AssemblyInstruction.Companion.CALL
import samlang.ast.asm.AssemblyInstruction.Companion.CMP
import samlang.ast.asm.AssemblyInstruction.Companion.IDIV
import samlang.ast.asm.AssemblyInstruction.Companion.IMUL
import samlang.ast.asm.AssemblyInstruction.Companion.JUMP
import samlang.ast.asm.AssemblyInstruction.Companion.LEA
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE
import samlang.ast.asm.AssemblyInstruction.Companion.POP
import samlang.ast.asm.AssemblyInstruction.Companion.PUSH
import samlang.ast.asm.AssemblyInstruction.Companion.SET
import samlang.ast.asm.AssemblyInstruction.Companion.SHIFT
import samlang.ast.asm.AssemblyInstruction.Companion.UN_OP
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
 * The class that transforms abstract assembly into real assembly.
 *
 * @param abstractInstructions all the instructions.
 */
class NaiveRegisterAllocator(
    abstractInstructions: List<AssemblyInstruction>
) {
    /** The register mapping. */
    private val mapping: MutableMap<String, Mem> = mutableMapOf()
    /** Number of temporaries to put on the stack. */
    val numberOfTemporariesOnStack: Int
    /** The collector of real instructions.*/
    private val realInstructions: MutableList<AssemblyInstruction> = mutableListOf()

    init {
        val nonMachineRegisters = RegisterCollector.collect(
                abstractAssemblyInstruction = abstractInstructions,
                excludeMachineRegisters = true
        )
        var memId = 1
        for (abstractRegId in nonMachineRegisters) {
            val mem = MEM(RBP, CONST(-memId * 8))
            memId++
            mapping[abstractRegId] = mem
        }
        val visitor = InstructionTransformerVisitor()
        for (instruction in abstractInstructions) {
            instruction.accept(visitor)
        }
        numberOfTemporariesOnStack = memId - 1
    }

    /** @return the transformed real runnable assembly instructions. */
    fun getRealInstructions(): List<AssemblyInstruction> = realInstructions

    private fun transform(reg: Reg): RegOrMem = mapping[reg.id] ?: reg

    private fun transformRegToRegForLocalUse(reg: Reg, tempReg: Reg): Reg =
            transform(reg).matchRegOrMem(
                    regF = { it },
                    memF = { mem ->
                        realInstructions += MOVE(tempReg, mem)
                        tempReg
                    }
            )

    private fun transform(mem: Mem, tempReg1: Reg, tempReg2: Reg): Mem {
        var baseReg = mem.baseReg
        if (baseReg != null) {
            baseReg = transformRegToRegForLocalUse(baseReg, tempReg1)
        }
        var multipleOf = mem.multipleOf
        if (multipleOf != null) {
            val multipleOfBaseReg = transformRegToRegForLocalUse(multipleOf.baseReg, tempReg2)
            multipleOf = MultipleOf(multipleOfBaseReg, multipleOf.multipliedConstant)
        }
        return Mem(baseReg, multipleOf, mem.displacement)
    }

    private fun transformRegOrMem(regOrMem: RegOrMem, tempReg1: Reg, tempReg2: Reg): RegOrMem =
            regOrMem.matchRegOrMem(
                    regF = { transform(reg = it) },
                    memF = { transform(mem = it, tempReg1 = tempReg1, tempReg2 = tempReg2) }
            )

    private fun transformConstOrRegForLocalUse(constOrReg: ConstOrReg, tempReg: Reg): ConstOrReg =
            constOrReg.matchConstOrReg(
                    constF = { it },
                    regF = { transformRegToRegForLocalUse(reg = it, tempReg = tempReg) }
            )

    private fun transformAssemblyArg(arg: AssemblyArg, tempReg1: Reg, tempReg2: Reg): AssemblyArg =
            arg.match(
                    constF = { it },
                    regF = { transform(it) },
                    memF = { mem -> transform(mem, tempReg1, tempReg2) }
            )

    private inner class InstructionTransformerVisitor : AssemblyInstructionVisitor {
        override fun visit(node: MoveFromLong) {
            val transformedDest = transform(node.dest)
            val value = node.value
            transformedDest.matchRegOrMem(
                    regF = { regDest -> realInstructions += MOVE(regDest, value) },
                    memF = { memDest ->
                        realInstructions += MOVE(R9, value)
                        realInstructions += MOVE(memDest, R9)
                    }
            )
        }

        override fun visit(node: MoveToMem) {
            realInstructions += MOVE(
                    dest = transform(node.dest, R9, R10),
                    src = transformConstOrRegForLocalUse(node.src, R11)
            )
        }

        override fun visit(node: MoveToReg) {
            val transformedDest = transform(node.dest)
            transformedDest.matchRegOrMem(
                    regF = { regDest ->
                        realInstructions += MOVE(regDest, transformAssemblyArg(node.src, R10, R11))
                    },
                    memF = { memDest ->
                        val src = transformAssemblyArg(node.src, R9, R10)
                        if (src is Mem) {
                            realInstructions += MOVE(R11, src)
                            realInstructions += MOVE(memDest, R11)
                        } else {
                            realInstructions += MOVE(memDest, src as ConstOrReg)
                        }
                    }
            )
        }

        override fun visit(node: LoadEffectiveAddress) {
            val transformedDest = transform(node.dest)
            val transformedSrc = transform(node.mem, R9, R10)
            transformedDest.matchRegOrMem(
                    regF = { regDest -> realInstructions += LEA(regDest, transformedSrc) },
                    memF = { memDest ->
                        realInstructions += LEA(R11, transformedSrc)
                        realInstructions += MOVE(memDest, R11)
                    }
            )
        }

        override fun visit(node: CmpConstOrReg) {
            realInstructions += CMP(
                    minuend = transformRegOrMem(node.minuend, R9, R10),
                    subtrahend = transformConstOrRegForLocalUse(node.subtrahend, R11)
            )
        }

        override fun visit(node: CmpMem) {
            realInstructions += CMP(
                    minuend = transformRegToRegForLocalUse(node.minuend, R9),
                    subtrahend = transform(node.subtrahend, R10, R11)
            )
        }

        override fun visit(node: SetOnFlag) {
            val transformedRegOrMemToSet = transform(node.reg)
            transformedRegOrMemToSet.matchRegOrMem<Any?>({ reg: Reg? ->
                realInstructions.add(SET(node.type, reg!!))
                null
            }) { mem: Mem ->
                realInstructions.add(SET(node.type, R9))
                realInstructions.add(MOVE(mem, R9))
                null
            }
        }

        override fun visit(node: JumpLabel) {
            realInstructions += node
        }

        override fun visit(node: JumpAddress) {
            realInstructions += JUMP(node.type, transformAssemblyArg(node.arg, R9, R10))
        }

        override fun visit(node: CallAddress) {
            realInstructions += CALL(transformAssemblyArg(node.address, R9, R10))
        }

        override fun visit(node: AssemblyInstruction.Return) {
            realInstructions += node
        }

        override fun visit(node: AlBinaryOpMemDest) {
            realInstructions += BIN_OP(
                    type = node.type,
                    dest = transform(node.dest, R9, R10),
                    src = transformConstOrRegForLocalUse(node.src, R11)
            )
        }

        override fun visit(node: AlBinaryOpRegDest) {
            val transformedDest = transform(node.dest)
            val transformedSrc = transformAssemblyArg(node.src, R9, R10)
            transformedDest.matchRegOrMem(
                    regF = { regDest ->
                        realInstructions += BIN_OP(node.type, regDest, transformedSrc)
                    },
                    memF = { memDest ->
                        if (transformedSrc is Mem) {
                            realInstructions += MOVE(R11, transformedSrc)
                            realInstructions += BIN_OP(node.type, memDest, R11)
                        } else {
                            realInstructions += BIN_OP(
                                    type = node.type,
                                    dest = memDest,
                                    src = transformedSrc as ConstOrReg
                            )
                        }
                    }
            )
        }

        override fun visit(node: IMulOneArg) {
            realInstructions += IMUL(transformRegOrMem(node.arg, R10, R11))
        }

        override fun visit(node: IMulTwoArgs) {
            val transformedDest = transform(node.dest)
            val transformedSrc = transformRegOrMem(node.src, R9, R10)
            transformedDest.matchRegOrMem(
                    regF = { regDest -> realInstructions += IMUL(regDest, transformedSrc) },
                    memF = { memDest ->
                        realInstructions += MOVE(R11, memDest)
                        realInstructions += IMUL(R11, transformedSrc)
                        realInstructions += MOVE(memDest, R11)
                    }
            )
        }

        override fun visit(node: IMulThreeArgs) {
            val transformedDest = transform(node.dest)
            val transformedSrc = transformRegOrMem(node.src, R9, R10)
            val immediate = node.immediate
            transformedDest.matchRegOrMem(
                    regF = { regDest ->
                        realInstructions += IMUL(regDest, transformedSrc, immediate)
                    },
                    memF = { memDest ->
                        realInstructions += MOVE(R11, memDest)
                        realInstructions += IMUL(R11, transformedSrc, immediate)
                        realInstructions += MOVE(memDest, R11)
                    }
            )
        }

        override fun visit(node: Cqo) {
            realInstructions += node
        }

        override fun visit(node: IDiv) {
            realInstructions += IDIV(transformRegOrMem(node.divisor, R10, R11))
        }

        override fun visit(node: AlUnaryOp) {
            realInstructions += UN_OP(node.type, transformRegOrMem(node.dest, R9, R10))
        }

        override fun visit(node: Shift) {
            realInstructions += SHIFT(
                    type = node.type,
                    dest = transformRegOrMem(node.dest, R9, R10),
                    count = node.count
            )
        }

        override fun visit(node: Push) {
            realInstructions += PUSH(transformAssemblyArg(node.arg, R9, R10))
        }

        override fun visit(node: Pop) {
            realInstructions += POP(transformRegOrMem(node.arg, R9, R10))
        }

        override fun visit(node: AssemblyInstruction.Label) {
            realInstructions += node
        }

        override fun visit(node: AssemblyInstruction.Comment) {
            realInstructions += node
        }
    }
}
