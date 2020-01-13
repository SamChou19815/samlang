@file:JvmName(name = "Main")

package samlang

import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.core.NoRunCliktCommand
import com.github.ajalt.clikt.core.subcommands
import java.io.File
import java.nio.file.Paths
import kotlin.system.exitProcess
import org.eclipse.lsp4j.launch.LSPLauncher
import samlang.ast.common.ModuleReference
import samlang.errors.CompilationFailedException
import samlang.lsp.LanguageServer
import samlang.optimization.IrCompilationUnitOptimizer
import samlang.optimization.MidIrStatementOptimizer
import samlang.server.startServer
import samlang.service.SourceChecker
import samlang.service.SourceCollector
import samlang.service.SourceCompiler

fun main(args: Array<String>): Unit =
    RootCommand().subcommands(CompileCommand(), ServerCommand(), LspCommand()).main(args)

private class RootCommand : NoRunCliktCommand(name = "samlang")

private class CompileCommand : CliktCommand(name = "compile") {
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
            exitProcess(status = 1)
        }
        val outputDirectory = File(configuration.outputDirectory).absoluteFile
        if (outputDirectory.exists() && !outputDirectory.isDirectory) {
            echo(message = "$outputDirectory is not a directory.", err = true)
            exitProcess(status = 1)
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
        SourceCompiler.compileJavaSources(
            source = checkedSources,
            outputDirectory = Paths.get(outputDirectory.toString(), "java").toFile()
        )
        SourceCompiler.compileToX86Assembly(
            source = checkedSources,
            entryModuleReference = ModuleReference.ROOT, // TODO
            optimizer = IrCompilationUnitOptimizer(
                statementOptimizer = MidIrStatementOptimizer.allEnabled,
                doesPerformInlining = true
            ),
            outputDirectory = Paths.get(outputDirectory.toString(), "x86").toFile()
        )
        val noLinkError = SourceCompiler.compileToX86Assembly(
            source = checkedSources,
            optimizer = IrCompilationUnitOptimizer(
                statementOptimizer = MidIrStatementOptimizer.allEnabled,
                doesPerformInlining = true
            ),
            outputDirectory = Paths.get(outputDirectory.toString(), "x86").toFile()
        )
        if (!noLinkError) {
            echo(message = "Compiled output has link errors.", err = true)
            exitProcess(status = 1)
        }
    }
}

private class ServerCommand : CliktCommand(name = "server") {
    override fun run(): Unit = startServer()
}

private class LspCommand : CliktCommand(name = "lsp") {
    override fun run() {
        val configuration = try {
            Configuration.parse()
        } catch (exception: Configuration.IllFormattedConfigurationException) {
            echo(message = exception.reason, err = true)
            exitProcess(status = 1)
        }
        val server = LanguageServer(configuration = configuration)
        val launcher = LSPLauncher.createServerLauncher(server, System.`in`, System.out)
        val client = launcher.remoteProxy
        server.connect(client)
        launcher.startListening().get()
    }
}
