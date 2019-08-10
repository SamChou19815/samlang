package samlang.printer

import io.kotlintest.fail
import io.kotlintest.shouldBe
import io.kotlintest.specs.StringSpec
import samlang.ast.common.Literal
import samlang.ast.common.Range
import samlang.ast.common.Type
import samlang.ast.common.TypeDefinition
import samlang.ast.ir.IrExpression
import samlang.ast.ir.IrStatement
import samlang.ast.ts.TsFunction
import samlang.ast.ts.TsModule
import samlang.ast.ts.TsModuleFolder
import samlang.ast.ts.TsPattern

class TsPrinterTest : StringSpec() {

    private fun runCorrectlyPrintedTest(
        testName: String,
        tsModuleFolder: TsModuleFolder,
        expectedTsIndexModuleCode: String,
        expectedTsClassModulesCode: List<String>,
        expectedJsClassModulesCode: List<String>
    ) {
        "$testName: Index Module" {
            printTsIndexModule(tsModuleFolder = tsModuleFolder) shouldBe expectedTsIndexModuleCode
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
            "$testName: JS Module `${subModule.typeName}`" {
                printTsModule(tsModule = subModule, withType = false) shouldBe expectedJsCode
            }
        }
    }

    private fun runCorrectlyPrintedTest(
        testName: String,
        tsModule: TsModule,
        expectedTsIndexModuleCode: String,
        expectedTsClassModuleCode: String,
        expectedJsClassModuleCode: String
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
                            element = IrStatement.Throw(
                                expression = IrExpression.Literal(literal = Literal.of(value = "Ah!"))
                            )
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
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
                        body = listOf(
                            element = IrStatement.Return(expression = null)
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  return;
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
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
                            element = IrStatement.IfElse(
                                booleanExpression = IrExpression.Literal(literal = Literal.of(value = true)),
                                s1 = listOf(element = IrStatement.Return(expression = null)),
                                s2 = listOf(element = IrStatement.Return(expression = null))
                            )
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
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

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
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
                            element = IrStatement.ConstantDefinition(
                                pattern = TsPattern.VariablePattern(
                                    name = "foo"
                                ),
                                typeAnnotation = Type.string,
                                assignedExpression = IrExpression.Literal(literal = Literal.of(value = "bar"))
                            )
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
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
                            element = IrStatement.ConstantDefinition(
                                pattern = TsPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = IrExpression.Literal(literal = Literal.of(value = "bar"))
                            )
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
            expectedTsClassModuleCode = """
                type Test = {
                };
                
                function test(): void {
                  "bar";
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                function test() {
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
                            element = IrStatement.ConstantDefinition(
                                pattern = TsPattern.TuplePattern(
                                    destructedNames = listOf("foo", "bar")
                                ),
                                typeAnnotation = Type.TupleType(mappings = listOf(Type.string, Type.string)),
                                assignedExpression = IrExpression.TupleConstructor(
                                    expressionList = listOf(
                                        IrExpression.Literal(literal = Literal.of(value = "foo")),
                                        IrExpression.Literal(literal = Literal.of(value = "bar"))
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsIndexModuleCode = """
                import * as Test from './_Test';

                export { Test };

            """.trimIndent(),
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
    }
}
