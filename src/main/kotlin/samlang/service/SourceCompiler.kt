package samlang.service

import java.io.File
import java.nio.file.Paths
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.compiler.hir.compileSources
import samlang.printer.javaizeName
import samlang.printer.printJavaOuterClass
import samlang.printer.printJavaSamlangIntrinsics

object SourceCompiler {
    fun compileJavaSources(source: Sources<Module>, outputDirectory: File) {
        val javaSources = compileSources(sources = source)
        outputDirectory.mkdirs()
        val samlangIntrinsicsPath = Paths.get(outputDirectory.toString(), "stdlib").toFile()
        samlangIntrinsicsPath.mkdirs()
        Paths.get(outputDirectory.toString(), "stdlib", "SamlangIntrinsics$.java")
            .toFile()
            .outputStream()
            .use(block = ::printJavaSamlangIntrinsics)
        for ((moduleReference, javaOuterClass) in javaSources.moduleMappings) {
            val parts = moduleReference.parts
            val outputFile = Paths.get(
                outputDirectory.toString(),
                *parts.subList(fromIndex = 0, toIndex = parts.size - 1).toTypedArray(),
                "${javaizeName(parts.last())}.java"
            ).toFile()
            outputFile.parentFile.mkdirs()
            outputFile.outputStream().use { stream ->
                printJavaOuterClass(stream = stream, moduleReference = moduleReference, outerClass = javaOuterClass)
            }
        }
    }
}
