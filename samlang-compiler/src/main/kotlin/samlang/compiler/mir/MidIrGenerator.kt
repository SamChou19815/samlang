package samlang.compiler.mir

import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.common.StringGlobalVariable
import samlang.ast.common.Type
import samlang.ast.hir.HighIrFunction
import samlang.ast.hir.HighIrModule
import samlang.ast.mir.MidIrCompilationUnit
import samlang.ast.mir.MidIrExpression.Temporary
import samlang.ast.mir.MidIrFunction
import samlang.ast.mir.MidIrStatement
import samlang.ast.mir.MidIrStatement.Return

private class MidIrGenerator private constructor(
    private val moduleReference: ModuleReference,
    private val module: HighIrModule
) {
    private val globalResourceAllocator: MidIrGlobalResourceAllocator = MidIrGlobalResourceAllocator()
    private val globalVariables: MutableSet<StringGlobalVariable> = LinkedHashSet()
    private val functions: MutableList<MidIrFunction> = arrayListOf()

    init {
        module.classDefinitions.forEach { classDefinition ->
            val className = classDefinition.className
            classDefinition.members.forEach { member ->
                val encodedFunctionName = NameEncoder.encodeFunctionName(
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
        val loweredBodySequence = function.body
            .map { generator1stPass.translate(statement = it) }
            .map { generator2ndPass.lower(statement = it) }
            .flatten()
            .toList()
        // for safety, always add return. We may be able to optimize it away later.
        var mainBodyStatements: List<MidIrStatement> = loweredBodySequence.toMutableList().apply { add(Return()) }
        mainBodyStatements = TraceReorganizer.reorder(allocator = allocator, originalStatements = mainBodyStatements)
        functions += MidIrFunction(
            functionName = encodedFunctionName,
            argumentTemps = allocatedArgs,
            mainBodyStatements = mainBodyStatements,
            numberOfArguments = allocatedArgs.size,
            hasReturn = function.returnType != Type.unit,
            isPublic = function.isPublic
        )
        functions += generator1stPass.emittedLambdaFunctions
        globalVariables += generator1stPass.stringGlobalVariables
    }

    companion object {
        @JvmStatic
        fun generate(sources: Sources<HighIrModule>): Sources<MidIrCompilationUnit> =
            Sources(
                moduleMappings = sources.moduleMappings.mapValues { (moduleReference, module) ->
                    generateCompilationUnit(moduleReference, module)
                }
            )

        private fun generateCompilationUnit(
            moduleReference: ModuleReference,
            module: HighIrModule
        ): MidIrCompilationUnit {
            val generator = MidIrGenerator(moduleReference = moduleReference, module = module)
            return MidIrCompilationUnit(
                moduleReference = moduleReference,
                globalVariables = generator.globalVariables.toList(),
                functions = generator.functions.asSequence().map { it.functionName to it }.toMap()
            )
        }
    }
}
