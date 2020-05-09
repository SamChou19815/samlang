package samlang.compiler.mir

import samlang.ast.common.GlobalVariable
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.common.Type
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrModule
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrNameEncoder
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Companion.CALL_FUNCTION
import samlang.ast.mir.MidIrStatement.Return
import samlang.optimization.SimpleOptimizations
import samlang.optimization.TailRecursionOptimizer

class MidIrGenerator private constructor(
    private val globalResourceAllocator: MidIrGlobalResourceAllocator,
    private val moduleReference: ModuleReference,
    private val module: HighIrModule
) {
    private val globalVariables: MutableSet<GlobalVariable> = LinkedHashSet()
    private val functions: MutableList<MidIrFunction> = arrayListOf()

    init {
        module.classDefinitions.forEach { classDefinition ->
            val className = classDefinition.className
            classDefinition.members.forEach { member ->
                val encodedFunctionName = MidIrNameEncoder.encodeFunctionName(
                    moduleReference = moduleReference,
                    className = className,
                    functionName = member.name
                )
                translateAndAdd(encodedFunctionName = encodedFunctionName, function = member)
            }
        }
    }

    private fun translateAndAdd(encodedFunctionName: String, function: HighIrFunction) {
        val allocator = MidIrResourceAllocator(
            functionName = encodedFunctionName,
            globalResourceAllocator = globalResourceAllocator
        )
        val generator1stPass = MidIrFirstPassGenerator(
            allocator = allocator,
            moduleReference = moduleReference,
            module = module
        )
        val generator2ndPass = MidIrSecondPassGenerator(allocator = allocator)
        val allocatedArgs = arrayListOf<Temporary>()
        if (function.isMethod) {
            // 'this' is the first argument for methods.
            allocatedArgs += allocator.allocateTemp(variableName = "this")
        }
        val args = function.parameters
        args.forEach { (name, _) -> allocatedArgs += allocator.allocateTemp(variableName = name) }
        val mainBodyStatements = cleanupAfterFirstPass(
            statements = function.body.map { generator1stPass.translate(statement = it) },
            generator2ndPass = generator2ndPass,
            allocator = allocator
        )
        functions += MidIrFunction(
            functionName = encodedFunctionName,
            argumentTemps = allocatedArgs,
            mainBodyStatements = mainBodyStatements,
            numberOfArguments = allocatedArgs.size,
            hasReturn = function.returnType != Type.unit,
            isPublic = function.isPublic
        )
        functions += generator1stPass.emittedLambdaFunctions.map { emittedLambdaFunction ->
            val processedLambdaBody: List<MidIrStatement> = cleanupAfterFirstPass(
                statements = emittedLambdaFunction.mainBodyStatements,
                generator2ndPass = generator2ndPass,
                allocator = allocator
            )
            emittedLambdaFunction.copy(mainBodyStatements = processedLambdaBody)
        }
        globalVariables += generator1stPass.stringGlobalVariables
    }

    private fun cleanupAfterFirstPass(
        statements: List<MidIrStatement>,
        generator2ndPass: MidIrSecondPassGenerator,
        allocator: MidIrResourceAllocator
    ): List<MidIrStatement> {
        var processed: List<MidIrStatement> = statements
            .map { generator2ndPass.lower(statement = it) }
            .flatten()
            .toMutableList()
            .apply { add(Return()) }
        processed = MidIrTraceReorganizer.reorder(allocator = allocator, originalStatements = processed)
        processed = SimpleOptimizations.optimizeIr(statements = processed)
        return processed
    }

    companion object {
        @JvmStatic
        fun generate(sources: Sources<HighIrModule>, entryModuleReference: ModuleReference): MidIrCompilationUnit =
            generateWithoutEntry(sources = sources).addMain(entryModuleReference = entryModuleReference)

        @JvmStatic
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
            val functions = arrayListOf<MidIrFunction>()
            sources.moduleMappings.forEach { (moduleReference, module) ->
                val generator = MidIrGenerator(
                    globalResourceAllocator = globalResourceAllocator,
                    moduleReference = moduleReference,
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
                functionName = MidIrNameEncoder.compiledProgramMain,
                argumentTemps = emptyList(),
                mainBodyStatements = listOf(
                    CALL_FUNCTION(
                        functionName = MidIrNameEncoder.encodeMainFunctionName(moduleReference = entryModuleReference),
                        arguments = emptyList(),
                        returnCollector = null
                    ),
                    Return(returnedExpression = null)
                ),
                numberOfArguments = 0,
                hasReturn = false,
                isPublic = true
            )
    }
}
