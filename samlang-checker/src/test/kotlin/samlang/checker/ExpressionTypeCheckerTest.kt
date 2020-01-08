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
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.Expression
import samlang.ast.lang.Pattern
import samlang.ast.lang.Statement
import samlang.ast.lang.StatementBlock
import samlang.parser.ExpressionBuilder

class ExpressionTypeCheckerTest : StringSpec() {
    init {
        "Simple literal type checks under correct expected type." {
            assertCheck(
                source = "unit",
                expectedType = Type.unit,
                expectedExpression = Expression.Literal.ofUnit(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 4))
                )
            )
            assertCheck(
                source = "true",
                expectedType = Type.bool,
                expectedExpression = Expression.Literal.ofTrue(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 4))
                )
            )
            assertCheck(
                source = "false",
                expectedType = Type.bool,
                expectedExpression = Expression.Literal.ofFalse(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 5))
                )
            )
            assertCheck(
                source = "42",
                expectedType = Type.int,
                expectedExpression = Expression.Literal.ofInt(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 2)),
                    value = 42
                )
            )
            assertCheck(
                source = "\"a\"",
                expectedType = Type.string,
                expectedExpression = Expression.Literal.ofString(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 3)),
                    value = "a"
                )
            )
        }
        "Simple literal does not type check under wrong expected type." {
            assertCheck(
                source = "unit",
                expectedType = Type.int,
                expectedErrors = listOf("Test.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `unit`.")
            )
            assertCheck(
                source = "true",
                expectedType = Type.unit,
                expectedErrors = listOf("Test.sam:1:1-1:5: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "false",
                expectedType = Type.unit,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`.")
            )
            assertCheck(
                source = "42",
                expectedType = Type.unit,
                expectedErrors = listOf("Test.sam:1:1-1:3: [UnexpectedType]: Expected: `unit`, actual: `int`.")
            )
            assertCheck(
                source = "\"a\"",
                expectedType = Type.unit,
                expectedErrors = listOf("Test.sam:1:1-1:4: [UnexpectedType]: Expected: `unit`, actual: `string`.")
            )
        }
        "This not inside a function does not type check." {
            assertCheck(
                source = "this",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:5: [IllegalThis]: Keyword `this` cannot be used in this context."
                )
            )
        }
        "Undefined variable does not type check." {
            assertCheck(
                source = "foo",
                expectedType = Type.int,
                expectedExpression = Expression.Variable(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 3)),
                    type = Type.int,
                    name = "foo"
                ),
                expectedErrors = listOf("Test.sam:1:1-1:4: [UnresolvedName]: Name `foo` is not resolved.")
            )
        }
        "Defined variable with correct expected type type checks." {
            assertCheck(source = "{ val foo = 3; foo }", expectedType = Type.int)
        }
        "Defined variable with wrong expected type does not type check." {
            assertCheck(
                source = "{ val foo = true; foo }",
                expectedType = Type.int,
                expectedErrors = listOf("Test.sam:1:19-1:22: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
        }
        "Defined class member type checks." {
            assertCheck(
                source = "Test.helloWorld",
                expectedType = Type.FunctionType(argumentTypes = listOf(Type.string), returnType = Type.unit)
            )
        }
        "Undefined class member does not type check." {
            assertCheck(
                source = "Test.helloWorld2",
                expectedType = Type.FunctionType(argumentTypes = listOf(Type.string), returnType = Type.unit),
                expectedErrors = listOf("Test.sam:1:1-1:17: [UnresolvedName]: Name `Test.helloWorld2` is not resolved.")
            )
        }
        "Good tuple constructor type checks." {
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = Type.TupleType(mappings = listOf(Type.int, Type.int, Type.int))
            )
        }
        "Tuple constructor with wrong expected type does not type check." {
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = Type.TupleType(mappings = listOf(Type.int, Type.int, Type.bool)),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:10: [UnexpectedType]: Expected: `[int * int * bool]`, actual: `[int * int * int]`."
                )
            )
            assertCheck(
                source = "[1, 2, 3]",
                expectedType = Type.int,
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
                expectedType = Type.int,
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
            assertCheck(source = "{foo:true,bar:3}.foo", expectedType = Type.bool)
            assertCheck(source = "{foo:true,bar:3}.bar", expectedType = Type.int)
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = Type.FunctionType(argumentTypes = listOf(Type.int), returnType = Type.bool)
            )
        }
        "Field and method access with bad expected type does not type check." {
            assertCheck(
                source = "{foo:true,bar:3}.foo",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.bar",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `int`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz",
                expectedType = Type.FunctionType(argumentTypes = listOf(Type.bool), returnType = Type.int),
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(bool) -> int`, actual: `(int) -> bool`."
                )
            )
        }
        "Field and method access with insufficient type info does not type check." {
            assertCheck(
                source = "{ val _ = (t) -> t.foo; }",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
            assertCheck(
                source = "{ val _ = (t) -> t.bar; }",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
            assertCheck(
                source = "{ val _ = (t) -> t.baz; }",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:18-1:19: [InsufficientTypeInferenceContext]: " +
                            "There is not enough context information to decide the type of this expression."
                )
            )
        }
        "Good unary expressions type check." {
            assertCheck(source = "-(1)", expectedType = Type.int)
            assertCheck(source = "!true", expectedType = Type.bool)
            assertCheck(source = "!false", expectedType = Type.bool)
        }
        "Bad unary expressions do not type check." {
            assertCheck(
                source = "-(false)",
                expectedType = Type.int,
                expectedErrors = listOf("Test.sam:1:3-1:8: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "!1",
                expectedType = Type.bool,
                expectedErrors = listOf("Test.sam:1:2-1:3: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "-(1+1)",
                expectedType = Type.bool,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.")
            )
            assertCheck(
                source = "!true",
                expectedType = Type.int,
                expectedErrors = listOf("Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
            assertCheck(
                source = "!false",
                expectedType = Type.int,
                expectedErrors = listOf("Test.sam:1:1-1:7: [UnexpectedType]: Expected: `int`, actual: `bool`.")
            )
        }
        "Panic with string argument type checks." {
            assertCheck(source = "panic(\"\")", expectedType = Type.unit)
            assertCheck(source = "panic(\"\")", expectedType = Type.bool)
            assertCheck(source = "panic(\"\")", expectedType = Type.int)
            assertCheck(source = "panic(\"\")", expectedType = Type.string)
            assertCheck(source = "panic(\"\")", expectedType = Type.TupleType(mappings = listOf(Type.int, Type.bool)))
        }
        "Panic with non-string argument does not type check." {
            assertCheck(
                source = "panic(3)",
                expectedType = Type.unit,
                expectedErrors = listOf("Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`.")
            )
        }
        "Good function application type checks." {
            assertCheck(source = "Test.helloWorld(\"\")", expectedType = Type.unit)
            assertCheck(source = "{foo:true,bar:3}.baz(3)", expectedType = Type.bool)
            assertCheck(source = "((i) -> true)(3)", expectedType = Type.bool)
        }
        "Calling a non-function does not type check." {
            assertCheck(
                source = "3(3)",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:2: [UnexpectedType]: Expected: `(int) -> unit`, actual: `int`.",
                    "Test.sam:1:1-1:2: [UnexpectedTypeKind]: Expect kind: `function`, actual: `int`."
                )
            )
        }
        "Function application with bad arguments does not type check." {
            assertCheck(
                source = "Test.helloWorld(3)",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(int) -> unit`, actual: `(string) -> unit`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz(unit)",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "((i: int) -> true)(unit)",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:2-1:18: [UnexpectedType]: Expected: `(unit) -> bool`, actual: `(int) -> bool`."
                )
            )
        }
        "Function application with bad return type does not type check." {
            assertCheck(
                source = "Test.helloWorld(\"\")",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:16: [UnexpectedType]: Expected: `(string) -> bool`, actual: `(string) -> unit`."
                )
            )
            assertCheck(
                source = "{foo:true,bar:3}.baz(3)",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:21: [UnexpectedType]: Expected: `(int) -> int`, actual: `(int) -> bool`."
                )
            )
            assertCheck(
                source = "((i) -> true)(3)",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:2-1:13: [UnexpectedType]: Expected: `(int) -> int`, actual: `(__UNDECIDED__) -> bool`."
                )
            )
        }
        "Good binary expressions type check." {
            assertCheck(source = "1 * 1", expectedType = Type.int)
            assertCheck(source = "1 - 1", expectedType = Type.int)
            assertCheck(source = "1 % 1", expectedType = Type.int)
            assertCheck(source = "1 + 1", expectedType = Type.int)
            assertCheck(source = "1 - 1", expectedType = Type.int)
            assertCheck(source = "1 < 1", expectedType = Type.bool)
            assertCheck(source = "1 <= 1", expectedType = Type.bool)
            assertCheck(source = "1 > 1", expectedType = Type.bool)
            assertCheck(source = "1 >= 1", expectedType = Type.bool)
            assertCheck(source = "true || false", expectedType = Type.bool)
            assertCheck(source = "false && true", expectedType = Type.bool)
            assertCheck(source = "1 == 1", expectedType = Type.bool)
            assertCheck(source = "true == false", expectedType = Type.bool)
            assertCheck(source = "unit != unit", expectedType = Type.bool)
            assertCheck(source = "\"\" != \"3\"", expectedType = Type.bool)
            assertCheck(source = "{ val _ = (t, f) -> t == f; }", expectedType = Type.unit)
        }
        "Binary expressions with bad arguments do not type check." {
            assertCheck(
                source = "\"1\" * \"1\"",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`.",
                    "Test.sam:1:7-1:10: [UnexpectedType]: Expected: `int`, actual: `string`."
                )
            )
            assertCheck(
                source = "\"1\" - 1",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:4: [UnexpectedType]: Expected: `int`, actual: `string`."
                )
            )
            assertCheck(
                source = "1 % \"1\"",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:5-1:8: [UnexpectedType]: Expected: `int`, actual: `string`."
                )
            )
            assertCheck(
                source = "1 + unit",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:5-1:9: [UnexpectedType]: Expected: `int`, actual: `unit`."
                )
            )
            assertCheck(
                source = "false - 1",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "\"\" < false",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:3: [UnexpectedType]: Expected: `int`, actual: `string`.",
                    "Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 <= false",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 > \"\"",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:5-1:7: [UnexpectedType]: Expected: `int`, actual: `string`."
                )
            )
            assertCheck(
                source = "true >= 1",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:5: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "unit || 4",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:5: [UnexpectedType]: Expected: `bool`, actual: `unit`.",
                    "Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "2 && 3",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`.",
                    "Test.sam:1:6-1:7: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 == false",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:6-1:11: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "true == 3",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:9-1:10: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "unit != 3",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:9-1:10: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "\"\" != 3",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:7-1:8: [UnexpectedType]: Expected: `string`, actual: `int`."
                )
            )
            assertCheck(
                source = "{ val _ = (t: int, f: bool) -> t == f; }",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:37-1:38: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
        }
        "Binary expressions with bad expected type do not type check." {
            assertCheck(
                source = "1 * 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 - 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 % 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 + 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 - 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "1 < 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 <= 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 > 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:6: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 >= 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "true || false",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "false && true",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "1 == 1",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:7: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "true == false",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:14: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "unit != unit",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:13: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
            assertCheck(
                source = "\"\" != \"3\"",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:1-1:10: [UnexpectedType]: Expected: `unit`, actual: `bool`."
                )
            )
        }
        "Good if else type checks." {
            assertCheck(source = "if true then unit else unit", expectedType = Type.unit)
            assertCheck(source = "if true then false else true", expectedType = Type.bool)
            assertCheck(source = "if false then 1 else 0", expectedType = Type.int)
            assertCheck(source = "if false then \"\" else \"\"", expectedType = Type.string)
            assertCheck(
                source = "{ val _ = (b, t, f: int) -> if b then t else f }",
                expectedType = Type.unit,
                expectedExpression = Expression.StatementBlockExpression(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 48)),
                    type = Type.unit,
                    block = StatementBlock(
                        range = Range(start = Position(line = 0, column = 0), end = Position(line = 0, column = 48)),
                        statements = listOf(
                            Statement.Val(
                                range = Range(
                                    start = Position(line = 0, column = 2),
                                    end = Position(line = 0, column = 46)
                                ),
                                pattern = Pattern.WildCardPattern(
                                    range = Range(
                                        start = Position(line = 0, column = 6),
                                        end = Position(line = 0, column = 7)
                                    )
                                ),
                                typeAnnotation = Type.FunctionType(
                                    argumentTypes = listOf(Type.bool, Type.int, Type.int),
                                    returnType = Type.int
                                ),
                                assignedExpression = Expression.Lambda(
                                    range = Range(
                                        start = Position(line = 0, column = 10),
                                        end = Position(line = 0, column = 46)
                                    ),
                                    type = Type.FunctionType(
                                        argumentTypes = listOf(Type.bool, Type.int, Type.int),
                                        returnType = Type.int
                                    ),
                                    parameters = listOf("b" to Type.bool, "t" to Type.int, "f" to Type.int),
                                    captured = emptyMap(),
                                    body = Expression.IfElse(
                                        range = Range(
                                            start = Position(line = 0, column = 28),
                                            end = Position(line = 0, column = 46)
                                        ),
                                        type = Type.int,
                                        boolExpression = Expression.Variable(
                                            range = Range(
                                                start = Position(line = 0, column = 31),
                                                end = Position(line = 0, column = 32)
                                            ),
                                            type = Type.bool,
                                            name = "b"
                                        ),
                                        e1 = Expression.Variable(
                                            range = Range(
                                                start = Position(line = 0, column = 38),
                                                end = Position(line = 0, column = 39)
                                            ),
                                            type = Type.int,
                                            name = "t"
                                        ),
                                        e2 = Expression.Variable(
                                            range = Range(
                                                start = Position(line = 0, column = 45),
                                                end = Position(line = 0, column = 46)
                                            ),
                                            type = Type.int,
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
                expectedType = Type.unit
            )
        }
        "Bad if else does not type check." {
            assertCheck(
                source = "if true then 1 else unit",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:14-1:15: [UnexpectedType]: Expected: `unit`, actual: `int`.",
                    "Test.sam:1:14-1:15: [UnexpectedType]: Expected: `unit`, actual: `int`."
                )
            )
            assertCheck(
                source = "if true then false else 1",
                expectedType = Type.bool,
                expectedErrors = listOf(
                    "Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`.",
                    "Test.sam:1:25-1:26: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
            assertCheck(
                source = "if false then 1 else false",
                expectedType = Type.int,
                expectedErrors = listOf(
                    "Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`.",
                    "Test.sam:1:22-1:27: [UnexpectedType]: Expected: `int`, actual: `bool`."
                )
            )
            assertCheck(
                source = "if false then \"\" else 3",
                expectedType = Type.string,
                expectedErrors = listOf(
                    "Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`.",
                    "Test.sam:1:23-1:24: [UnexpectedType]: Expected: `string`, actual: `int`."
                )
            )
            assertCheck(
                source = "{ val _ = (b, t: bool, f: int) -> if b then t else f }",
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:1:52-1:53: [UnexpectedType]: Expected: `bool`, actual: `int`."
                )
            )
        }
        "Match variant inside object class does not type check." {
            assertCheck(
                source = """
                    {
                        val _ = (t: Test2) -> (
                            match (t) {
                                | Foo _ -> 1
                                | Bar s -> 2
                            }
                        );
                    }
                """.trimIndent(),
                expectedType = Type.unit,
                expectedErrors = listOf(
                    "Test.sam:3:16-3:17: [IllegalOtherClassMatch]: " +
                            "It is illegal to match on a value of other class's type."
                )
            )
        }
        "Good lambda type checks." {
            assertCheck(
                source = """
                    {
                        val _ = (a, b, c) -> if a(b + 1) then b else c;
                    }
                """.trimIndent(),
                expectedType = Type.unit
            )
            val source = """
                            {
                                val f = (a, b, c) -> {
                                    val f = (d, e) -> a + b + c + d + e;
                                    f(1, 2)
                                };
                                f(3, 4, 5)
                            }
                         """.trimIndent()
            val expectedExpression = Expression.StatementBlockExpression(
                range = Range(start = Position(line = 0, column = 0), end = Position(line = 6, column = 1)),
                type = Type.int,
                block = StatementBlock(
                    range = Range(start = Position(line = 0, column = 0), end = Position(line = 6, column = 1)),
                    statements = listOf(
                        Statement.Val(
                            range = Range(
                                start = Position(line = 1, column = 4),
                                end = Position(line = 4, column = 6)
                            ),
                            pattern = Pattern.VariablePattern(
                                range = Range(
                                    start = Position(line = 1, column = 8),
                                    end = Position(line = 1, column = 9)
                                ),
                                name = "f"
                            ),
                            typeAnnotation = Type.FunctionType(
                                argumentTypes = listOf(Type.int, Type.int, Type.int),
                                returnType = Type.int
                            ),
                            assignedExpression = Expression.Lambda(
                                range = Range(
                                    start = Position(line = 1, column = 12),
                                    end = Position(line = 4, column = 5)
                                ),
                                type = Type.FunctionType(
                                    argumentTypes = listOf(Type.int, Type.int, Type.int),
                                    returnType = Type.int
                                ),
                                parameters = listOf("a" to Type.int, "b" to Type.int, "c" to Type.int),
                                captured = emptyMap(),
                                body = Expression.StatementBlockExpression(
                                    range = Range(
                                        start = Position(line = 1, column = 25),
                                        end = Position(line = 4, column = 5)
                                    ),
                                    type = Type.int,
                                    block = StatementBlock(
                                        range = Range(
                                            start = Position(line = 1, column = 25),
                                            end = Position(line = 4, column = 5)
                                        ),
                                        statements = listOf(
                                            Statement.Val(
                                                range = Range(
                                                    start = Position(line = 2, column = 8),
                                                    end = Position(line = 2, column = 44)
                                                ),
                                                pattern = Pattern.VariablePattern(
                                                    range = Range(
                                                        start = Position(line = 2, column = 12),
                                                        end = Position(line = 2, column = 13)
                                                    ),
                                                    name = "f"
                                                ),
                                                typeAnnotation = Type.FunctionType(
                                                    argumentTypes = listOf(Type.int, Type.int),
                                                    returnType = Type.int
                                                ),
                                                assignedExpression = Expression.Lambda(
                                                    range = Range(
                                                        start = Position(line = 2, column = 16),
                                                        end = Position(line = 2, column = 43)
                                                    ),
                                                    type = Type.FunctionType(
                                                        argumentTypes = listOf(Type.int, Type.int),
                                                        returnType = Type.int
                                                    ),
                                                    parameters = listOf("d" to Type.int, "e" to Type.int),
                                                    captured = mapOf(
                                                        "a" to Type.int,
                                                        "b" to Type.int,
                                                        "c" to Type.int
                                                    ),
                                                    body = Expression.Binary(
                                                        range = Range(
                                                            start = Position(line = 2, column = 26),
                                                            end = Position(line = 2, column = 43)
                                                        ),
                                                        type = Type.int,
                                                        operator = BinaryOperator.PLUS,
                                                        e1 = Expression.Binary(
                                                            range = Range(
                                                                start = Position(line = 2, column = 26),
                                                                end = Position(line = 2, column = 39)
                                                            ),
                                                            type = Type.int,
                                                            operator = BinaryOperator.PLUS,
                                                            e1 = Expression.Binary(
                                                                range = Range(
                                                                    start = Position(line = 2, column = 26),
                                                                    end = Position(line = 2, column = 35)
                                                                ),
                                                                type = Type.int,
                                                                operator = BinaryOperator.PLUS,
                                                                e1 = Expression.Binary(
                                                                    range = Range(
                                                                        start = Position(line = 2, column = 26),
                                                                        end = Position(line = 2, column = 31)
                                                                    ),
                                                                    type = Type.int,
                                                                    operator = BinaryOperator.PLUS,
                                                                    e1 = Expression.Variable(
                                                                        range = Range(
                                                                            start = Position(line = 2, column = 26),
                                                                            end = Position(line = 2, column = 27)
                                                                        ),
                                                                        type = Type.int,
                                                                        name = "a"
                                                                    ),
                                                                    e2 = Expression.Variable(
                                                                        range = Range(
                                                                            start = Position(line = 2, column = 30),
                                                                            end = Position(line = 2, column = 31)
                                                                        ),
                                                                        type = Type.int,
                                                                        name = "b"
                                                                    )
                                                                ),
                                                                e2 = Expression.Variable(
                                                                    range = Range(
                                                                        start = Position(line = 2, column = 34),
                                                                        end = Position(line = 2, column = 35)
                                                                    ),
                                                                    type = Type.int,
                                                                    name = "c"
                                                                )
                                                            ),
                                                            e2 = Expression.Variable(
                                                                range = Range(
                                                                    start = Position(line = 2, column = 38),
                                                                    end = Position(line = 2, column = 39)
                                                                ),
                                                                type = Type.int,
                                                                name = "d"
                                                            )
                                                        ),
                                                        e2 = Expression.Variable(
                                                            range = Range(
                                                                start = Position(line = 2, column = 42),
                                                                end = Position(line = 2, column = 43)
                                                            ),
                                                            type = Type.int,
                                                            name = "e"
                                                        )
                                                    )
                                                )
                                            )
                                        ),
                                        expression = Expression.FunctionApplication(
                                            range = Range(
                                                start = Position(line = 3, column = 8),
                                                end = Position(line = 3, column = 15)
                                            ),
                                            type = Type.int,
                                            functionExpression = Expression.Variable(
                                                range = Range(
                                                    start = Position(line = 3, column = 8),
                                                    end = Position(line = 3, column = 9)
                                                ),
                                                type = Type.FunctionType(
                                                    argumentTypes = listOf(Type.int, Type.int),
                                                    returnType = Type.int
                                                ),
                                                name = "f"
                                            ),
                                            arguments = listOf(
                                                Expression.Literal.ofInt(
                                                    range = Range(
                                                        start = Position(line = 3, column = 10),
                                                        end = Position(line = 3, column = 11)
                                                    ),
                                                    value = 1
                                                ),
                                                Expression.Literal.ofInt(
                                                    range = Range(
                                                        start = Position(line = 3, column = 13),
                                                        end = Position(line = 3, column = 14)
                                                    ),
                                                    value = 2
                                                )
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    expression = Expression.FunctionApplication(
                        range = Range(
                            start = Position(line = 5, column = 4),
                            end = Position(line = 5, column = 14)
                        ),
                        type = Type.int,
                        functionExpression = Expression.Variable(
                            range = Range(
                                start = Position(line = 5, column = 4),
                                end = Position(line = 5, column = 5)
                            ),
                            type = Type.FunctionType(
                                argumentTypes = listOf(Type.int, Type.int, Type.int),
                                returnType = Type.int
                            ),
                            name = "f"
                        ),
                        arguments = listOf(
                            Expression.Literal.ofInt(
                                range = Range(
                                    start = Position(line = 5, column = 6),
                                    end = Position(line = 5, column = 7)
                                ),
                                value = 3
                            ),
                            Expression.Literal.ofInt(
                                range = Range(
                                    start = Position(line = 5, column = 9),
                                    end = Position(line = 5, column = 10)
                                ),
                                value = 4
                            ),
                            Expression.Literal.ofInt(
                                range = Range(
                                    start = Position(line = 5, column = 12),
                                    end = Position(line = 5, column = 13)
                                ),
                                value = 5
                            )
                        )
                    )
                )
            )
            assertCheck(
                source = source,
                expectedType = Type.int,
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
                            "foo" to TypeDefinition.FieldType(type = Type.bool, isPublic = true),
                            "bar" to TypeDefinition.FieldType(type = Type.int, isPublic = false)
                        )
                    ),
                    functions = persistentMapOf(
                        "helloWorld" to GlobalTypingContext.TypeInfo(
                            isPublic = false,
                            typeParams = emptyList(),
                            type = Type.FunctionType(argumentTypes = listOf(Type.string), returnType = Type.unit)
                        )
                    ),
                    methods = persistentMapOf(
                        "baz" to GlobalTypingContext.TypeInfo(
                            isPublic = false,
                            typeParams = emptyList(),
                            type = Type.FunctionType(argumentTypes = listOf(Type.int), returnType = Type.bool)
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
                            "Foo" to TypeDefinition.FieldType(type = Type.bool, isPublic = true),
                            "Bar" to TypeDefinition.FieldType(type = Type.int, isPublic = false)
                        )
                    ),
                    functions = persistentMapOf(),
                    methods = persistentMapOf()
                )
            ),
            typeParameters = persistentSetOf(),
            currentClass = "Test"
        )

        fun assertCheck(
            source: String,
            expectedType: Type,
            expectedExpression: Expression? = null,
            expectedErrors: List<String> = emptyList()
        ) {
            val (parsedExpression, actualParserErrors) = ExpressionBuilder.build(
                source = source,
                moduleReference = dummyModuleReference
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
