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

class MidIrGenerator private constructor(
    private val globalResourceAllocator: MidIrGlobalResourceAllocator,
    private val moduleReference: ModuleReference,
    private val module: HighIrModule,
    entryModuleReference: ModuleReference
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
        functions += MidIrFunction(
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
        fun generate(sources: Sources<HighIrModule>, entryModuleReference: ModuleReference): MidIrCompilationUnit {
            val globalResourceAllocator = MidIrGlobalResourceAllocator()
            val globalVariables = arrayListOf<GlobalVariable>()
            val functions = arrayListOf<MidIrFunction>()
            sources.moduleMappings.forEach { (moduleReference, module) ->
                val generator = MidIrGenerator(
                    globalResourceAllocator = globalResourceAllocator,
                    moduleReference = moduleReference,
                    module = module,
                    entryModuleReference = entryModuleReference
                )
                globalVariables += generator.globalVariables
                functions += generator.functions
            }
            return MidIrCompilationUnit(globalVariables = globalVariables, functions = functions)
        }

        @JvmStatic
        fun generate(moduleReference: ModuleReference, module: HighIrModule): MidIrCompilationUnit {
            val generator = MidIrGenerator(
                globalResourceAllocator = MidIrGlobalResourceAllocator(),
                moduleReference = moduleReference,
                module = module,
                entryModuleReference = moduleReference
            )
            return MidIrCompilationUnit(
                globalVariables = generator.globalVariables.toList(),
                functions = generator.functions
            )
        }
    }
}
