package samlang.checker

import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import kotlinx.collections.immutable.persistentMapOf
import kotlinx.collections.immutable.persistentSetOf
import samlang.ast.common.ModuleReference
import samlang.ast.common.Position
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.lang.Expression
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
