package samlang

import java.io.File
import java.nio.file.FileSystems
import java.nio.file.Paths
import samlang.ast.common.ModuleReference
import samlang.ast.common.Sources
import samlang.ast.lang.Module
import samlang.ast.mir.MidIrCompilationUnit
import samlang.compiler.asm.AssemblyGenerator
import samlang.compiler.hir.compileSources
import samlang.compiler.mir.MidIrGenerator
import samlang.optimization.Optimizer
import samlang.printer.AssemblyPrinter
import samlang.printer.OsTarget

private val osTarget: OsTarget = OsTarget.getOsFromString(osNameString = System.getProperty("os.name"))

fun collectSources(configuration: Configuration): List<Pair<ModuleReference, String>> {
    val sourcePath = Paths.get(configuration.sourceDirectory).toAbsolutePath()
    val excludeGlobMatchers = configuration.excludes.map { glob ->
        FileSystems.getDefault().getPathMatcher("glob:$glob")
    }
    return sourcePath.toFile().walk().mapNotNull { file ->
        if (file.isDirectory || file.extension != "sam") {
            return@mapNotNull null
        }
        val relativeFile = sourcePath.relativize(file.toPath()).toFile().normalize()
        if (excludeGlobMatchers.any { it.matches(relativeFile.toPath()) }) {
            return@mapNotNull null
        }
        val parts = relativeFile.parent.split(File.separator).toMutableList()
        parts.add(element = relativeFile.nameWithoutExtension)
        ModuleReference(parts = parts) to file.readText()
    }.toList()
}

@ExperimentalStdlibApi
fun compileToX86Assembly(
    source: Sources<Module>,
    entryModuleReference: ModuleReference,
    optimizer: Optimizer<MidIrCompilationUnit>,
    outputDirectory: File
) {
    val highIrSources = compileSources(sources = source)
    val unoptimizedCompilationUnit = MidIrGenerator.generate(
        sources = highIrSources,
        entryModuleReference = entryModuleReference
    )
    val optimizedCompilationUnit = optimizer.optimize(source = unoptimizedCompilationUnit)
    val assemblyProgram = AssemblyGenerator.generate(compilationUnit = optimizedCompilationUnit)
    val printedAssemblyProgram = AssemblyPrinter(includeComments = false, osTarget = osTarget)
        .printProgram(program = assemblyProgram)
    outputDirectory.mkdirs()
    val outputFile = Paths.get(outputDirectory.toString(), "program.s").toFile()
    outputFile.writeText(text = printedAssemblyProgram)
}

@ExperimentalStdlibApi
fun compileToX86Executable(
    source: Sources<Module>,
    optimizer: Optimizer<MidIrCompilationUnit>,
    outputDirectory: File
): Boolean {
    val highIrSources = compileSources(sources = source)
    val unoptimizedCompilationUnits = MidIrGenerator.generateWithMultipleEntries(sources = highIrSources)
    var withoutLinkError = true
    val jarPath = Paths.get(System.getProperty("java.class.path")).toAbsolutePath().toString()
    for ((moduleReference, unoptimizedCompilationUnit) in unoptimizedCompilationUnits.moduleMappings) {
        val optimizedCompilationUnit = optimizer.optimize(source = unoptimizedCompilationUnit)
        val assemblyProgram = AssemblyGenerator.generate(compilationUnit = optimizedCompilationUnit)
        val printedAssemblyProgram = AssemblyPrinter(includeComments = false, osTarget = osTarget)
            .printProgram(program = assemblyProgram)
        val outputAssemblyFile = Paths.get(outputDirectory.toString(), "$moduleReference.s").toFile()
        outputAssemblyFile.parentFile.mkdirs()
        outputAssemblyFile.writeText(text = printedAssemblyProgram)
        val outputProgramFile = Paths.get(outputDirectory.toString(), moduleReference.toString()).toString()
        withoutLinkError = withoutLinkError && linkWithGcc(
            moduleReference = moduleReference,
            jarPath = jarPath,
            outputProgramFile = outputProgramFile,
            outputAssemblyFile = outputAssemblyFile
        )
    }
    return withoutLinkError
}

private fun linkWithGcc(
    moduleReference: ModuleReference,
    jarPath: String,
    outputProgramFile: String,
    outputAssemblyFile: File
): Boolean {
    val runtimePath = Paths.get(File(jarPath).parentFile.parentFile.parentFile.toString(), "runtime").toString()
    val linkCommand = "gcc -o $outputProgramFile $outputAssemblyFile -L$runtimePath -lsam -lpthread"
    val gccProcess = Runtime.getRuntime().exec(linkCommand)
    var withoutLinkError = true
    if (gccProcess.waitFor() != 0) {
        withoutLinkError = false
        System.err.println("Failed to link $moduleReference. Linker errors are printed below:")
        gccProcess.inputStream.use {
            val reader = it.bufferedReader()
            while (true) {
                val line = reader.readLine() ?: break
                System.err.println(line)
            }
        }
        gccProcess.errorStream.use {
            val reader = it.bufferedReader()
            while (true) {
                val line = reader.readLine() ?: break
                System.err.println(line)
            }
        }
    } else {
        gccProcess.inputStream.close()
        gccProcess.errorStream.close()
    }
    gccProcess.outputStream.close()
    return withoutLinkError
}
