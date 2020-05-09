package samlang.service

import java.io.File
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSources
import samlang.parser.buildModuleFromText
import samlang.util.createOrFail

object SourceChecker {
    fun typeCheck(sourceHandles: List<Pair<ModuleReference, File>>): Sources<Module> {
        val errorCollector = ErrorCollector()
        val moduleMappings = mutableMapOf<ModuleReference, Module>()
        for ((moduleReference, file) in sourceHandles) {
            val text = file.readText()
            val (module, parseErrors) = buildModuleFromText(moduleReference = moduleReference, text = text)
            parseErrors.forEach { errorCollector.add(compileTimeError = it) }
            moduleMappings[moduleReference] = module
        }
        val (checkedSources, _) = typeCheckSources(
            sources = Sources(moduleMappings = moduleMappings),
            errorCollector = errorCollector
        )
        return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
    }
}
