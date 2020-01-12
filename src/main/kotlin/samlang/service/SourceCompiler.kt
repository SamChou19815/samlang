package samlang.service

import java.io.File
import java.nio.file.Paths
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.compiler.asm.AssemblyGenerator
import samlang.compiler.hir.compileSources
import samlang.compiler.mir.MidIrGenerator
import samlang.optimization.Optimizer
import samlang.printer.AssemblyPrinter
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

    fun compileToX86Assembly(
        source: Sources<Module>,
        optimizer: Optimizer<MidIrCompilationUnit>,
        outputDirectory: File
    ) {
        val highIrSources = compileSources(sources = source)
        val midIrCompilationUnit = MidIrGenerator.generate(sources = highIrSources, optimizer = optimizer)
        val assemblyProgram = AssemblyGenerator.generate(compilationUnit = midIrCompilationUnit)
        outputDirectory.mkdirs()
        val outputFile = Paths.get(outputDirectory.toString(), "program.s").toFile()
        outputFile.writer().use {
            AssemblyPrinter(writer = it, includeComments = false).printProgram(program = assemblyProgram)
        }
    }
}
