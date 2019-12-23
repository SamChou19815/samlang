package samlang.lsp

import samlang.ast.common.ModuleReference
import samlang.ast.lang.Module
import samlang.checker.DependencyTracker

internal class LanguageServerState {
    private val dependencyTracker: DependencyTracker = DependencyTracker()
    private val rawSources: MutableMap<ModuleReference, String> = hashMapOf()
    private val rawModules: MutableMap<ModuleReference, Module> = hashMapOf()
    private val checkedModules: MutableMap<ModuleReference, Module> = hashMapOf()

    fun initialize() {
    }

    fun update(moduleReference: ModuleReference, sourceCode: String) {
    }

    fun remove(moduleReference: ModuleReference) {
    }
}
