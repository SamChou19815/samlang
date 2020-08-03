package samlang.ast.mir

/**
 * The marker interface to indicate that an IR node can be used in canonical form.
 * It does not enforce anything. It's just an indication.
 */
@kotlin.annotation.Retention(AnnotationRetention.BINARY)
@Target(AnnotationTarget.ANNOTATION_CLASS, AnnotationTarget.CLASS)
annotation class Canonical
