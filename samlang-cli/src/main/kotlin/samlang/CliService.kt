package samlang

import java.io.File
import java.nio.file.Paths
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.compiler.asm.AssemblyGenerator
import samlang.compiler.hir.compileSources
import samlang.compiler.mir.MidIrGenerator
import samlang.optimization.IrCompilationUnitOptimizer
import samlang.optimization.Optimizer

fun collectSources(configuration: Configuration): List<Pair<ModuleReference, String>> {
    val sourcePath = Paths.get(configuration.sourceDirectory).toAbsolutePath()
    return sourcePath.toFile().walk().mapNotNull { file ->
        if (file.isDirectory || file.extension != "sam") {
            return@mapNotNull null
        }
        val relativeFile = sourcePath.relativize(file.toPath()).toFile().normalize()
        val parts = relativeFile.parent.split(File.separator).toMutableList()
        parts.add(element = relativeFile.nameWithoutExtension)
        ModuleReference(parts = parts) to file.readText()
    }.toList()
}

@ExperimentalStdlibApi
fun compileToX86Executable(
    source: Sources<Module>,
    optimizer: Optimizer<MidIrCompilationUnit> = IrCompilationUnitOptimizer.allEnabled,
    outputDirectory: File
): Boolean {
    val highIrSources = compileSources(sources = source)
    val unoptimizedCompilationUnits = MidIrGenerator.generateWithMultipleEntries(sources = highIrSources)
    var withoutLinkError = true
    val jarPath = Paths.get(System.getProperty("java.class.path")).toAbsolutePath().toString()
    for ((moduleReference, unoptimizedCompilationUnit) in unoptimizedCompilationUnits.moduleMappings) {
        val optimizedCompilationUnit = optimizer.optimize(source = unoptimizedCompilationUnit)
        val assemblyProgram = AssemblyGenerator.generate(compilationUnit = optimizedCompilationUnit)
        val printedAssemblyProgram = assemblyProgram.toString()
        val outputAssemblyFile = Paths.get(outputDirectory.toString(), "$moduleReference.s").toFile()
        outputAssemblyFile.parentFile.mkdirs()
        outputAssemblyFile.writeText(text = printedAssemblyProgram)
        withoutLinkError = withoutLinkError && linkWithGcc(
            jarPath = jarPath,
            outputProgramFile = Paths.get(outputDirectory.toString(), moduleReference.toString()).toString(),
            outputAssemblyFile = outputAssemblyFile.toString()
        )
    }
    return withoutLinkError
}

private fun linkWithGcc(
    jarPath: String,
    outputProgramFile: String,
    outputAssemblyFile: String
): Boolean {
    val runtimePath = Paths.get(File(jarPath).parentFile.parentFile.parentFile.toString(), "runtime").toString()
    val processBuilder = ProcessBuilder(
        "gcc", "-o", outputProgramFile, outputAssemblyFile, "-L$runtimePath", "-lsam", "-lpthread"
    )
    processBuilder.inheritIO()
    val gccProcess = processBuilder.start()
    val withoutLinkError = gccProcess.waitFor() == 0
    gccProcess.inputStream.close()
    gccProcess.errorStream.close()
    gccProcess.outputStream.close()
    return withoutLinkError
}
