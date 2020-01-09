package samlang.service

import java.io.File
import java.nio.file.Paths
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.compiler.hir.compileSources
import samlang.compiler.ts.compileToTsSources
import samlang.printer.javaizeName
import samlang.printer.printJavaOuterClass
import samlang.printer.printJavaSamlangIntrinsics
import samlang.printer.printTsIndexModule
import samlang.printer.printTsModule

object SourceCompiler {
    fun compileTsSources(source: Sources<Module>, outputDirectory: File, withType: Boolean) {
        val tsSources = compileToTsSources(sources = source)
        outputDirectory.mkdirs()
        val extension = if (withType) "ts" else "js"
        for ((moduleReference, tsModuleFolder) in tsSources.moduleMappings) {
            val outputPath = Paths.get(outputDirectory.toString(), *moduleReference.parts.toTypedArray()).toString()
            val indexFile = Paths.get(outputPath, "index.$extension").toFile()
            indexFile.parentFile.mkdirs()
            indexFile.outputStream().use { printTsIndexModule(stream = it, tsModuleFolder = tsModuleFolder) }
            for (subModule in tsModuleFolder.subModules) {
                Paths.get(outputPath, "_${subModule.typeName}.$extension")
                    .toFile()
                    .outputStream()
                    .use { printTsModule(stream = it, tsModule = subModule, withType = withType) }
            }
        }
    }

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
