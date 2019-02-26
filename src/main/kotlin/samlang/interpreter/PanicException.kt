package samlang.interpreter

/**
 * The universal exception thrown by SAMLANG programs.
 * The name `panic` is inspired by Go.
 * The reason for panic is always required.
 *
 * @param reason the reason of this exception.
 */
class PanicException(val reason: String) : RuntimeException("PANIC: $reason")
