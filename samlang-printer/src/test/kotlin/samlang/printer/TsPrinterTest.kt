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
import samlang.ast.hir.HighIrExpression.Binary
import samlang.ast.hir.HighIrExpression.ClassMember
import samlang.ast.hir.HighIrExpression.Companion
import samlang.ast.hir.HighIrExpression.Companion.FALSE
import samlang.ast.hir.HighIrExpression.Companion.TRUE
import samlang.ast.hir.HighIrExpression.Companion.UNIT
import samlang.ast.hir.HighIrExpression.Companion.literal
import samlang.ast.hir.HighIrExpression.FunctionApplication
import samlang.ast.hir.HighIrExpression.Lambda
import samlang.ast.hir.HighIrExpression.MethodAccess
import samlang.ast.hir.HighIrExpression.ObjectConstructor
import samlang.ast.hir.HighIrExpression.This
import samlang.ast.hir.HighIrExpression.TupleConstructor
import samlang.ast.hir.HighIrExpression.Unary
import samlang.ast.hir.HighIrExpression.Variable
import samlang.ast.hir.HighIrPattern
import samlang.ast.hir.HighIrStatement.ConstantDefinition
import samlang.ast.hir.HighIrStatement.IfElse
import samlang.ast.hir.HighIrStatement.Return
import samlang.ast.hir.HighIrStatement.Throw
import samlang.ast.ts.TsFunction
import samlang.ast.ts.TsModule
import samlang.ast.ts.TsModuleFolder

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
                import { T_Test } from './_Test';

                export { Test, T_Test };

            """.trimIndent(),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                export {  };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
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
                export type T_Test = {
                };

                let _: any = undefined;
                
                function test(): void {
                  throw new Error("Ah!");
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
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
                export type T_Test = {
                };
                
                let _: any = undefined;
                
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
                export type T_Test = {
                };

                let _: any = undefined;
                
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
                                pattern = HighIrPattern.VariablePattern(
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
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  const foo: string = "bar";
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = literal(value = "bar")
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = "bar";
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
                                pattern = HighIrPattern.TuplePattern(
                                    destructedNames = listOf("foo", "bar")
                                ),
                                typeAnnotation = Type.TupleType(mappings = listOf(Type.string, Type.string)),
                                assignedExpression = TupleConstructor(
                                    type = Type.TupleType(mappings = listOf(Type.string, Type.string)),
                                    expressionList = listOf(literal(value = "foo"), literal(value = "bar"))
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  const [foo, bar]: [string, string] = ["foo", "bar"];
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
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
                                pattern = HighIrPattern.ObjectPattern(
                                    destructedNames = listOf("foo" to null, "bar" to "baz")
                                ),
                                typeAnnotation = Type.id(identifier = "Test"),
                                assignedExpression = ObjectConstructor(
                                    type = Type.id(identifier = "Test"),
                                    spreadExpression = Variable(type = Type.id(identifier = "Test"), name = "obj"),
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
                export type T_Test = {
                  readonly foo: number;
                  readonly bar: boolean;
                };
                
                let _: any = undefined;
                
                function test(obj: T_Test): void {
                  const { foo, bar: baz }: T_Test = { ...obj, foo: "foo", bar: "bar" };
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Unary(
                                    type = Type.bool,
                                    operator = UnaryOperator.NOT,
                                    expression = TRUE
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Unary(
                                    type = Type.bool,
                                    operator = UnaryOperator.NOT,
                                    expression = Unary(
                                        type = Type.bool,
                                        operator = UnaryOperator.NOT,
                                        expression = FALSE
                                    )
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.int,
                                assignedExpression = Unary(
                                    type = Type.int,
                                    operator = UnaryOperator.NEG,
                                    expression = literal(value = 3)
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = !true;
                  _ = !!false;
                  _ = -3;
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    type = Type.int,
                                    operator = BinaryOperator.PLUS,
                                    e1 = literal(value = 3),
                                    e2 = literal(value = 14)
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    type = Type.int,
                                    operator = BinaryOperator.DIV,
                                    e1 = literal(value = 3),
                                    e2 = literal(value = 14)
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    type = Type.int,
                                    operator = BinaryOperator.DIV,
                                    e1 = literal(value = 3),
                                    e2 = Binary(
                                        type = Type.int,
                                        operator = BinaryOperator.PLUS,
                                        e1 = literal(value = 3),
                                        e2 = literal(value = 14)
                                    )
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.string,
                                assignedExpression = Binary(
                                    type = Type.int,
                                    operator = BinaryOperator.MUL,
                                    e1 = Binary(
                                        type = Type.int,
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
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = 3 + 14;
                  _ = Math.floor(3 / 14) ;
                  _ = Math.floor(3 / (3 + 14)) ;
                  _ = (3 + 14) * 3;
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.FunctionType(
                                    argumentTypes = listOf(element = Type.int),
                                    returnType = Type.bool
                                ),
                                assignedExpression = MethodAccess(
                                    type = Type.FunctionType(
                                        argumentTypes = listOf(element = Type.int),
                                        returnType = Type.bool
                                    ),
                                    expression = This(type = Type.id(identifier = "Test")),
                                    methodName = "foo"
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = ((...arguments) => foo(_this, ...arguments));
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Return Method Reference",
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
                        returnType = Type.FunctionType(
                            argumentTypes = listOf(element = Type.int),
                            returnType = Type.bool
                        ),
                        body = listOf(
                            Return(
                                expression = MethodAccess(
                                    type = Type.FunctionType(
                                        argumentTypes = listOf(element = Type.int),
                                        returnType = Type.bool
                                    ),
                                    expression = This(type = Type.id(identifier = "Test")),
                                    methodName = "foo"
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): (number) => boolean {
                  return ((...arguments) => foo(_this, ...arguments));
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Function Call",
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = FunctionApplication(
                                    type = Type.bool,
                                    functionExpression = ClassMember(
                                        type = Type.FunctionType(
                                            argumentTypes = listOf(element = Type.int),
                                            returnType = Type.bool
                                        ),
                                        typeArguments = emptyList(),
                                        className = "Test",
                                        memberName = "foo"
                                    ), arguments = listOf(element = Companion.literal(value = 1))
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = FunctionApplication(
                                    type = Type.bool,
                                    functionExpression = MethodAccess(
                                        type = Type.FunctionType(
                                            argumentTypes = listOf(element = Type.int),
                                            returnType = Type.bool
                                        ),
                                        expression = This(type = Type.id(identifier = "Test")),
                                        methodName = "foo"
                                    ), arguments = listOf(element = Companion.literal(value = 1))
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = foo(1);
                  _ = foo(_this, 1);
                }
                
                export { test };

            """.trimIndent()
        )

        runCorrectlyPrintedTest(
            testName = "Lambda",
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
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Lambda(
                                    type = Type.FunctionType(
                                        argumentTypes = emptyList(),
                                        returnType = Type.bool
                                    ),
                                    parameters = listOf(element = "foo" to Type.int),
                                    body = listOf(
                                        Return(expression = FALSE)
                                    )
                                )
                            ),
                            ConstantDefinition(
                                pattern = HighIrPattern.WildCardPattern,
                                typeAnnotation = Type.bool,
                                assignedExpression = Lambda(
                                    type = Type.FunctionType(
                                        argumentTypes = listOf(element = Type.int),
                                        returnType = Type.bool
                                    ),
                                    parameters = listOf(element = "foo" to Type.int),
                                    body = listOf(
                                        ConstantDefinition(
                                            pattern = HighIrPattern.WildCardPattern,
                                            typeAnnotation = Type.unit,
                                            assignedExpression = UNIT
                                        ),
                                        Return(expression = TRUE)
                                    )
                                )
                            )
                        )
                    )
                )
            ),
            expectedTsClassModuleCode = """
                export type T_Test = {
                };
                
                let _: any = undefined;
                
                function test(): void {
                  _ = (foo: number): boolean => {return false;};
                  _ = (foo: number): boolean => {_ = void 0;return true;};
                }
                
                export { test };

            """.trimIndent(),
            expectedJsClassModuleCode = """
                let _ = undefined;
                
                function test() {
                  _ = (foo) => {return false;};
                  _ = (foo) => {_ = void 0;return true;};
                }
                
                export { test };

            """.trimIndent()
        )
    }
}
