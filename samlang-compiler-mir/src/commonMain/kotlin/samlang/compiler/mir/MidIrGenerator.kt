package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.common.IrNameEncoder
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.hir.HighIrModule
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Return
import samlang.optimization.SimpleOptimizations
import samlang.optimization.TailRecursionOptimizer

@ExperimentalStdlibApi
class MidIrGenerator private constructor(
    private val globalResourceAllocator: MidIrGlobalResourceAllocator,
    private val module: HighIrModule
) {
    private val functions: List<MidIrFunction>
    private val globalVariables: Set<GlobalVariable>

    init {
        val functions: MutableList<MidIrFunction> = mutableListOf()
        val globalVariables: MutableSet<GlobalVariable> = LinkedHashSet()
        module.functions.forEach { function ->
            val allocator = MidIrResourceAllocator(
                functionName = function.name,
                globalResourceAllocator = globalResourceAllocator
            )
            val allocatedArgs = function.parameters.map { allocator.allocateTemp(variableName = it) }
            val (loweredStatements, stringGlobalVariables) = MidIrLoweringTranslator.translate(allocator, function.body)
            val mirIrFunction = MidIrFunction(
                functionName = function.name,
                argumentTemps = allocatedArgs,
                mainBodyStatements = SimpleOptimizations.optimizeIr(
                    statements = MidIrTraceReorganizer.reorder(
                        allocator = allocator,
                        originalStatements = loweredStatements + Return()
                    )
                ),
                numberOfArguments = allocatedArgs.size,
                hasReturn = function.hasReturn
            )
            functions += mirIrFunction
            globalVariables += stringGlobalVariables
        }
        this.functions = functions
        this.globalVariables = globalVariables
    }

    companion object {
        fun generate(sources: Sources<HighIrModule>, entryModuleReference: ModuleReference): MidIrCompilationUnit =
            generateWithoutEntry(sources = sources).addMain(entryModuleReference = entryModuleReference)

        fun generateWithMultipleEntries(sources: Sources<HighIrModule>): Sources<MidIrCompilationUnit> {
            val withoutEntry = generateWithoutEntry(sources = sources)
            val irMappings = sources.moduleMappings.mapValues { (moduleReference, _) ->
                withoutEntry.addMain(entryModuleReference = moduleReference)
            }
            return Sources(moduleMappings = irMappings)
        }

        private fun generateWithoutEntry(sources: Sources<HighIrModule>): MidIrCompilationUnit {
            val globalResourceAllocator = MidIrGlobalResourceAllocator()
            val globalVariables = LinkedHashSet<GlobalVariable>()
            val functions = mutableListOf<MidIrFunction>()
            sources.moduleMappings.forEach { (_, module) ->
                val generator = MidIrGenerator(
                    globalResourceAllocator = globalResourceAllocator,
                    module = module
                )
                globalVariables += generator.globalVariables
                functions += generator.functions.map { TailRecursionOptimizer.optimize(it) }
            }
            return MidIrCompilationUnit(globalVariables = globalVariables.toList(), functions = functions)
        }

        private fun MidIrCompilationUnit.addMain(entryModuleReference: ModuleReference): MidIrCompilationUnit =
            SimpleOptimizations.removeUnusedNames(
                irCompilationUnit = MidIrCompilationUnit(
                    globalVariables = globalVariables,
                    functions = functions + getCompiledProgramMainFunction(entryModuleReference = entryModuleReference)
                )
            )

        private fun getCompiledProgramMainFunction(entryModuleReference: ModuleReference): MidIrFunction =
            MidIrFunction(
                functionName = IrNameEncoder.compiledProgramMain,
                argumentTemps = emptyList(),
                mainBodyStatements = listOf(
                    CALL_FUNCTION(
                        functionName = IrNameEncoder.encodeMainFunctionName(moduleReference = entryModuleReference),
                        arguments = emptyList(),
                        returnCollector = null
                    ),
                    Return(returnedExpression = null)
                ),
                numberOfArguments = 0,
                hasReturn = false
            )
    }
}
