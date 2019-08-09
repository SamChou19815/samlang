package samlang.frontend

import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.checker.ErrorCollector
import samlang.checker.typeCheckSources
import samlang.compiler.ts.compileToTsSources
import samlang.errors.CompilationFailedException
import samlang.parser.ModuleBuilder
import samlang.printer.printTsIndexModule
import samlang.printer.printTsModule
import samlang.util.createOrFail
import java.io.File
import java.io.InputStream
import java.nio.file.Paths

fun collectSourceHandles(sourceDirectory: File): List<Pair<ModuleReference, InputStream>> {
    val sourcePath = sourceDirectory.toPath()
    val sourceHandles = arrayListOf<Pair<ModuleReference, InputStream>>()
    sourceDirectory.walk().forEach { file ->
        if (file.isDirectory || file.extension != "sam") {
            return@forEach
        }
        val relativeFile = sourcePath.relativize(file.toPath()).toFile()
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
