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
@ExperimentalStdlibApi
object SimpleOptimizations {
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
    fun optimizeIr(statements: List<MidIrStatement>): List<MidIrStatement> =
        coalesceConsecutiveLabelsForIr(statements = statements)
            .let { withoutConsecutiveJumpsInIr(it) }
            .let { withoutUnreachableCode(it) { lines -> ControlFlowGraph.fromIr(functionStatements = lines) } }
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
    fun optimizeAsm(
        instructions: List<AssemblyInstruction>,
        removeComments: Boolean
    ): List<AssemblyInstruction> =
        (if (removeComments) instructions.filter { it !is AssemblyInstruction.Comment } else instructions)
            .let { coalesceConsecutiveLabelsForAsm(it) }
            .let { withoutUnreachableCode(it) { lines -> ControlFlowGraph.fromAsm(functionInstructions = lines) } }
            .let { withoutImmediateJumpInAsm(it) }
            .let { withoutUnusedLabelInAsm(it) }

    private fun <T> withoutUnreachableCode(
        instructions: List<T>,
        cfgConstructor: (List<T>) -> ControlFlowGraph<T>
    ): List<T> {
        val reachableSet = hashSetOf<Int>()
        cfgConstructor(instructions).dfs { reachableSet.add(it.id) }
        // only add reachable instructions
        val reachableInstructions = mutableListOf<T>()
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
        val newStatements = mutableListOf<MidIrStatement>()
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

    private fun coalesceConsecutiveLabelsForIr(statements: List<MidIrStatement>): List<MidIrStatement> {
        val nextEquivalentLabelMap = hashMapOf<String, String>()
        val len = statements.size
        for (i in 0 until len) {
            if (i >= len - 1) {
                continue
            }
            val currentStatement = statements[i] as? MidIrStatement.Label ?: continue
            val nextStatement = statements[i + 1] as? MidIrStatement.Label ?: continue
            // Now we have established a single jump label
            nextEquivalentLabelMap[currentStatement.name] = nextStatement.name
        }
        if (nextEquivalentLabelMap.isEmpty()) {
            return statements
        }
        // It might be the case that we find something like l1 -> l2, l2 -> l3.
        // This pass standardized the map into l1 -> l3, l2 -> l3.
        val optimizedNextEquivalentLabelMap = nextEquivalentLabelMap.mapValues { (_, target) ->
            var finalTarget = target
            while (true) {
                val nextTarget = nextEquivalentLabelMap[finalTarget] ?: break
                finalTarget = nextTarget
            }
            finalTarget
        }
        return statements.mapNotNull { statement ->
            when (statement) {
                is MidIrStatement.Label -> if (optimizedNextEquivalentLabelMap.containsKey(key = statement.name)) {
                    null
                } else {
                    statement
                }
                is Jump -> {
                    val optimizedLabel = optimizedNextEquivalentLabelMap[statement.label]
                    if (optimizedLabel != null) Jump(label = optimizedLabel) else statement
                }
                is ConditionalJumpFallThrough -> {
                    val optimizedLabel = optimizedNextEquivalentLabelMap[statement.label1]
                    if (optimizedLabel != null) statement.copy(label1 = optimizedLabel) else statement
                }
                else -> statement
            }
        }
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

    private fun coalesceConsecutiveLabelsForAsm(instructions: List<AssemblyInstruction>): List<AssemblyInstruction> {
        val nextEquivalentLabelMap = hashMapOf<String, String>()
        val len = instructions.size
        for (i in 0 until len) {
            if (i >= len - 1) {
                continue
            }
            val currentInstruction = instructions[i] as? AssemblyInstruction.Label ?: continue
            val nextInstruction = instructions[i + 1] as? AssemblyInstruction.Label ?: continue
            // Now we have established a single jump label
            nextEquivalentLabelMap[currentInstruction.label] = nextInstruction.label
        }
        if (nextEquivalentLabelMap.isEmpty()) {
            return instructions
        }
        // It might be the case that we find something like l1 -> l2, l2 -> l3.
        // This pass standardized the map into l1 -> l3, l2 -> l3.
        val optimizedNextEquivalentLabelMap = nextEquivalentLabelMap.mapValues { (_, target) ->
            var finalTarget = target
            while (true) {
                val nextTarget = nextEquivalentLabelMap[finalTarget] ?: break
                finalTarget = nextTarget
            }
            finalTarget
        }
        return instructions.mapNotNull { instruction ->
            when (instruction) {
                is AssemblyInstruction.Label ->
                    if (optimizedNextEquivalentLabelMap.containsKey(key = instruction.label)) {
                        null
                    } else {
                        instruction
                    }
                is JumpLabel -> {
                    val optimizedLabel = optimizedNextEquivalentLabelMap[instruction.label]
                    if (optimizedLabel != null) instruction.copy(label = optimizedLabel) else instruction
                }
                else -> instruction
            }
        }
    }

    private fun withoutImmediateJumpInAsm(
        instructions: List<AssemblyInstruction>
    ): List<AssemblyInstruction> {
        val newInstructions = mutableListOf<AssemblyInstruction>()
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
