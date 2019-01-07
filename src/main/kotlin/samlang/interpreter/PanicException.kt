package samlang.interpreter

class PanicException(reason: String) : RuntimeException("PANIC: $reason")
