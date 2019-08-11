package samlang.printer

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.BinaryOperator
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.common.TypeDefinitionType
import samlang.ast.common.UnaryOperator
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrExpression.Binary
import samlang.ast.ir.IrExpression.Companion.FALSE
import samlang.ast.ir.IrExpression.Companion.TRUE
import samlang.ast.ir.IrExpression.Companion.literal
import samlang.ast.ir.IrExpression.*
import samlang.ast.ir.IrExpression.TupleConstructor
import samlang.ast.ir.IrExpression.Unary
import samlang.ast.ir.IrExpression.Variable
import samlang.ast.ir.IrStatement.ConstantDefinition
import samlang.ast.ir.IrStatement.IfElse
import samlang.ast.ir.IrStatement.Return
import samlang.ast.ir.IrStatement.Throw
import samlang.ast.ts.TsFunction
import samlang.ast.ts.TsModule
import samlang.ast.ts.TsModuleFolder
import samlang.ast.ts.TsPattern

class TsPrinterTest : StringSpec() {

    private fun runCorrectlyPrintedTest(
        testName: String,
        tsModuleFolder: TsModuleFolder,
        expectedTsIndexModuleCode: String? = null,
        expectedTsClassModulesCode: List<String>,
        expectedJsClassModulesCode: List<String?>
    ) {
        if (expectedTsIndexModuleCode != null) {
            "$testName: Index Module" {
                printTsIndexModule(tsModuleFolder = tsModuleFolder) shouldBe expectedTsIndexModuleCode
            }
        }
        if (expectedTsClassModulesCode.size != expectedJsClassModulesCode.size ||
            expectedTsClassModulesCode.size != tsModuleFolder.subModules.size
        ) {
            "$testName: BAD SIZE" {
                fail(msg = "Size mismatch")
            }
            return
        }
        val testCases = tsModuleFolder.subModules.zip(
            other = expectedTsClassModulesCode.zip(other = expectedJsClassModulesCode)
        )
        for ((subModule, expectedCode) in testCases) {
            val (expectedTsCode, expectedJsCode) = expectedCode
            "$testName: TS Module `${subModule.typeName}`" {
                printTsModule(tsModule = subModule, withType = true) shouldBe expectedTsCode
            }
            if (expectedJsCode != null) {
                "$testName: JS Module `${subModule.typeName}`" {
                    printTsModule(tsModule = subModule, withType = false) shouldBe expectedJsCode
                }
            }
        }
    }

    private fun runCorrectlyPrintedTest(
        testName: String,
        tsModule: TsModule,
        expectedTsIndexModuleCode: String? = null,
        expectedTsClassModuleCode: String,
        expectedJsClassModuleCode: String? = null
    ): Unit = runCorrectlyPrintedTest(
        testName = testName,
        tsModuleFolder = TsModuleFolder(subModules = listOf(element = tsModule)),
        expectedTsIndexModuleCode = expectedTsIndexModuleCode,
        expectedTsClassModulesCode = listOf(element = expectedTsClassModuleCode),
        expectedJsClassModulesCode = listOf(element = expectedJsClassModuleCode)
    )

    init {
        runCorrectlyPrintedTest(
            testName = "Empty",
            tsModuleFolder = TsModuleFolder(subModules = emptyList()),
            expectedTsIndexModuleCode = "export {  };\n",
            expectedTsClassModulesCode = emptyList(),
            expectedJsClassModulesCode = emptyList()
        )

        runCorrectlyPrintedTest(
            testName = "Dummy Class Module",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = emptyList()
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                export {  };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                export {  };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Throw",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            element = Throw(expression = literal(value = "Ah!"))
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  throw new Error("Ah!");
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
                  throw new Error("Ah!");
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Return",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(element = Return(expression = null))
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  return;
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "If-Else",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            element = IfElse(
                                booleanExpression = TRUE,
                                s1 = listOf(element = Return(expression = null)),
                                s2 = listOf(element = Return(expression = null))
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  if (true) {
                    return;
                  } else {
                    return;
                  }
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Simple Assignment",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            element = ConstantDefinition(
                                pattern = TsPattern.VariablePattern(
                                    name = "foo"
                                ),
                                typeAnnotation = Type.string,
                                assignedExpression = literal(value = "bar")
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  const foo: string = "bar";
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
                  const foo = "bar";
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Simple Wildcard Assignment",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            element = ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = literal(value = "bar")
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  "bar";
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Tuple Assignment",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            element = ConstantDefinition(
                                pattern = TsPattern.TuplePattern(
                                    destructedNames = listOf("foo", "bar")
                                ),
                                typeAnnotation = Type.TupleType(mappings = listOf(Type.string, Type.string)),
                                assignedExpression = TupleConstructor(
                                    expressionList = listOf(literal(value = "foo"), literal(value = "bar"))
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  const [foo, bar]: [string, string] = ["foo", "bar"];
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
                  const [foo, bar] = ["foo", "bar"];
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Object Destructing",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition(
                    range = Range.DUMMY,
                    type = TypeDefinitionType.OBJECT,
                    typeParameters = emptyList(),
                    mappings = mapOf("foo" to Type.int, "bar" to Type.bool)
                ),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = listOf(element = "obj" to Type.id(identifier = "Test")),
                        returnType = Type.unit,
                        body = listOf(
                            element = ConstantDefinition(
                                pattern = TsPattern.ObjectPattern(
                                    destructedNames = listOf("foo" to null, "bar" to "baz")
                                ),
                                typeAnnotation = Type.id(identifier = "Test"),
                                assignedExpression = ObjectConstructor(
                                    spreadExpression = Variable(name = "obj"),
                                    fieldDeclaration = listOf(
                                        "foo" to literal(value = "foo"),
                                        "bar" to literal(value = "bar")
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                  readonly foo: number;
                  readonly bar: boolean;
                };
                
                function test(obj: Test): void {
                  const { foo, bar: baz }: Test = { ...obj, foo: "foo", bar: "bar" };
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test(obj) {
                  const { foo, bar: baz } = { ...obj, foo: "foo", bar: "bar" };
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Unary Expressions",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Unary(
                                    operator = UnaryOperator.NOT,
                                    expression = TRUE
                                )
                            ),
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Unary(
                                    operator = UnaryOperator.NOT,
                                    expression = Unary(
                                        operator = UnaryOperator.NOT,
                                        expression = FALSE
                                    )
                                )
                            ),
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.int,
                                assignedExpression = Unary(
                                    operator = UnaryOperator.NEG,
                                    expression = literal(value = 3)
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  !true;
                  !!false;
                  -3;
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Binary Expressions",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    operator = BinaryOperator.PLUS,
                                    e1 = literal(value = 3),
                                    e2 = literal(value = 14)
                                )
                            ),
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    operator = BinaryOperator.DIV,
                                    e1 = literal(value = 3),
                                    e2 = literal(value = 14)
                                )
                            ),
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    operator = BinaryOperator.DIV,
                                    e1 = literal(value = 3),
                                    e2 = Binary(
                                        operator = BinaryOperator.PLUS,
                                        e1 = literal(value = 3),
                                        e2 = literal(value = 14)
                                    )
                                )
                            ),
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    operator = BinaryOperator.MUL,
                                    e1 = Binary(
                                        operator = BinaryOperator.PLUS,
                                        e1 = literal(value = 3),
                                        e2 = literal(value = 14)
                                    ),
                                    e2 = literal(value = 3)
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  3 + 14;
                  Math.floor(3 / 14) ;
                  Math.floor(3 / (3 + 14)) ;
                  (3 + 14) * 3;
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Method Reference",
            tsModule = TsModule(
                imports = emptyList(),
                typeName = "Test",
                typeDefinition = TypeDefinition.ofDummy(range = Range.DUMMY),
                functions = listOf(
                    element = TsFunction(
                        shouldBeExported = true,
                        name = "test",
                        typeParameters = emptyList(),
                        parameters = emptyList(),
                        returnType = Type.unit,
                        body = listOf(
                            ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.FunctionType(
                                    argumentTypes = listOf(element = Type.int),
                                    returnType = Type.bool
                                ),
                                assignedExpression = MethodAccess(expression = This, methodName = "foo")
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  ((...arguments) => foo(_this, ...arguments));
                }
                
                export { test };

            """.trimIndent()
        )
    }
}
