package samlang.optimization

import samlang.analysis.ControlFlowGraph
import samlang.analysis.UsedNameAnalysis
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.JumpLabel
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrNameEncoder
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.ConditionalJumpFallThrough
import samlang.ast.mir.MidIrStatement.Jump

/** The class that performs a series of simple optimizations. */
@Suppress(names = ["ComplexRedundantLet"])
object SimpleOptimizations {
    @JvmStatic
    fun removeUnusedNames(irCompilationUnit: MidIrCompilationUnit): MidIrCompilationUnit {
        val usedNames = UsedNameAnalysis.getUsedNames(irCompilationUnit = irCompilationUnit)
        val usedGlobals = irCompilationUnit.globalVariables.filter { it.name in usedNames }
        val usedFunctions = irCompilationUnit.functions.filter { function ->
            val name = function.functionName
            name == MidIrNameEncoder.compiledProgramMain || name in usedNames
        }
        return MidIrCompilationUnit(globalVariables = usedGlobals, functions = usedFunctions)
    }

    /**
     * Perform these optimizations in order and return an optimized sequence of instructions.
     * - unreachable code elimination
     * - jump to immediate label elimination
     * - unused label elimination
     *
     * @return a list of all optimized statements.
     */
    @JvmStatic
    fun optimizeIr(statements: List<MidIrStatement>): List<MidIrStatement> =
        withoutConsecutiveJumpsInIr(statements = statements)
            .let { withoutUnreachableCode(it) { ControlFlowGraph.fromIr(it) } }
            .let { withoutConsecutiveJumpsInIr(it) }
            .let { withoutImmediateJumpInIr(it) }
            .let { withoutUnusedLabelInIr(it) }

    /**
     * Perform these optimizations in order and return an optimized sequence of instructions.
     * - unreachable code elimination
     * - jump to immediate label elimination
     * - unused label elimination
     * - comments removal (optional)
     *
     * @param instructions the instructions to perform reachability analysis.
     * @param removeComments whether to remove comments.
     * @return a list of all optimized instructions.
     */
    @JvmStatic
    fun optimizeAsm(
        instructions: List<AssemblyInstruction>,
        removeComments: Boolean
    ): List<AssemblyInstruction> =
        withoutUnreachableCode(instructions) { ControlFlowGraph.fromAsm(it) }
            .let { withoutImmediateJumpInAsm(it) }
            .let { withoutUnusedLabelInAsm(it) }
            .let {
                if (removeComments) {
                    it.filter { i -> i !is AssemblyInstruction.Comment }
                } else {
                    it
                }
            }

    private fun <T> withoutUnreachableCode(
        instructions: List<T>,
        cfgConstructor: (List<T>) -> ControlFlowGraph<T>
    ): List<T> {
        val reachableSet = hashSetOf<Int>()
        cfgConstructor(instructions).dfs { reachableSet.add(it.id) }
        // only add reachable instructions
        val reachableInstructions = arrayListOf<T>()
        val len = instructions.size
        for (i in 0 until len) {
            if (reachableSet.contains(i)) {
                reachableInstructions.add(instructions[i])
            }
        }
        return reachableInstructions
    }

    private fun withoutUnusedLabelInIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val usedLabels = statements.mapNotNullTo(hashSetOf(), { statement ->
            when (statement) {
                is Jump -> statement.label
                is ConditionalJumpFallThrough -> statement.label1
                else -> null
            }
        })
        return statements.filter { statement ->
            if (statement is MidIrStatement.Label) {
                usedLabels.contains(statement.name)
            } else {
                true
            }
        }
    }

    private fun withoutUnusedLabelInAsm(instructions: List<AssemblyInstruction>): List<AssemblyInstruction> {
        val usedLabels = instructions.mapNotNullTo(hashSetOf(), { (it as? JumpLabel)?.label })
        return instructions.filter { instruction ->
            if (instruction is AssemblyInstruction.Label) {
                usedLabels.contains(instruction.label)
            } else {
                true
            }
        }
    }

    private fun withoutImmediateJumpInIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val newStatements = arrayListOf<MidIrStatement>()
        val len = statements.size
        for (i in 0 until len) {
            val s = statements[i]
            if (i < len - 1) {
                val nextStatement = statements[i + 1]
                if (nextStatement is MidIrStatement.Label) {
                    val nextLabel = nextStatement.name
                    if (s is Jump) {
                        if (s.label == nextLabel) {
                            continue
                        }
                    } else if (s is ConditionalJumpFallThrough) {
                        if (s.label1 == nextLabel) {
                            continue
                        }
                    }
                }
            }
            // cannot optimize, give up
            newStatements += s
        }
        return newStatements
    }

    private fun withoutConsecutiveJumpsInIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val singleJumpLabelMap = hashMapOf<String, String>() // label -> jump target
        val len = statements.size
        for (i in 0 until len) {
            if (i >= len - 1) {
                continue
            }
            val currentStatement = statements[i] as? MidIrStatement.Label ?: continue
            val nextStatement = statements[i + 1] as? Jump ?: continue
            // Now we have established a single jump label
            singleJumpLabelMap[currentStatement.name] = nextStatement.label
        }
        // It might be the case that we find something like l1 -> l2, l2 -> l3.
        // This pass standardized the map into l1 -> l3, l2 -> l3.
        val optimizedJumpLabelMap = singleJumpLabelMap.mapValues { (_, target) ->
            var finalTarget = target
            while (true) {
                val nextTarget = singleJumpLabelMap[finalTarget] ?: break
                finalTarget = nextTarget
            }
            finalTarget
        }
        return statements.map { statement ->
            if (statement is Jump) {
                val optimizedLabel = optimizedJumpLabelMap[statement.label]
                if (optimizedLabel != null) Jump(label = optimizedLabel) else statement
            } else if (statement is ConditionalJumpFallThrough) {
                val optimizedLabel = optimizedJumpLabelMap[statement.label1]
                if (optimizedLabel != null) statement.copy(label1 = optimizedLabel) else statement
            } else {
                statement
            }
        }
    }

    private fun withoutImmediateJumpInAsm(
        instructions: List<AssemblyInstruction>
    ): List<AssemblyInstruction> {
        val newInstructions = arrayListOf<AssemblyInstruction>()
        val len = instructions.size
        for (i in 0 until len) {
            val instruction = instructions[i]
            if (i < len - 1 && instruction is JumpLabel) {
                val (_, label) = instruction
                val nextInstruction = instructions[i + 1]
                if (nextInstruction is AssemblyInstruction.Label &&
                    nextInstruction.label == label
                ) {
                    // do not add this. still add next since the label might be used by others
                    continue
                }
            }
            newInstructions.add(instruction)
        }
        return newInstructions
    }
}
