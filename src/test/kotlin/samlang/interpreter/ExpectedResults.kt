package samlang.interpreter

val printInterpreterExpectedResult: Map<String, String> = mapOf(
    "and-or-inside-if" to "one",
    "block-in-if-else" to "",
    "builtins" to "42",
    "correct-op" to "OK",
    "different-expr-demo" to "42",
    "different-modules-demo" to "OK",
    "empty" to "",
    "evaluation-order" to (0..25).joinToString(separator = "\n"),
    "function-call-never-ignored" to "hi",
    "generic-object-test" to "2\n42",
    "if-else-consistency" to "3\n3\nOK",
    "if-else-unreachable-1" to "success",
    "if-else-unreachable-2" to "success",
    "map-but-ignore" to "",
    "math-functions" to "24\n55",
    "mutually-recursive" to "OK",
    "optional-semicolon" to "-7",
    "print-hello-world" to "Hello World!",
    "reordering-test" to "OK",
    "short-circuit-and-or" to "0\n1\nfalse\n0\n1\ntrue\n0\nfalse\n0\nfalse\n0\ntrue\n0\ntrue\n0\n1\nfalse\n" +
            "0\n1\ntrue\n0\n1\n0\n1\n0\n0\n0\n0\n0\n1\n0\n1",
    "string-global-constant" to "OK",
    "too-much-interference" to "0",
    "various-syntax-forms" to "84"
)
