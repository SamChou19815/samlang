package samlang.ast.checked

data class CheckedModule(
    val name: String,
    val typeDef: CheckedTypeDef?,
    val members: List<CheckedMemberDefinition>
) {

    sealed class CheckedTypeDef {

        abstract val typeParams: List<String>?

        data class ObjectType(
            override val typeParams: List<String>?,
            val mappings: Map<String, CheckedTypeExpr>
        ) : CheckedTypeDef()

        data class VariantType(
            override val typeParams: List<String>?,
            val mappings: Map<String, CheckedTypeExpr>
        ) : CheckedTypeDef()

    }

    data class CheckedMemberDefinition(
        val isPublic: Boolean,
        val isMethod: Boolean,
        val name: String,
        val type: Pair<List<String>?, CheckedTypeExpr.FunctionType>,
        val value: CheckedExpr.Lambda
    )

}
