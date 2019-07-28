package samlang.ast.lang

import samlang.ast.common.ModuleReference

data class Sources(val moduleMappings: Map<ModuleReference, Module>)
