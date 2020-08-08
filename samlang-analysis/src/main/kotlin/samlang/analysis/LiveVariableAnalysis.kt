package samlang.analysis

import samlang.analysis.ControlFlowGraph.Companion.fromAsm
import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.R10
import samlang.ast.asm.AssemblyArgs.R11
import samlang.ast.asm.AssemblyArgs.R8
import samlang.ast.asm.AssemblyArgs.R9
import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RCX
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.*
import samlang.ast.asm.AssemblyInstructionVisitor

@ExperimentalStdlibApi
class LiveVariableAnalysis(
    private val hasReturn: Boolean,
    instructions: List<AssemblyInstruction>
) {
    /** The mapping from a node id to different variable sets. */
    val defs: Array<MutableSet<String>>
    /** The mapping from instruction id to a set of uses. */
    val uses: Array<MutableSet<String>>
    /** The mapping from instruction id to a set of live variables out a node. */
    val liveVariablesOut: Array<MutableSet<String>>

    init {
        val graph = fromAsm(instructions)
        val findDefUseVisitor = FindDefUseVisitor()
        // setup defs, uses, empty in and out
        val len = instructions.size
        defs = Array(size = len) { mutableSetOf<String>() }
        uses = Array(size = len) { mutableSetOf<String>() }
        val inSet: Array<MutableSet<String>> = Array(size = len) { mutableSetOf<String>() }
        liveVariablesOut = Array(size = len) { mutableSetOf<String>() }
        for (i in 0 until len) {
            val instruction = instructions[i]
            findDefUseVisitor.id = i
            instruction.accept(findDefUseVisitor)
        }
        if (len > 0) {
            // last instruction is the epilogue label. It can be seen as the exit node.
            val useSetOfLastInstruction = uses[len - 1]
            // we also want to use rax and rdx if they are return values.
            if (hasReturn) {
                useSetOfLastInstruction.add(RAX.id)
            }
        }
        // run data flow analysis
        computeInOutSets(graph, defs, uses, inSet, liveVariablesOut)
    }

    private inner class FindDefUseVisitor : AssemblyInstructionVisitor {
        var id: Int = 0

        private fun findDef(reg: Reg) {
            defs[id].add(reg.id)
        }

        private fun findUseForReg(reg: Reg) {
            val regId = reg.id
            uses[id].add(regId)
        }

        private fun findUseForMem(mem: AssemblyArgs.Mem) {
            val baseReg = mem.baseReg
            baseReg?.let { findUseForReg(it) }
            val multipleOf = mem.multipleOf
            if (multipleOf != null) {
                findUseForReg(multipleOf.baseReg)
            }
        }

        private fun findUse(arg: AssemblyArg) {
            arg.match(constF = { }, regF = { findUseForReg(it) }, memF = { findUseForMem(it) })
        }

        override fun visit(node: MoveFromLong) {
            node.dest.matchRegOrMem(
                regF = { reg -> findDef(reg) },
                memF = { mem -> findUseForMem(mem) }
            )
        }

        override fun visit(node: MoveToMem) {
            findUseForMem(node.dest)
            findUse(node.src)
        }

        override fun visit(node: MoveToReg) {
            findDef(node.dest)
            findUse(node.src)
        }

        override fun visit(node: LoadEffectiveAddress) {
            findDef(node.dest)
            findUseForMem(node.mem)
        }

        override fun visit(node: CmpConstOrReg) {
            findUse(node.minuend)
            findUse(node.subtrahend)
        }

        override fun visit(node: CmpMem) {
            findUseForReg(node.minuend)
            findUseForMem(node.subtrahend)
        }

        override fun visit(node: SetOnFlag) {
            findDef(node.reg)
        }

        override fun visit(node: JumpLabel) {}

        private fun visitCall() {
            findUseForReg(RDI)
            findUseForReg(RSI)
            findUseForReg(RDX)
            findUseForReg(RCX)
            findUseForReg(R8)
            findUseForReg(R9)
            // destroy all caller-saved registers
            findDef(RAX)
            findDef(RCX)
            findDef(RDX)
            findDef(RSI)
            findDef(RDI)
            findDef(R8)
            findDef(R9)
            findDef(R10)
            findDef(R11)
        }

        override fun visit(node: CallAddress) {
            findUse(node.address)
            visitCall()
        }

        override fun visit(node: Return) {
            if (hasReturn) {
                findUseForReg(RAX)
            }
        }

        override fun visit(node: AlBinaryOpMemDest) {
            findUseForMem(node.dest)
            findUse(node.src)
        }

        override fun visit(node: AlBinaryOpRegDest) {
            findDef(node.dest)
            findUse(node.dest)
            findUse(node.src)
        }

        override fun visit(node: IMulTwoArgs) {
            findDef(node.dest)
            findUse(node.dest)
            findUse(node.src)
        }

        override fun visit(node: IMulThreeArgs) {
            findDef(node.dest)
            findUse(node.src)
        }

        override fun visit(node: Cqo) {
            findUse(RAX)
            findDef(RDX)
        }

        override fun visit(node: IDiv) {
            findDef(RAX)
            findDef(RDX)
            findUse(RAX)
            findUse(RDX)
            findUse(node.divisor)
        }

        override fun visit(node: Neg) {
            node.dest.matchRegOrMem(
                regF = { reg ->
                    findDef(reg)
                    findUseForReg(reg)
                },
                memF = { findUseForMem(mem = it) }
            )
        }

        override fun visit(node: ShiftLeft) {
            node.dest.matchRegOrMem(
                regF = { reg ->
                    findDef(reg)
                    findUseForReg(reg)
                },
                memF = { findUseForMem(mem = it) }
            )
        }

        override fun visit(node: Push) {
            findDef(RSP)
            findUseForReg(RSP)
            findUse(node.arg)
        }

        override fun visit(node: PopRBP) {
            findDef(RSP)
            findUseForReg(RSP)
            findDef(RBP)
        }

        override fun visit(node: Label): Unit = Unit
        override fun visit(node: Comment): Unit = Unit
    }

    companion object {
        /**
         * Compute the in and out sets for the live variable analysis graph.
         *
         * @param graph the graph.
         * @param defs the def set.
         * @param uses the use set.
         * @param inSet the in set.
         * @param outSet the out set.
         * @param T type of statements/instruction in the graph.
         */
        fun <T> computeInOutSets(
            graph: ControlFlowGraph<T>,
            defs: Array<MutableSet<String>>,
            uses: Array<MutableSet<String>>,
            inSet: Array<MutableSet<String>>,
            outSet: Array<MutableSet<String>>
        ) {
            val nodes = ArrayDeque<Int>()
            graph.dfs { nodes += it.id }
            while (!nodes.isEmpty()) {
                val nodeId = nodes.removeLast()
                // compute out[n] = union of all { in[n’] | n' in children[n] }
                val newOutSet = mutableSetOf<String>()
                for (childNodeId in graph.getChildrenIds(nodeId)) {
                    newOutSet.addAll(inSet[childNodeId])
                }
                outSet[nodeId] = newOutSet
                // update in[n] = use[n] union (out[n] - def[n])
                val useSet = uses[nodeId]
                val defSet = defs[nodeId]
                val oldInSet = inSet[nodeId]
                // first add all use set content
                val newInSet = useSet.toMutableSet()
                for (outVar in newOutSet) {
                    if (!defSet.contains(outVar)) {
                        newInSet.add(outVar)
                    }
                }
                inSet[nodeId] = newInSet
                // if change to in[n]
                if (oldInSet != newInSet) {
                    // for all predecessors of this node, add them to work list.
                    nodes.addAll(graph.getParentIds(nodeId))
                }
            }
        }
    }
}
