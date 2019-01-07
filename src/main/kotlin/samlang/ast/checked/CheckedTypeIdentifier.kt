package samlang.ast.checked

data class CheckedTypeIdentifier(val modulePrefix: String?, val typeName: String) {

    override fun toString(): String = if (modulePrefix == null) typeName else "$modulePrefix.$typeName"

}
