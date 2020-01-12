package samlang.compiler.asm.ralloc

import java.util.HashSet
import java.util.SortedMap
import java.util.TreeMap
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.CONST
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.R12
import samlang.ast.asm.AssemblyArgs.R13
import samlang.ast.asm.AssemblyArgs.R14
import samlang.ast.asm.AssemblyArgs.R15
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RBX
import samlang.ast.asm.AssemblyArgs.REG
import samlang.ast.asm.AssemblyArgs.Reg
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.Companion.COMMENT
import samlang.ast.asm.AssemblyInstruction.Companion.MOVE

/**
 * A set of utility functions related to dealing with callee saved registers.
 */
internal object CalleeSavedUtil {
    private val REGS: SortedMap<Reg, Reg> = TreeMap<Reg, Reg>().apply {
        this[REG(id = "RBX_CALLEE_SAVED_STORAGE")] = RBX
        this[REG(id = "R12_CALLEE_SAVED_STORAGE")] = R12
        this[REG(id = "R13_CALLEE_SAVED_STORAGE")] = R13
        this[REG(id = "R14_CALLEE_SAVED_STORAGE")] = R14
        this[REG(id = "R15_CALLEE_SAVED_STORAGE")] = R15
    }

    /**
     * Prepend and append moving callee saved registers to fresh temps.
     *
     * @param instructions the instruction to perform the transformation.
     * @return the transformed instructions.
     */
    @JvmStatic
    fun addCalleeSavedRegsMoves(
        instructions: List<AssemblyInstruction>
    ): List<AssemblyInstruction> {
        val newInstructions = arrayListOf<AssemblyInstruction>()
        for ((key, value) in REGS) {
            newInstructions += MOVE(key, value)
        }
        newInstructions += instructions
        for ((key, value) in REGS) {
            newInstructions += MOVE(value, key)
        }
        newInstructions += COMMENT(comment = "Dummy end of program.")
        return newInstructions
    }

    /**
     * Mutate the spilledVarMappings to remove unused space for callee saved registers.
     *
     * @param spilledVarMappings the spilled var mappings to mutable.
     * @param unusedCalleeSavedRegisters a set of unused callee saved registers as a reference.
     * @return new mappings from the old mem to new mem.
     */
    @JvmStatic
    fun reorganizeSpilledVarMappings(
        spilledVarMappings: MutableMap<String, AssemblyArgs.Mem>,
        unusedCalleeSavedRegisters: Set<String>
    ): Map<AssemblyArgs.Mem, AssemblyArgs.Mem> {
        val usedNames = HashSet<String>()
        val unusedNames = HashSet<String>()
        for ((name, mem) in spilledVarMappings) {
            if (unusedCalleeSavedRegisters.contains(name)) {
                unusedNames.add(name)
                continue
            }
            // sanity check
            if (RBP != mem.baseReg) {
                throw Error("Impossible")
            }
            val displacement = mem.displacement
            if (displacement == null) {
                throw Error("Impossible")
            } else {
                val displacementValue = displacement.value
                if (displacementValue != null && displacementValue % 8 != 0) {
                    throw Error("Impossible")
                }
            }
            usedNames.add(name)
        }
        val newMappings = hashMapOf<AssemblyArgs.Mem, AssemblyArgs.Mem>()
        var memId = 1
        for (usedName in usedNames) {
            val oldMem = spilledVarMappings[usedName]!!
            val newMem: AssemblyArgs.Mem = MEM(RBP, CONST(value = -8 * memId))
            newMappings[oldMem] = newMem
            spilledVarMappings[usedName] = newMem
            memId++
        }
        spilledVarMappings.keys.removeAll(unusedNames)
        return newMappings
    }
}
