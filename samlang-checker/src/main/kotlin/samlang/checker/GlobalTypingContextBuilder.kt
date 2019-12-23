package samlang.checker

import kotlinx.collections.immutable.persistentMapOf
import kotlinx.collections.immutable.toPersistentMap
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.ClassDefinition
import samlang.ast.lang.Module
import samlang.checker.GlobalTypingContext.ClassType
import samlang.checker.GlobalTypingContext.ModuleTypingContext
import samlang.checker.GlobalTypingContext.TypeInfo

/**
 * Responsible for building the global typing environment as part of pre-processing phase.
 */
internal object GlobalTypingContextBuilder {

    fun buildGlobalTypingContext(sources: Sources<Module>): GlobalTypingContext {
        val phase1Modules = hashMapOf<ModuleReference, ModuleTypingContext>()
        for ((moduleReference, module) in sources.moduleMappings) {
            phase1Modules[moduleReference] = buildModuleTypingContextPhase1(module = module)
        }
        var phase2Modules = persistentMapOf<ModuleReference, ModuleTypingContext>()
        for ((moduleReference, module) in sources.moduleMappings) {
            val context = phase1Modules[moduleReference] ?: error(message = "Should be there!")
            val updatedModuleContext = buildModuleTypingContextPhase2(
                modules = phase1Modules, moduleTypingContext = context, module = module
            )
            phase2Modules = phase2Modules.put(key = moduleReference, value = updatedModuleContext)
        }
        return GlobalTypingContext(modules = phase2Modules)
    }

    /**
     * @return module's typing context built from reading class definitions, imports are ignored in this phase since
     * they will be patched back in phase 2.
     */
    private fun buildModuleTypingContextPhase1(module: Module): ModuleTypingContext {
        val classes = module.classDefinitions
            .map { classDefinition -> classDefinition.name to buildClassType(classDefinition = classDefinition) }
            .toMap()
            .toPersistentMap()
        return ModuleTypingContext(definedClasses = classes, importedClasses = persistentMapOf())
    }

    /**
     * @return module's typing context built from merging existing class definitions with imported ones. Existing ones
     * are built in phase 1.
     */
    private fun buildModuleTypingContextPhase2(
        modules: Map<ModuleReference, ModuleTypingContext>,
        moduleTypingContext: ModuleTypingContext,
        module: Module
    ): ModuleTypingContext {
        val importedClassTypes = module.imports.mapNotNull { oneImport ->
            val importedModuleContext = modules[oneImport.importedModule] ?: return@mapNotNull null
            oneImport.importedMembers.mapNotNull { (className, _) ->
                importedModuleContext.definedClasses[className]?.let { className to it }
            }
        }.flatten().toMap().toPersistentMap()
        return moduleTypingContext.copy(importedClasses = importedClassTypes)
    }

    /**
     * @return a class type with only typing information, built from [classDefinition].
     */
    private fun buildClassType(classDefinition: ClassDefinition): ClassType {
        val functions = arrayListOf<Pair<String, TypeInfo>>()
        val methods = arrayListOf<Pair<String, TypeInfo>>()
        for (member in classDefinition.members) {
            val name = member.name
            val typeInfo = TypeInfo(
                isPublic = member.isPublic,
                typeParams = member.typeParameters,
                type = member.type
            )
            if (member.isMethod) {
                methods.add(name to typeInfo)
            } else {
                functions.add(name to typeInfo)
            }
        }
        return ClassType(
            typeDefinition = classDefinition.typeDefinition,
            functions = functions.fold(initial = persistentMapOf()) { member, (key, value) ->
                member.put(key = key, value = value)
            },
            methods = methods.fold(initial = persistentMapOf()) { member, (key, value) ->
                member.put(key = key, value = value)
            }
        )
    }
}
