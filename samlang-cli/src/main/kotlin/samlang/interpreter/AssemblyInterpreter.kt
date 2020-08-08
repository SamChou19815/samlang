package samlang.interpreter

import samlang.ast.asm.AssemblyArg
import samlang.ast.asm.AssemblyArgs
import samlang.ast.asm.AssemblyArgs.MEM
import samlang.ast.asm.AssemblyArgs.RAX
import samlang.ast.asm.AssemblyArgs.RBP
import samlang.ast.asm.AssemblyArgs.RDI
import samlang.ast.asm.AssemblyArgs.RDX
import samlang.ast.asm.AssemblyArgs.RSI
import samlang.ast.asm.AssemblyArgs.RSP
import samlang.ast.asm.AssemblyInstruction
import samlang.ast.asm.AssemblyInstruction.*
import samlang.ast.asm.AssemblyInstructionVisitor
import samlang.ast.asm.AssemblyProgram
import samlang.ast.asm.RegOrMem
import samlang.ast.common.IrNameEncoder

@ExperimentalStdlibApi
class AssemblyInterpreter(program: AssemblyProgram) {
    /** The list of all instructions. */
    private val instructions: List<AssemblyInstruction> = program.instructions
    /** The mapping between label and instruction number. Useful for jump. */
    private val labelInstructionNumberMapping: MutableMap<String, Int> = mutableMapOf()
    /** The mapping from names to actual memory address. */
    private val nameToMemoryAddress: MutableMap<String, Long> = mutableMapOf()
    /** Current register values. It will only be lazily provisioned. */
    private val registers: MutableMap<String, Long> = mutableMapOf()
    /** Current memory content. It will only be lazily provisioned. */
    private val memory: MutableMap<Long, Long> = mutableMapOf()
    /**
     * Current flags.
     * The flags are not exactly the same as the x86 ones.
     */
    private val flags: MutableMap<String, Boolean> = mutableMapOf()
    /** The current instruction pointer. */
    private var instructionPointer: Int
    /** The current heap end pointer. */
    private var currentHeapEndPointer: Int
    /** The place to collect all the stuff printed. */
    private val printCollector: StringBuilder
    /** The interpreter visitor to use.  */
    private val visitor: InterpreterVisitor

    init {
        var globalVarsTotalSize = 10000L
        for ((name, content) in program.globalVariables) {
            // Setup content variable size
            val contentStart = globalVarsTotalSize
            nameToMemoryAddress[name] = contentStart
            globalVarsTotalSize += content.length * 8 + 8
            // Setup content
            memory[contentStart] = content.length.toLong()
            val characterStart = contentStart + 8L
            content.toCharArray().forEachIndexed { index, character ->
                memory[characterStart + 8 * index] = character.toLong()
            }
        }
        // allocate space for global vars
        calloc(globalVarsTotalSize)
        val len = instructions.size
        for (i in 0 until len) {
            val instruction = instructions[i]
            if (instruction is Label) {
                labelInstructionNumberMapping[instruction.label] = i * 8
            }
        }
        registers[RSP.id] = 0x780000000L // set stack pointer
        instructionPointer = labelInstructionNumberMapping[IrNameEncoder.compiledProgramMain]!!
        currentHeapEndPointer = globalVarsTotalSize.toInt()
        printCollector = StringBuilder()
        visitor = InterpreterVisitor()
        stepUntilReturn()
    }

    /** @return the interpretation result string, which is the stdout result.  */
    val interpretationResult: String get() = printCollector.toString()

    private fun stepUntilReturn() {
        while (true) {
            if (instructionPointer % 8 != 0) {
                throw Error("BAD RIP: $instructionPointer")
            }
            val instruction = instructions[instructionPointer / 8]
            try {
                instruction.accept(visitor)
            } catch (e: ReturnException) {
                return
            }
            instructionPointer += 8
        }
    }

    /**
     * @param id the id of the register.
     * @return the value inside the given register, 0 if it's first used.
     */
    private fun getReg(id: String): Long {
        val value = registers[id]
        if (value != null) {
            return value
        }
        registers[id] = 0L
        return 0L
    }

    /**
     * @param id the id of the register.
     * @param value the value to store into the register.
     */
    private fun setReg(id: String, value: Long) {
        registers[id] = value
    }

    private fun checkMemLocation(location: Long) {
        if (location % 8 != 0L) {
            throw PanicException("Unaligned memory access: $location (word size=8)")
        }
        if (location < 0 || location > 0x780000000L) {
            throw PanicException("Segmentation fault: $location.")
        }
    }

    /**
     * @param location the memory location to access.
     * @return the value inside the memory location, 0 if first used.
     */
    private fun getMem(location: Long): Long {
        checkMemLocation(location = location)
        val value = memory[location]
        if (value != null) {
            return value
        }
        memory[location] = 0L
        return 0L
    }

    /**
     * @param location the memory location to set.
     * @param value the value to store into the memory location.
     */
    private fun setMem(location: Long, value: Long) {
        checkMemLocation(location = location)
        memory[location] = value
    }

    /**
     * @param mem the mem expression.
     * @return the value inside the memory location, 0 if first used.
     */
    private fun getMemLocation(mem: AssemblyArgs.Mem): Long {
        var memLoc: Long = 0
        val baseReg = mem.baseReg
        if (baseReg != null) {
            memLoc += getReg(baseReg.id)
        }
        val multipleOf = mem.multipleOf
        if (multipleOf != null) {
            val b = getReg(multipleOf.baseReg.id)
            val c = multipleOf.multipliedConstant.constant
            memLoc += b * c
        }
        val displacement = mem.displacement
        if (displacement != null) {
            memLoc += getConstValue(displacement)
        }
        return memLoc
    }

    private fun getConstValue(constant: AssemblyArgs.Const): Long {
        val value = constant.value
        val name = constant.name
        if (value == null && name == null || value != null && name != null) {
            throw Error("Corrupted: $constant")
        }
        if (value != null) {
            return value.toLong()
        }
        return nameToMemoryAddress[name] ?: labelInstructionNumberMapping[name]!!.toLong()
    }

    /**
     * @param arg the argument in an assembly instruction.
     * @return the stored value.
     */
    private fun getValue(arg: AssemblyArg): Long = arg.match(
        constF = { getConstValue(it) },
        regF = { (id) -> getReg(id) },
        memF = { mem -> getMem(getMemLocation(mem)) }
    )

    /**
     * @param regOrMem the argument in an assembly instruction.
     * @param value the value to set.
     */
    private fun setValue(regOrMem: RegOrMem, value: Long) {
        regOrMem.matchRegOrMem(
            regF = { (id) -> setReg(id = id, value = value) },
            memF = { mem -> setMem(location = getMemLocation(mem = mem), value = value) }
        )
    }

    /**
     * @param size size of the memory to allocate.
     * @return the allocated memory's starting pointer.
     */
    private fun calloc(size: Long): Long {
        if (size < 0) {
            throw PanicException("Invalid size")
        }
        if (size % 8 != 0L) {
            throw PanicException("Can only allocate in chunks of 8 bytes!: bad size: $size")
        }
        val pointerToBeReturned = currentHeapEndPointer.toLong()
        currentHeapEndPointer = (currentHeapEndPointer + size).toInt()
        if (currentHeapEndPointer > 1 shl 20) {
            throw PanicException("Out of heap!")
        }
        return pointerToBeReturned
    }

    /**
     * The hack to break the control flow and return from function call.
     */
    private class ReturnException : Error()

    private inner class InterpreterVisitor : AssemblyInstructionVisitor {
        override fun visit(node: MoveFromLong) {
            setValue(regOrMem = node.dest, value = node.value)
        }

        override fun visit(node: MoveToMem) {
            setValue(regOrMem = node.dest, value = getValue(arg = node.src))
        }

        override fun visit(node: MoveToReg) {
            setValue(regOrMem = node.dest, value = getValue(arg = node.src))
        }

        override fun visit(node: LoadEffectiveAddress) {
            setValue(regOrMem = node.dest, value = getMemLocation(mem = node.mem))
        }

        private fun visitCmp(minuend: AssemblyArg, subtrahend: AssemblyArg) {
            val m = getValue(arg = minuend)
            val s = getValue(arg = subtrahend)
            flags["eq"] = m == s
            flags["le"] = m <= s
            flags["lt"] = m < s
            flags["z"] = m - s == 0L
        }

        override fun visit(node: CmpConstOrReg) {
            visitCmp(minuend = node.minuend, subtrahend = node.subtrahend)
        }

        override fun visit(node: CmpMem) {
            visitCmp(minuend = node.minuend, subtrahend = node.subtrahend)
        }

        override fun visit(node: SetOnFlag) {
            val doesSetFlag = when (node.type) {
                JumpType.JMP -> throw Error()
                JumpType.JE -> flags["eq"]!!
                JumpType.JNE -> !flags["eq"]!!
                JumpType.JG -> !flags["le"]!!
                JumpType.JGE -> !flags["lt"]!!
                JumpType.JL -> flags["lt"]!!
                JumpType.JLE -> flags["le"]!!
                JumpType.JZ -> flags["z"]!!
                JumpType.JNZ -> !flags["z"]!!
            }
            setValue(node.reg, if (doesSetFlag) 1L else 0L)
        }

        override fun visit(node: JumpLabel) {
            val doesJump = when (node.type) {
                JumpType.JMP -> true
                JumpType.JE -> flags["eq"]!!
                JumpType.JNE -> !flags["eq"]!!
                JumpType.JG -> !flags["le"]!!
                JumpType.JGE -> !flags["lt"]!!
                JumpType.JL -> flags["lt"]!!
                JumpType.JLE -> flags["le"]!!
                JumpType.JZ -> flags["z"]!!
                JumpType.JNZ -> !flags["z"]!!
            }
            if (doesJump) {
                instructionPointer = labelInstructionNumberMapping[node.label]!!
            }
        }

        /**
         * @param arrayPointer the pointer to the array.
         * @return the string of the array.
         */
        private fun readArray(arrayPointer: Long): String {
            val len = getMem(location = arrayPointer - 8).toInt()
            val sb = StringBuilder()
            for (i in 0 until len) {
                sb.append(getMem(location = arrayPointer + i * 8).toInt().toChar())
            }
            return sb.toString()
        }

        override fun visit(node: CallAddress) {
            val savedInstructionPointer = instructionPointer
            val functionExpr = node.address
            if (functionExpr is AssemblyArgs.Const) {
                val (_, functionName) = functionExpr
                if (functionName != null) {
                    when (functionName) {
                        IrNameEncoder.nameOfPrintln -> {
                            val argument = getValue(arg = RDI)
                            printCollector.append(readArray(argument)).append('\n')
                            return
                        }
                        IrNameEncoder.nameOfIntToString -> {
                            val argument = getValue(arg = RDI)
                            val resultArray = argument.toString().toCharArray().map { it.toLong() }.toLongArray()
                            val memStartingPointer = calloc(resultArray.size * 8 + 8.toLong())
                            val unparsedStringStartingPointer = memStartingPointer + 8
                            setMem(memStartingPointer, resultArray.size.toLong())
                            var i = 0
                            while (i < resultArray.size) {
                                setMem(
                                    location = unparsedStringStartingPointer + i * 8,
                                    value = resultArray[i]
                                )
                                i++
                            }
                            setValue(RAX, unparsedStringStartingPointer)
                            return
                        }
                        IrNameEncoder.nameOfStringToInt -> {
                            val strToParse = readArray(getValue(RDI))
                            val value = strToParse.toLongOrNull() ?: throw PanicException("Bad string: $strToParse")
                            setValue(RAX, value)
                            return
                        }
                        IrNameEncoder.nameOfStringConcat -> {
                            val concatString = (readArray(getValue(RDI)) + readArray(getValue(RSI))).toCharArray()
                            val memStartingPointer = calloc(concatString.size * 8 + 8.toLong())
                            setMem(memStartingPointer, concatString.size.toLong())
                            val stringStartPointer = memStartingPointer + 8
                            for (i in concatString.indices) {
                                setMem(stringStartPointer + i * 8, concatString[i].toLong())
                            }
                            setValue(RAX, stringStartPointer)
                            return
                        }
                        IrNameEncoder.nameOfMalloc -> {
                            setValue(RAX, calloc(getValue(RDI)))
                            return
                        }
                        else -> {
                            instructionPointer = labelInstructionNumberMapping[functionName]!!
                            stepUntilReturn()
                            instructionPointer = savedInstructionPointer
                            return
                        }
                    }
                }
            }
            instructionPointer = getValue(functionExpr).toInt()
            stepUntilReturn()
            instructionPointer = savedInstructionPointer
        }

        override fun visit(node: Return) {
            throw ReturnException()
        }

        private fun interpretAlBinaryOpMemDest(
            dest: RegOrMem,
            src: AssemblyArg,
            type: AlBinaryOpType
        ) {
            val srcValue = getValue(arg = src)
            val destValue = getValue(arg = dest)
            val newValue = when (type) {
                AlBinaryOpType.ADD -> destValue + srcValue
                AlBinaryOpType.SUB -> destValue - srcValue
                AlBinaryOpType.XOR -> destValue xor srcValue
            }
            setValue(regOrMem = dest, value = newValue)
        }

        override fun visit(node: AlBinaryOpMemDest) {
            interpretAlBinaryOpMemDest(dest = node.dest, src = node.src, type = node.type)
        }

        override fun visit(node: AlBinaryOpRegDest) {
            interpretAlBinaryOpMemDest(dest = node.dest, src = node.src, type = node.type)
        }

        override fun visit(node: IMulTwoArgs) {
            setValue(
                regOrMem = node.dest,
                value = getValue(node.dest) * getValue(node.src)
            )
        }

        override fun visit(node: IMulThreeArgs) {
            setValue(
                regOrMem = node.dest,
                value = getValue(node.src) * getValue(node.immediate)
            )
        }

        override fun visit(node: Cqo) {
            if (getValue(RAX) >= 0) {
                setValue(regOrMem = RDX, value = 0)
            } else {
                setValue(regOrMem = RDX, value = -1)
            }
        }

        override fun visit(node: IDiv) {
            val raxValue = getValue(RAX)
            val argValue = getValue(node.divisor)
            if (argValue == 0L) {
                throw PanicException("Division by zero!")
            }
            val q = raxValue / argValue
            val r = raxValue % argValue
            setValue(RAX, q)
            setValue(RDX, r)
        }

        override fun visit(node: Neg) {
            setValue(node.dest, -getValue(node.dest))
        }

        override fun visit(node: ShiftLeft) {
            setValue(node.dest, getValue(node.dest) shl node.count)
        }

        override fun visit(node: Push) {
            val value = getValue(node.arg)
            setValue(regOrMem = RSP, value = getValue(RSP) - 8)
            setValue(MEM(reg = RSP), value)
        }

        override fun visit(node: PopRBP) {
            setValue(regOrMem = RBP, value = getValue(MEM(RSP)))
            setValue(regOrMem = RSP, value = getValue(RSP) + 8)
        }

        override fun visit(node: Label): Unit = Unit
        override fun visit(node: Comment): Unit = Unit
    }
}
