package samlang.cli

import com.github.ajalt.clikt.core.CliktCommand
import java.io.File
import java.nio.file.Paths
import kotlin.system.exitProcess
import samlang.Configuration
import samlang.ast.common.ModuleReference
import samlang.errors.CompilationFailedException
import samlang.optimization.IrCompilationUnitOptimizer
import samlang.optimization.MidIrStatementOptimizer
import samlang.service.SourceChecker
import samlang.service.SourceCollector
import samlang.service.SourceCompiler

class CompileCommand : CliktCommand(name = "compile") {
    override fun run() {
        val configuration = try {
            Configuration.parse()
        } catch (exception: Configuration.IllFormattedConfigurationException) {
            echo(message = exception.reason, err = true)
            exitProcess(status = 1)
        }
        val sourceDirectory = File(configuration.sourceDirectory).absoluteFile
        if (!sourceDirectory.isDirectory) {
            echo(message = "$sourceDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        val outputDirectory = File(configuration.outputDirectory).absoluteFile
        if (outputDirectory.exists() && !outputDirectory.isDirectory) {
            echo(message = "$outputDirectory is not a directory.", err = true)
            exitProcess(1)
        }
        echo(message = "Compiling sources in `${configuration.sourceDirectory}` ...", err = true)
        val sourceHandles = SourceCollector.collectHandles(configuration = configuration)
        val checkedSources = try {
            SourceChecker.typeCheck(sourceHandles = sourceHandles)
        } catch (compilationFailedException: CompilationFailedException) {
            val errors = compilationFailedException.errors
            echo(message = "Found ${errors.size} error(s).", err = true)
            errors.forEach { echo(message = it.errorMessage) }
            return
        }
        for (target in configuration.targets) {
            when (target) {
                "java" -> SourceCompiler.compileJavaSources(
                    source = checkedSources,
                    outputDirectory = Paths.get(outputDirectory.toString(), "java").toFile()
                )
                "x86" -> SourceCompiler.compileToX86Assembly(
                    source = checkedSources,
                    entryModuleReference = ModuleReference.ROOT, // TODO
                    optimizer = IrCompilationUnitOptimizer(
                        statementOptimizer = MidIrStatementOptimizer.allEnabled,
                        doesPerformInlining = true
                    ),
                    outputDirectory = Paths.get(outputDirectory.toString(), "x86").toFile()
                )
            }
        }
    }
}
