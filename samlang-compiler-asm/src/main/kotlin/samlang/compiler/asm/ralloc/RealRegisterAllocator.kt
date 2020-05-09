package samlang.compiler.asm.ralloc

import samlang.analysis.LiveVariableAnalysis
import samlang.ast.asm.AssemblyArgs.Mem
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.MoveToReg
import samlang.ast.asm.FunctionContext
import samlang.compiler.asm.ralloc.CalleeSavedUtil.addCalleeSavedRegsMoves
import samlang.compiler.asm.ralloc.CalleeSavedUtil.reorganizeSpilledVarMappings
import samlang.compiler.asm.ralloc.RegisterAllocationConstants.CALLEE_SAVED_REGS
import samlang.compiler.asm.ralloc.RegisterAllocationConstants.K
import samlang.compiler.asm.ralloc.RegisterAllocationConstants.OK_REGS
import samlang.compiler.asm.ralloc.RegisterAllocationConstants.PRE_COLORED_REGS
import samlang.compiler.asm.ralloc.RegisterCollector.collect

/**
 * The real register allocator.
 * It does non-trivial register allocation and the worst it can do is the same as naive register
 * allocator.
 *
 * @param functionContext the mutable context of a function.
 * @param tiledInstructions the assembly instructions to perform live variable analysis.
 */
class RealRegisterAllocator(
    private val functionContext: FunctionContext,
    tiledInstructions: List<AssemblyInstruction>
) {
    /*
     * ================================================================================
     * Part 1: Basic working context
     * --------------------------------------------------------------------------------
     * It contains all the necessary original raw information we need to solve the
     * register allocation problem.
     * ================================================================================
     */

    /** The assembly instructions to perform register allocation. */
    private var instructions: List<AssemblyInstruction>
    /** A the mappings for all spilled vars. */
    private val spilledVarMappings: MutableMap<String, Mem> = mutableMapOf()
    /** The generated new instructions. */
    val realInstructions: List<AssemblyInstruction>

    /*
     * ================================================================================
     * Part 2: Variable work lists, sets, and stacks
     * --------------------------------------------------------------------------------
     * The following lists and sets are always mutually disjoint and every variable is
     * always in exactly one of the sets or lists.
     * ================================================================================
     */

    /** Temporary registers, not pre-colored and not yet processed. */
    private val initial: MutableSet<String>
    /** List of low-degree non-move-related variables. */
    private val simplifyWorkList: SetQueue<String> = SetQueue()
    /** List of low-degree move-related variables. */
    private val freezeWorkList: SetQueue<String> = SetQueue()
    /** High-degree variables. */
    private val spillWorkList: SetQueue<String> = SetQueue()
    /**
     * Variables marked for spilling during this round; initially empty.
     */
    private val spilledVars: MutableSet<String> = mutableSetOf()
    /**
     * Registers that have been coalesced; when u <- v is coalesced, v is added to
     * this set and u put back on some work list (or vice versa).
     */
    private val coalescedVars: MutableSet<String> = mutableSetOf()
    /**
     * Variables successfully colored.
     */
    private val coloredVars: MutableSet<String> = mutableSetOf()
    /** Stack containing temporaries removed from the graph. */
    private val selectStack: ArrayDeque<String> = ArrayDeque()

    /*
     * ================================================================================
     * Part 3: Move sets
     * --------------------------------------------------------------------------------
     * There are five sets of move instructions, and every move is in exactly one of
     * these sets (after build through the end of main).
     * ================================================================================
     */

    /** Moves that have been coalesced. */
    private val coalescedMoves: MutableSet<RegMove> = mutableSetOf()
    /** Moves whose source and target interfere. */
    private val constrainedMoves: MutableSet<RegMove> = mutableSetOf()
    /** Moves that will no longer be considered for coalescing. */
    private val frozenMoves: MutableSet<RegMove> = mutableSetOf()
    /** Moves enabled for possible coalescing. */
    private val workListMoves: MutableSet<RegMove> = mutableSetOf()
    /** Moves not yet ready for coalescing. */
    private val activeMoves: MutableSet<RegMove> = mutableSetOf()
    /*
     * ================================================================================
     * Part 4: Other data structures
     * --------------------------------------------------------------------------------
     * There are some data structures that represent graph, aliasing, and the current
     * coloring status.
     * ================================================================================
     */
    /** The interference graph. */
    private val interferenceGraph: InterferenceGraph
    /** A mapping from a node to the list of moves it is associated with. */
    private val moveMap: MutableMap<String, MutableSet<RegMove>> = mutableMapOf()
    /** When a move (u, v) has been coalesced, and v put in coalescedVars, then alias(v) = u. */
    private val alias: MutableMap<String, String> = mutableMapOf()
    /**
     * The color chosen by the algorithm for a node; for pre-colored nodes this is
     * initialized to the given color.
     */
    private val colors: MutableMap<String, String> = mutableMapOf()

    init {
        instructions = addCalleeSavedRegsMoves(tiledInstructions)
        val initialNonMachineRegisters = collect(
            abstractAssemblyInstruction = instructions,
            excludeMachineRegisters = true
        )
        interferenceGraph = InterferenceGraph()
        initial = initialNonMachineRegisters.toMutableSet()
        // initialize color for pre-colored regs
        for (preColoredReg in PRE_COLORED_REGS) {
            colors[preColoredReg] = preColoredReg
        }
        // run the allocator
        main()
        // post-processing
        val usedColorsForTemps = colors.entries
            .asSequence()
            .filter { !PRE_COLORED_REGS.contains(it.key) }
            .map { it.value }
            .toSet()
        val unusedCalleeSavedRegisters = CALLEE_SAVED_REGS.toMutableSet()
        unusedCalleeSavedRegisters.removeAll(usedColorsForTemps)
        val newSpilledVarMemMapping = reorganizeSpilledVarMappings(
            spilledVarMappings = spilledVarMappings,
            unusedCalleeSavedRegisters = unusedCalleeSavedRegisters
        )
        realInstructions = ColoringProgramRewriter(
            colors, newSpilledVarMemMapping, unusedCalleeSavedRegisters, instructions
        ).getNewInstructions()
        // sanity check to ensure we get rid of all non-machine registers!
        if (collect(realInstructions, true).isNotEmpty()) {
            throw Error("Still contains non-machine register!!!")
        }
    }

    /** The data class that represents a move between a register to another register. */
    private data class RegMove(val dest: String, val src: String) {
        override fun toString(): String = "{ dest: $dest, src: $src }"
    }

    /** @return number of temporaries to put on the stack. */
    val numberOfTemporariesOnStack: Int get() = spilledVarMappings.size

    /** The main function to run for register allocation. */
    private fun main() {
        while (true) {
            val liveVariableAnalysisResult = LiveVariableAnalysis(functionContext, instructions)
            build(liveVariableAnalysisResult)
            val useCount = buildUseCount(liveVariableAnalysisResult)
            makeWorkList()
            while (true) {
                if (!simplifyWorkList.isEmpty()) {
                    simplify()
                } else if (workListMoves.isNotEmpty()) {
                    coalesce()
                } else if (!freezeWorkList.isEmpty()) {
                    freeze()
                } else if (!spillWorkList.isEmpty()) {
                    selectSpill(useCount)
                } else {
                    break
                }
                @Suppress(names = ["ConstantConditionIf"])
                if (CHECK_INVARIANT) {
                    checkInvariant()
                }
            }
            assignColors()
            if (spilledVars.isEmpty()) { // done!
                break
            }
            rewriteProgram()
        }
    }

    /** Check the invariants listed in the book. Used for debugging. */
    private fun checkInvariant() {
        // degree invariant
        val workListUnion = union(listOf(simplifyWorkList, freezeWorkList, spillWorkList))
        for (u in workListUnion) {
            val degree = interferenceGraph.degree(u)
            var c = 0
            val uAdjacentSet: Set<String> = adjacentSet(u)
            for (v in uAdjacentSet) {
                if (PRE_COLORED_REGS.contains(v) || workListUnion.contains(v)) {
                    c++
                }
            }
            if (degree != c) {
                val errorMessage = ("degree invariant is broken. degree = " +
                        degree + ", cardinality = " + c + ", variable = " + u)
                throw Error(errorMessage)
            }
        }
        // simplifyWorkList invariant
        for (u in simplifyWorkList) {
            val degree = interferenceGraph.degree(u)
            if (degree >= K) { // selected for spilling
                continue
            }
            val moveList: Set<RegMove>? = moveMap[u]
            if (moveList != null) {
                for (v in moveList) {
                    if (activeMoves.contains(v) || workListMoves.contains(v)) {
                        val errorMessage = ("simplifyWorkList invariant is broken" +
                                ". moveList = " + moveList +
                                ", activeMoves = " + activeMoves +
                                ", workListMoves = " + workListMoves)
                        throw Error(errorMessage)
                    }
                }
            }
        }
        // freeWorkList invariant
        for (u in freezeWorkList) {
            val degree = interferenceGraph.degree(u)
            if (degree >= K) {
                val errorMessage = ("freezeWorkList invariant is broken" +
                        ". degree = " + degree +
                        ", variable = " + u)
                throw Error(errorMessage)
            }
            val moveList: Set<RegMove>? = moveMap[u]
            var intersectionIsEmpty = true
            if (moveList != null) {
                for (v in moveList) {
                    if (activeMoves.contains(v) || workListMoves.contains(v)) {
                        intersectionIsEmpty = false
                    }
                }
            }
            if (intersectionIsEmpty) {
                val errorMessage = ("freezeWorkList invariant is broken" +
                        ". moveList = " + moveList +
                        ", activeMoves = " + activeMoves +
                        ", workListMoves = " + workListMoves)
                throw Error(errorMessage)
            }
        }
        // spillWorkList invariant
        for (u in spillWorkList) {
            val degree = interferenceGraph.degree(u)
            if (degree < K) {
                val errorMessage = ("spillWorkList invariant is broken" +
                        ". degree = " + degree +
                        ", variable = " + u)
                throw Error(errorMessage)
            }
        }
    }

    private fun build(liveVariableAnalysisResult: LiveVariableAnalysis) {
        val liveMap =
            liveVariableAnalysisResult.liveVariablesOut
        val defMap =
            liveVariableAnalysisResult.defs
        val useMap =
            liveVariableAnalysisResult.uses
        // iterating over the instructions in reverse order.
        for (i in instructions.indices.reversed()) {
            val instruction = instructions[i]
            val liveSet = HashSet(liveMap[i])
            val useSet = useMap[i]
            // if isMoveInstruction(instruction) then
            if (instruction is MoveToReg) {
                val (dest1, srcArg) = instruction
                val dest = dest1.id
                if (srcArg is Reg) {
                    val src = srcArg.id
                    val move = RegMove(dest, src)
                    // live := live / use(I)
                    liveSet.removeAll(useSet)
                    // moveList[n] := moveList[n] union {I}
                    moveMap.computeIfAbsent(dest) { mutableSetOf() }.add(move)
                    moveMap.computeIfAbsent(src) { mutableSetOf() }.add(move)
                    // workListMoves := workListMoves union {I}
                    workListMoves.add(move)
                }
            }
            val defSet = defMap[i]
            liveSet.addAll(defSet)
            for (definedVar in defSet) {
                for (liveVar in liveSet) {
                    interferenceGraph.addEdge(liveVar, definedVar)
                }
            }
            // omitted final line in the book because we operate on instruction level
        }
    }

    /**
     * @param liveVariableAnalysisResult the live variable analysis result.
     * @return the use count for each variable.
     */
    private fun buildUseCount(liveVariableAnalysisResult: LiveVariableAnalysis): Map<String, Int> {
        val useCount = HashMap<String, Int>()
        for (set in liveVariableAnalysisResult.uses) {
            for (name in set) {
                useCount.merge(name, 1) { a: Int?, b: Int? -> Integer.sum(a!!, b!!) }
            }
        }
        for (set in liveVariableAnalysisResult.defs) {
            for (name in set) {
                useCount.merge(name, 1) { a: Int?, b: Int? -> Integer.sum(a!!, b!!) }
            }
        }
        return useCount
    }

    private fun makeWorkList() {
        for (variable in initial) {
            when {
                interferenceGraph.degree(variable) >= K -> spillWorkList.add(variable)
                moveRelated(variable) -> freezeWorkList.add(variable)
                else -> simplifyWorkList.add(variable)
            }
        }
        initial.clear()
    }

    private fun adjacentSet(variable: String): MutableSet<String> {
        val adjList = interferenceGraph.getAdjacentList(variable)
        // resultSet = adjList[n] - (selectStack union coalescedNodes)
        val resultSet = HashSet<String>()
        for (v in adjList) {
            if (selectStack.contains(v) || coalescedVars.contains(v)) {
                continue
            }
            resultSet.add(v)
        }
        return resultSet
    }

    private fun nodeMoves(variable: String): Set<RegMove> {
        val moveList = moveMap[variable] ?: return emptySet()
        val resultSet = HashSet<RegMove>()
        // resultSet = moveList[n] intersect (activeMoves union workListMoves)
        for (move in moveList) {
            if (activeMoves.contains(move) || workListMoves.contains(move)) {
                resultSet.add(move)
            }
        }
        return resultSet
    }

    private fun moveRelated(variable: String): Boolean {
        val moveList = moveMap[variable] ?: return false
        for (move in moveList) {
            if (activeMoves.contains(move) || workListMoves.contains(move)) {
                return true
            }
        }
        return false
    }

    private fun simplify() {
        val varToSimplify = simplifyWorkList.poll() ?: throw Error("Impossible!")
        selectStack.addFirst(varToSimplify)
        adjacentSet(varToSimplify).forEach { variable -> decrementDegree(variable) }
    }

    private fun decrementDegree(variable: String) {
        val oldDegree = interferenceGraph.decrementDegree(variable)
        if (oldDegree == K) {
            val enableMoveSet = adjacentSet(variable)
            enableMoveSet.add(variable)
            enableMoves(enableMoveSet)
            spillWorkList.remove(variable)
            if (moveRelated(variable)) {
                freezeWorkList.add(variable)
            } else {
                simplifyWorkList.add(variable)
            }
        }
    }

    private fun enableMoves(variables: Collection<String>) {
        for (variable in variables) {
            for (move in nodeMoves(variable)) {
                if (activeMoves.contains(move)) {
                    activeMoves.remove(move)
                    workListMoves.add(move)
                }
            }
        }
    }

    private fun addToWorkList(variable: String) {
        if (!PRE_COLORED_REGS.contains(variable) &&
            !moveRelated(variable) &&
            interferenceGraph.degree(variable) < K
        ) {
            freezeWorkList.remove(variable)
            simplifyWorkList.add(variable)
        }
    }

    private fun ok(t: String, r: String): Boolean {
        return (interferenceGraph.degree(t) < K || PRE_COLORED_REGS.contains(t) ||
                interferenceGraph.contains(t, r))
    }

    private fun conservative(variables: Collection<String>): Boolean {
        var k = 0
        for (variable in variables) {
            if (interferenceGraph.degree(variable) >= K) {
                k++
            }
        }
        return k < K
    }

    private fun union(
        sets: Collection<Collection<String>>
    ): Set<String> {
        val s = HashSet<String>()
        for (set in sets) {
            s.addAll(set)
        }
        return s
    }

    private fun coalesce() { // pick an arbitrary move from workListMoves
        val workListMovesIterator: Iterator<RegMove> = workListMoves.iterator()
        if (!workListMovesIterator.hasNext()) {
            throw Error()
        }
        val move = workListMovesIterator.next()
        val x = getAlias(move.dest)
        val y = getAlias(move.src)
        val u: String
        val v: String
        if (PRE_COLORED_REGS.contains(y)) {
            u = y
            v = x
        } else {
            u = x
            v = y
        }
        // workListMoves := workListMoves - {m}
        workListMoves.remove(move)
        if (u == v) {
            coalescedMoves.add(move)
            addToWorkList(u)
        } else if (PRE_COLORED_REGS.contains(v) || interferenceGraph.contains(u, v)) {
            constrainedMoves.add(move)
            addToWorkList(u)
            addToWorkList(v)
        } else {
            var condition = (PRE_COLORED_REGS.contains(u) &&
                    adjacentSet(v).stream().allMatch { t: String -> ok(t, u) })
            if (!condition) {
                condition = (!PRE_COLORED_REGS.contains(u) &&
                        conservative(union(listOf(adjacentSet(u), adjacentSet(v)))))
            }
            if (condition) {
                coalescedMoves.add(move)
                combine(u, v)
                addToWorkList(u)
            } else {
                activeMoves.add(move)
            }
        }
    }

    private fun combine(u: String, v: String) {
        if (freezeWorkList.contains(v)) {
            freezeWorkList.remove(v)
        } else {
            spillWorkList.remove(v)
        }
        // coalescedNodes := coalescedNodes union {v}
        coalescedVars.add(v)
        // alias[v] := u
        alias[v] = u
        // moveList[u] := moveList[u] union moveList[v]
        moveMap.computeIfAbsent(u) { mutableSetOf() }.addAll(moveMap.getOrDefault(v, emptySet()))
        enableMoves(listOf(v))
        for (t in adjacentSet(v)) {
            interferenceGraph.addEdge(t, u)
            decrementDegree(t)
        }
        if (interferenceGraph.degree(u) >= K && freezeWorkList.contains(u)) {
            freezeWorkList.remove(u)
            spillWorkList.add(u)
        }
    }

    /**
     * @param variable variable to obtain the deepest alias.
     * @return the deepest alias of the given variable.
     */
    private fun getAlias(variable: String): String {
        // already performed tail recursion optimization by hand
        var v = variable
        while (true) {
            if (!coalescedVars.contains(v)) {
                return v
            }
            val newV = alias[v] ?: throw Error("Alias should not be null! Original: $v")
            v = newV
        }
    }

    private fun freeze() { // let u = one of freezeWorkList; freezeWorkList.remove(u)
        val variable = freezeWorkList.poll() ?: throw Error()
        simplifyWorkList.add(variable)
        freezeMoves(variable)
    }

    private fun freezeMoves(u: String) {
        val uAlias = getAlias(u)
        for (move in nodeMoves(u)) {
            val x = move.dest
            val y = move.src
            val yAlias = getAlias(y)
            val v = if (yAlias == uAlias) getAlias(x) else yAlias
            activeMoves.remove(move)
            frozenMoves.add(move)
            if (freezeWorkList.contains(v) && nodeMoves(v).isEmpty()) {
                freezeWorkList.remove(v)
                simplifyWorkList.add(v)
            }
        }
    }

    private fun selectSpill(useCount: Map<String, Int>) {
        var lowestScore = Int.MAX_VALUE.toDouble()
        var bestVariableToSpill: String? = null
        for (variable in spillWorkList) {
            val uses = useCount[variable] ?: 0
            val degree = interferenceGraph.degree(variable)
            val score: Double
            score = if (degree <= 0) {
                Int.MAX_VALUE.toDouble()
            } else {
                1.0 * uses / degree
            }
            if (score < lowestScore) {
                bestVariableToSpill = variable
                lowestScore = score
            }
        }
        if (bestVariableToSpill == null) {
            throw Error()
        }
        spillWorkList.remove(bestVariableToSpill)
        simplifyWorkList.add(bestVariableToSpill)
        freezeMoves(bestVariableToSpill)
    }

    private fun assignColors() {
        while (!selectStack.isEmpty()) {
            val variable = selectStack.removeFirst()
            val okRegs = mutableSetOf(*OK_REGS.toTypedArray())
            val adjacentVars =
                interferenceGraph.getAdjacentList(variable)
            for (conflictingVar in adjacentVars) {
                val alias = getAlias(conflictingVar)
                if (coloredVars.contains(alias) || PRE_COLORED_REGS.contains(alias)) {
                    okRegs.remove(colors[alias])
                }
            }
            val color = okRegs.firstOrNull()
            if (color == null) {
                spilledVars.add(variable)
            } else {
                okRegs.remove(color)
                coloredVars.add(variable)
                colors[variable] = color
            }
        }
        for (variable in coalescedVars) {
            val varAlias = getAlias(variable)
            val colorOfAlias = colors[varAlias]
            if (colorOfAlias != null) {
                colors[variable] = colorOfAlias
            }
        }
    }

    private fun rewriteProgram() {
        val rewriter = SpillingProgramRewriter(
            functionContext, instructions, spilledVars, spilledVarMappings.size
        )
        instructions = rewriter.getNewInstructions()
        interferenceGraph.clear()
        spilledVarMappings.putAll(rewriter.getSpilledVarMappings())
        initial.clear()
        initial.addAll(coloredVars)
        initial.addAll(coalescedVars)
        initial.addAll(rewriter.getNewTemps())
        // cleanup vars in this round
        spilledVars.clear()
        coloredVars.clear()
        coalescedVars.clear()
        // also cleanup assigned old colors
        colors.clear()
        for (preColoredReg in PRE_COLORED_REGS) {
            colors[preColoredReg] = preColoredReg
        }
        // cleanup moves in this round
        coalescedMoves.clear()
        constrainedMoves.clear()
        frozenMoves.clear()
        workListMoves.clear()
        activeMoves.clear()
    }

    companion object {
        private const val CHECK_INVARIANT = false
    }
}
