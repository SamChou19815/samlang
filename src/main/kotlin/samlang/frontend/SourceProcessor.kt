package samlang.frontend

import java.io.File
import java.io.InputStream
import java.nio.file.FileSystems
import java.nio.file.Paths
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSources
import samlang.compiler.java.compileToJavaSources
import samlang.compiler.ts.compileToTsSources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.printer.javaizeName
import samlang.printer.printJavaOuterClass
import samlang.printer.printJavaSamlangIntrinsics
import samlang.printer.printTsIndexModule
import samlang.printer.printTsModule
import samlang.util.createOrFail

fun collectSourceHandles(sourceDirectory: File, exclude: String?): List<Pair<ModuleReference, InputStream>> {
    val sourcePath = sourceDirectory.toPath()
    val sourceHandles = arrayListOf<Pair<ModuleReference, InputStream>>()
    val excludeGlobMatcher = exclude?.let { FileSystems.getDefault().getPathMatcher("glob:$it") }
    sourceDirectory.walk().forEach { file ->
        if (file.isDirectory || file.extension != "sam") {
            return@forEach
        }
        val relativeFile = sourcePath.relativize(file.toPath()).toFile().normalize()
        if (excludeGlobMatcher != null && excludeGlobMatcher.matches(relativeFile.toPath())) {
            return@forEach
        }
        val moduleReference =
            ModuleReference(parts = relativeFile.nameWithoutExtension.split("/").toList())
        sourceHandles.add(element = moduleReference to file.inputStream())
    }
    return sourceHandles
}

fun typeCheckSources(sourceHandles: List<Pair<ModuleReference, InputStream>>): Sources<Module> {
    val errorCollector = ErrorCollector()
    val moduleMappings = hashMapOf<ModuleReference, Module>()
    for ((moduleReference, inputStream) in sourceHandles) {
        val module = inputStream.use { stream ->
            try {
                ModuleBuilder.buildModule(file = moduleReference.toFilename(), inputStream = stream)
            } catch (compilationFailedException: CompilationFailedException) {
                compilationFailedException.errors.forEach { errorCollector.add(compileTimeError = it) }
                null
            }
        } ?: continue
        moduleMappings[moduleReference] = module
    }
    val checkedSources =
        typeCheckSources(sources = Sources(moduleMappings = moduleMappings), errorCollector = errorCollector)
    return createOrFail(item = checkedSources, errors = errorCollector.collectedErrors)
}

fun compileTsSources(source: Sources<Module>, outputDirectory: File, withType: Boolean) {
    val tsSources = compileToTsSources(sources = source)
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
    val javaSources = compileToJavaSources(sources = source)
    outputDirectory.mkdirs()
    Paths.get(outputDirectory.toString(), "SamlangIntrinsics$.java")
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
