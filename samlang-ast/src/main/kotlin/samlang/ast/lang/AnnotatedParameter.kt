package samlang.ast.lang

import samlang.ast.common.Range
import samlang.ast.common.Type

data class AnnotatedParameter(val name: String, val nameRange: Range, val type: Type, val typeRange: Range)
