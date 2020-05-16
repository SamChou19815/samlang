package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import kotlinx.collections.immutable.persistentMapOf
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.common.BinaryOperator
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.Type.Companion.bool
import samlang.ast.common.Type.Companion.int
import samlang.ast.common.Type.Companion.string
import samlang.ast.common.Type.Companion.unit
import samlang.ast.common.Type.FunctionType
import samlang.ast.common.Type.TupleType
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.Expression
import samlang.ast.lang.Expression.FunctionApplication
import samlang.ast.lang.Expression.IfElse
import samlang.ast.lang.Expression.Lambda
import samlang.ast.lang.Expression.Literal
import samlang.ast.lang.Expression.StatementBlockExpression
import samlang.ast.lang.Expression.Variable
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock
import samlang.parser.buildExpressionFromText

class ExpressionTypeCheckerTest : StringSpec() {
    init {
        "Simple literal type checks under correct expected type." {
            assertCheck(source = "true", expectedType = bool)
            assertCheck(source = "false", expectedType = bool)
            assertCheck(source = "42", expectedType = int)
            assertCheck(source = "\"a\"", expectedType = string)
        }
        "Simple literal does not type check under wrong expected type." {
            assertCheck(
                source = "true",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:5: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "false",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "42",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:3: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "\"a\"",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:4: [UnexpectedType]: Expected: `unit`, actual: `string`.")
            )
        }
        "This not inside a function does not type check." {
            assertCheck(
                source = "this",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:5: [IllegalThis]: Keyword `this` cannot be used in this context."
                )
            )
        }
        "Undefined variable does not type check." {
            assertCheck(
                source = "foo",
                expectedType = int,
                expectedExpression = Variable(
                    range = range(r = "1:1-1:4"),
                    type = int,
                    name = "foo"
                ),
                expectedErrors = listOf("Test.sam:1:1-1:4: [UnresolvedName]: Name `foo` is not resolved.")
            )
        }
        "Defined variable with correct expected type type checks." {
            assertCheck(source = "{ val foo = 3; foo }", expectedType = int)
        }
        "Defined variable with wrong expected type does not type check." {
            assertCheck(
                source = "{ val foo = true; foo }",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
        }
        "Defined class member type checks." {
            assertCheck(
                source = "Test.helloWorld",
                expectedType = FunctionType(argumentTypes = listOf(string), returnType = unit)
            )
        }
        "Undefined class member does not type check." {
            assertCheck(
                source = "Test.helloWorld2",
                expectedType = FunctionType(argumentTypes = listOf(string), returnType = unit),
                expectedErrors = listOf("Test.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved.")
            )
        }
        "Good tuple constructor type checks." {
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = TupleType(mappings = listOf(int, int, int))
            )
        }
        "Tuple constructor with wrong expected type does not type check." {
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = TupleType(mappings = listOf(int, int, bool)),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:10: [UnexpectedType]: Expected: `[int * int * bool]`, actual: `[int * int * int]`."
                )
            )
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:10: [UnexpectedType]: Expected: `int`, actual: `[int * int * int]`.",
                    "Test.sam:1:1-1:10: [UnexpectedTypeKind]: Expect kind: `tuple`, actual: `int`."
                )
            )
        }
        "Good field constructor with correct field types type checks." {
            assertCheck(source = "{foo:true,bar:3}", expectedType = Type.id(identifier = "Test"))
            assertCheck(source = "{ val foo=true; {foo,bar:3} }", expectedType = Type.id(identifier = "Test"))
        }
        "Bad field constructor with wrong field types does not type check." {
            assertCheck(
                source = "{foo:true,bar:false}",
                expectedType = Type.id(identifier = "Test"),
                expectedErrors = listOf("Test.sam:1:11-1:14: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "{ val foo=3; {foo,bar:3} }",
                expectedType = Type.id(identifier = "Test"),
                expectedErrors = listOf("Test.sam:1:15-1:18: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
        }
        "Field constructor with non-identifier type as expected type does not type check." {
            assertCheck(
                source = "{foo:true,bar:3}",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:17: [UnexpectedType]: Expected: `int`, actual: `Test`.",
                    "Test.sam:1:1-1:17: [UnexpectedTypeKind]: Expect kind: `class`, actual: `int`."
                )
            )
        }
        "Constructing variant inside object class does not type check." {
            assertCheck(
                source = "Foo(true)",
                expectedType = Type.id(identifier = "Test2"),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:10: [UnsupportedClassTypeDefinition]: " +
                            "Expect the current class to have `variant` type definition, but it doesn't."
                )
            )
            assertCheck(
                source = "Bar(42)",
                expectedType = Type.id(identifier = "Test2"),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:8: [UnsupportedClassTypeDefinition]: " +
                            "Expect the current class to have `variant` type definition, but it doesn't."
                )
            )
        }
        "Good field and method access type checks." {
            assertCheck(source = "{foo:true,bar:3}.foo", expectedType = bool)
            assertCheck(source = "{foo:true,bar:3}.bar", expectedType = int)
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = FunctionType(argumentTypes = listOf(int), returnType = bool)
            )
        }
        "Field and method access with bad expected type does not type check." {
            assertCheck(
                source = "{foo:true,bar:3}.foo",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "{foo:true,bar:3}.bar",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:1-1:21: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = FunctionType(argumentTypes = listOf(bool), returnType = int),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`."
                )
            )
        }
        "Field and method access with insufficient type info does not type check." {
            assertCheck(
                source = "{ val _ = (t) -> t.foo; }",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
            assertCheck(
                source = "{ val _ = (t) -> t.bar; }",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
            assertCheck(
                source = "{ val _ = (t) -> t.baz; }",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
        }
        "Good unary expressions type check." {
            assertCheck(source = "-(1)", expectedType = int)
            assertCheck(source = "!true", expectedType = bool)
            assertCheck(source = "!false", expectedType = bool)
        }
        "Bad unary expressions do not type check." {
            assertCheck(
                source = "-(false)",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:3-1:8: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "!1",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:2-1:3: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "-(1+1)",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "!true",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "!false",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
        }
        "Panic with string argument type checks." {
            assertCheck(source = "panic(\"\")", expectedType = unit)
            assertCheck(source = "panic(\"\")", expectedType = bool)
            assertCheck(source = "panic(\"\")", expectedType = int)
            assertCheck(source = "panic(\"\")", expectedType = string)
            assertCheck(source = "panic(\"\")", expectedType = TupleType(mappings = listOf(int, bool)))
        }
        "Panic with non-string argument does not type check." {
            assertCheck(
                source = "panic(3)",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.")
            )
        }
        "Good function application type checks." {
            assertCheck(source = "Test.helloWorld(\"\")", expectedType = unit)
            assertCheck(source = "{foo:true,bar:3}.baz(3)", expectedType = bool)
            assertCheck(source = "((i) -> true)(3)", expectedType = bool)
        }
        "Calling a non-function does not type check." {
            assertCheck(
                source = "3(3)",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:2: [UnexpectedType]: Expected: `(int) -> unit`, actual: `int`.",
                    "Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expect kind: `function`, actual: `int`."
                )
            )
        }
        "Function application with bad arguments does not type check." {
            assertCheck(
                source = "Test.helloWorld(3)",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(int) -> unit`, actual: `(string) -> unit`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz({})",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "((i: int) -> true)({})",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:2-1:18: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`."
                )
            )
        }
        "Function application with bad return type does not type check." {
            assertCheck(
                source = "Test.helloWorld(\"\")",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(string) -> bool`, actual: `(string) -> unit`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz(3)",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(int) -> int`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "((i) -> true)(3)",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:2-1:13: [UnexpectedType]: Expected: `(int) -> int`, actual: `(__UNDECIDED__) -> bool`."
                )
            )
        }
        "Good binary expressions type check." {
            assertCheck(source = "1 * 1", expectedType = int)
            assertCheck(source = "1 - 1", expectedType = int)
            assertCheck(source = "1 % 1", expectedType = int)
            assertCheck(source = "1 + 1", expectedType = int)
            assertCheck(source = "1 - 1", expectedType = int)
            assertCheck(source = "1 < 1", expectedType = bool)
            assertCheck(source = "1 <= 1", expectedType = bool)
            assertCheck(source = "1 > 1", expectedType = bool)
            assertCheck(source = "1 >= 1", expectedType = bool)
            assertCheck(source = "true || false", expectedType = bool)
            assertCheck(source = "false && true", expectedType = bool)
            assertCheck(source = "1 == 1", expectedType = bool)
            assertCheck(source = "true == false", expectedType = bool)
            assertCheck(source = "false != true", expectedType = bool)
            assertCheck(source = "\"\" != \"3\"", expectedType = bool)
            assertCheck(source = "{ val _ = (t, f) -> t == f; }", expectedType = unit)
        }
        "Binary expressions with bad arguments do not type check." {
            assertCheck(
                source = "\"1\" * \"1\"",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.",
                    "Test.sam:1:7-1:10: [UnexpectedType]: Expected: `int`, actual: `string`."
                )
            )
            assertCheck(
                source = "\"1\" - 1",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.")
            )
            assertCheck(
                source = "1 % \"1\"",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:5-1:8: [UnexpectedType]: Expected: `int`, actual: `string`.")
            )
            assertCheck(
                source = "1 + false",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:5-1:10: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "false - 1",
                expectedType = int,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "\"\" < false",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:3: [UnexpectedType]: Expected: `int`, actual: `string`.",
                    "Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 <= false",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "1 > \"\"",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:5-1:7: [UnexpectedType]: Expected: `int`, actual: `string`.")
            )
            assertCheck(
                source = "true >= 1",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "false || 4",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:10-1:11: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "2 && 3",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:2: [UnexpectedType]: Expected: `bool`, actual: `int`.",
                    "Test.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 == false",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "true == 3",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "true != 3",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "\"\" != 3",
                expectedType = bool,
                expectedErrors = listOf("Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.")
            )
            assertCheck(
                source = "{ val _ = (t: int, f: bool) -> t == f; }",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:37-1:38: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
        }
        "Binary expressions with bad expected type do not type check." {
            assertCheck(
                source = "1 * 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "1 - 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "1 % 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "1 + 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "1 - 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "1 < 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "1 <= 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "1 > 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "1 >= 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "true || false",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "false && true",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "1 == 1",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "true == false",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "true != true",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:13: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "\"\" != \"3\"",
                expectedType = unit,
                expectedErrors = listOf("Test.sam:1:1-1:10: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
        }
        "Good if else type checks." {
            assertCheck(source = "if true then false else true", expectedType = bool)
            assertCheck(source = "if false then 1 else 0", expectedType = int)
            assertCheck(source = "if false then \"\" else \"\"", expectedType = string)
            assertCheck(
                source = "{ val _ = (b, t, f: int) -> if b then t else f }",
                expectedType = unit,
                expectedExpression = StatementBlockExpression(
                    range = range(r = "1:1-1:49"),
                    type = unit,
                    block = StatementBlock(
                        range = range(r = "1:1-1:49"),
                        statements = listOf(
                            Statement.Val(
                                range = range(r = "1:3-1:47"),
                                pattern = Pattern.WildCardPattern(range = range(r = "1:7-1:8")),
                                typeAnnotation = FunctionType(
                                    argumentTypes = listOf(bool, int, int),
                                    returnType = int
                                ),
                                assignedExpression = Lambda(
                                    range = range(r = "1:11-1:47"),
                                    type = FunctionType(
                                        argumentTypes = listOf(bool, int, int),
                                        returnType = int
                                    ),
                                    parameters = listOf("b" to bool, "t" to int, "f" to int),
                                    captured = emptyMap(),
                                    body = IfElse(
                                        range = range(r = "1:29-1:47"),
                                        type = int,
                                        boolExpression = Variable(
                                            range = range(r = "1:32-1:33"),
                                            type = bool,
                                            name = "b"
                                        ),
                                        e1 = Variable(
                                            range = range(r = "1:39-1:40"),
                                            type = int,
                                            name = "t"
                                        ),
                                        e2 = Variable(
                                            range = range(r = "1:46-1:47"),
                                            type = int,
                                            name = "f"
                                        )
                                    )
                                )
                            )
                        ),
                        expression = null
                    )
                )
            )
            assertCheck(
                source = "{ val _ = (b, t: int, f) -> if b then t else f }",
                expectedType = unit
            )
        }
        "Bad if else does not type check." {
            assertCheck(
                source = "if true then false else 1",
                expectedType = bool,
                expectedErrors = listOf(
                    "Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.",
                    "Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "if false then 1 else false",
                expectedType = int,
                expectedErrors = listOf(
                    "Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.",
                    "Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "if false then \"\" else 3",
                expectedType = string,
                expectedErrors = listOf(
                    "Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.",
                    "Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`."
                )
            )
            assertCheck(
                source = "{ val _ = (b, t: bool, f: int) -> if b then t else f }",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:52-1:53: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
        }
        "Match variant inside object class does not type check." {
            assertCheck(
                source = "{ val _ = (t: Test2) -> match (t) { | Foo _ -> 1 | Bar s -> 2 }; }",
                expectedType = unit,
                expectedErrors = listOf(
                    "Test.sam:1:32-1:33: [IllegalOtherClassMatch]: " +
                            "It is illegal to match on a value of other class's type."
                )
            )
        }
        "Good lambda type checks." {
            assertCheck(source = "{val _ = (a, b, c) -> if a(b + 1) then b else c;}".trimIndent(), expectedType = unit)
            val source = """
                            {
                                val f = (a, b, c) -> {
                                    val f = (d, e) -> a + b + c + d + e;
                                    f(1, 2)
                                };
                                f(3, 4, 5)
                            }
                         """.trimIndent()
            val expectedExpression = StatementBlockExpression(
                range = range(r = "1:1-7:2"),
                type = int,
                block = StatementBlock(
                    range = range(r = "1:1-7:2"),
                    statements = listOf(
                        Statement.Val(
                            range = range(r = "2:5-5:7"),
                            pattern = Pattern.VariablePattern(range = range(r = "2:9-2:10"), name = "f"),
                            typeAnnotation = FunctionType(argumentTypes = listOf(int, int, int), returnType = int),
                            assignedExpression = Lambda(
                                range = range(r = "2:13-5:6"),
                                type = FunctionType(argumentTypes = listOf(int, int, int), returnType = int),
                                parameters = listOf("a" to int, "b" to int, "c" to int),
                                captured = emptyMap(),
                                body = StatementBlockExpression(
                                    range = range(r = "2:26-5:6"),
                                    type = int,
                                    block = StatementBlock(
                                        range = range(r = "2:26-5:6"),
                                        statements = listOf(
                                            Statement.Val(
                                                range = range(r = "3:9-3:45"),
                                                pattern = Pattern.VariablePattern(
                                                    range = range(r = "3:13-3:14"),
                                                    name = "f"
                                                ),
                                                typeAnnotation = FunctionType(
                                                    argumentTypes = listOf(int, int),
                                                    returnType = int
                                                ),
                                                assignedExpression = Lambda(
                                                    range = range(r = "3:17-3:44"),
                                                    type = FunctionType(
                                                        argumentTypes = listOf(int, int),
                                                        returnType = int
                                                    ),
                                                    parameters = listOf("d" to int, "e" to int),
                                                    captured = mapOf("a" to int, "b" to int, "c" to int),
                                                    body = Expression.Binary(
                                                        range = range(r = "3:27-3:44"),
                                                        type = int,
                                                        operator = BinaryOperator.PLUS,
                                                        e1 = Expression.Binary(
                                                            range = range(r = "3:27-3:40"),
                                                            type = int,
                                                            operator = BinaryOperator.PLUS,
                                                            e1 = Expression.Binary(
                                                                range = range(r = "3:27-3:36"),
                                                                type = int,
                                                                operator = BinaryOperator.PLUS,
                                                                e1 = Expression.Binary(
                                                                    range = range(r = "3:27-3:32"),
                                                                    type = int,
                                                                    operator = BinaryOperator.PLUS,
                                                                    e1 = Variable(
                                                                        range = range(r = "3:27-3:28"),
                                                                        type = int,
                                                                        name = "a"
                                                                    ),
                                                                    e2 = Variable(
                                                                        range = range(r = "3:31-3:32"),
                                                                        type = int,
                                                                        name = "b"
                                                                    )
                                                                ),
                                                                e2 = Variable(
                                                                    range = range(r = "3:35-3:36"),
                                                                    type = int,
                                                                    name = "c"
                                                                )
                                                            ),
                                                            e2 = Variable(
                                                                range = range(r = "3:39-3:40"),
                                                                type = int,
                                                                name = "d"
                                                            )
                                                        ),
                                                        e2 = Variable(
                                                            range = range(r = "3:43-3:44"),
                                                            type = int,
                                                            name = "e"
                                                        )
                                                    )
                                                )
                                            )
                                        ),
                                        expression = FunctionApplication(
                                            range = range(r = "4:9-4:16"),
                                            type = int,
                                            functionExpression = Variable(
                                                range = range(r = "4:9-4:10"),
                                                type = FunctionType(argumentTypes = listOf(int, int), returnType = int),
                                                name = "f"
                                            ),
                                            arguments = listOf(
                                                Literal.ofInt(range = range(r = "4:11-4:12"), value = 1),
                                                Literal.ofInt(range = range(r = "4:14-4:15"), value = 2)
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    expression = FunctionApplication(
                        range = range(r = "6:5-6:15"),
                        type = int,
                        functionExpression = Variable(
                            range = range(r = "6:5-6:6"),
                            type = FunctionType(argumentTypes = listOf(int, int, int), returnType = int),
                            name = "f"
                        ),
                        arguments = listOf(
                            Literal.ofInt(range = range(r = "6:7-6:8"), value = 3),
                            Literal.ofInt(range = range(r = "6:10-6:11"), value = 4),
                            Literal.ofInt(range = range(r = "6:13-6:14"), value = 5)
                        )
                    )
                )
            )
            assertCheck(
                source = source,
                expectedType = int,
                expectedExpression = expectedExpression
            )
        }
    }

    private companion object {
        private val dummyModuleReference: ModuleReference = ModuleReference(moduleName = "Test")
        private val accessibleGlobalTypingContext: AccessibleGlobalTypingContext = AccessibleGlobalTypingContext(
            classes = persistentMapOf(
                "Test" to GlobalTypingContext.ClassType(
                    typeDefinition = TypeDefinition(
                        range = Range.DUMMY,
                        type = TypeDefinitionType.OBJECT,
                        typeParameters = emptyList(),
                        names = listOf("foo", "bar"),
                        mappings = mapOf(
                            "foo" to TypeDefinition.FieldType(type = bool, isPublic = true),
                            "bar" to TypeDefinition.FieldType(type = int, isPublic = false)
                        )
                    ),
                    functions = persistentMapOf(
                        "helloWorld" to GlobalTypingContext.TypeInfo(
                            isPublic = false,
                            typeParams = emptyList(),
                            type = FunctionType(argumentTypes = listOf(string), returnType = unit)
                        )
                    ),
                    methods = persistentMapOf(
                        "baz" to GlobalTypingContext.TypeInfo(
                            isPublic = false,
                            typeParams = emptyList(),
                            type = FunctionType(argumentTypes = listOf(int), returnType = bool)
                        )
                    )
                ),
                "Test2" to GlobalTypingContext.ClassType(
                    typeDefinition = TypeDefinition(
                        range = Range.DUMMY,
                        type = TypeDefinitionType.VARIANT,
                        typeParameters = emptyList(),
                        names = listOf("Foo", "Bar"),
                        mappings = mapOf(
                            "Foo" to TypeDefinition.FieldType(type = bool, isPublic = true),
                            "Bar" to TypeDefinition.FieldType(type = int, isPublic = false)
                        )
                    ),
                    functions = persistentMapOf(),
                    methods = persistentMapOf()
                )
            ),
            typeParameters = persistentSetOf(),
            currentClass = "Test"
        )

        private fun range(r: String): Range {
            val (start, end) = r.split("-").map { position(p = it) }
            return Range(start = start, end = end)
        }

        private fun position(p: String): Position {
            val (line, column) = p.split(":").map { it.toInt() - 1 }
            return Position(line = line, column = column)
        }

        fun assertCheck(
            source: String,
            expectedType: Type,
            expectedExpression: Expression? = null,
            expectedErrors: List<String> = emptyList()
        ) {
            val (parsedExpression, actualParserErrors) = buildExpressionFromText(
                moduleReference = dummyModuleReference,
                source = source
            )
            parsedExpression ?: error(message = "Parsed expression should not be null!")
            actualParserErrors shouldBe emptyList()
            val errorCollector = ErrorCollector()
            val actualExpression = typeCheckExpression(
                expression = parsedExpression,
                errorCollector = errorCollector,
                accessibleGlobalTypingContext = accessibleGlobalTypingContext,
                localTypingContext = LocalTypingContext(),
                resolution = TypeResolution(),
                expectedType = expectedType
            )
            if (expectedExpression != null) {
                actualExpression shouldBe expectedExpression
            }
            val transformedActualErrors = errorCollector.collectedErrors.map {
                it.withErrorModule(moduleReference = dummyModuleReference).errorMessage
            }
            transformedActualErrors shouldBe expectedErrors
        }
    }
}
