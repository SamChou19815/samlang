package samlang.service

import java.io.File
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

object SourceCompiler {
    private val osTarget: OsTarget = OsTarget.getOsFromString(osNameString = System.getProperty("os.name"))

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
        outputDirectory.mkdirs()
        val outputFile = Paths.get(outputDirectory.toString(), "program.s").toFile()
        outputFile.writer().use {
            it.write(AssemblyPrinter(includeComments = false, osTarget = osTarget)
                .printProgram(program = assemblyProgram))
            it.flush()
        }
    }

    fun compileToX86Assembly(
        source: Sources<Module>,
        optimizer: Optimizer<MidIrCompilationUnit>,
        outputDirectory: File
    ): Boolean {
        val highIrSources = compileSources(sources = source)
        val unoptimizedCompilationUnits = MidIrGenerator.generateWithMultipleEntries(sources = highIrSources)
        val runtime = Runtime.getRuntime()
        var withoutLinkError = true
        val jarPath = Paths.get(System.getProperty("java.class.path")).toAbsolutePath().toString()
        for ((moduleReference, unoptimizedCompilationUnit) in unoptimizedCompilationUnits.moduleMappings) {
            val optimizedCompilationUnit = optimizer.optimize(source = unoptimizedCompilationUnit)
            val assemblyProgram = AssemblyGenerator.generate(compilationUnit = optimizedCompilationUnit)
            val outputAssemblyFile = Paths.get(outputDirectory.toString(), "$moduleReference.s").toFile()
            outputAssemblyFile.parentFile.mkdirs()
            outputAssemblyFile.writer().use {
                it.write(AssemblyPrinter(includeComments = false, osTarget = osTarget)
                    .printProgram(program = assemblyProgram))
                it.flush()
            }
            val outputProgramFile = Paths.get(outputDirectory.toString(), moduleReference.toString()).toString()
            val runtimePath = Paths.get(File(jarPath).parentFile.parentFile.parentFile.toString(), "runtime").toString()
            val linkCommand = "gcc -o $outputProgramFile $outputAssemblyFile -L$runtimePath -lsam -lpthread"
            val gccProcess = runtime.exec(linkCommand)
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
        }
        return withoutLinkError
    }
}
