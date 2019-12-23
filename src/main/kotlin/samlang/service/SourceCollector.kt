package samlang.service

import java.io.File
import java.io.InputStream
import java.nio.file.FileSystems
import java.nio.file.Paths
import samlang.Configuration
import samlang.ast.common.ModuleReference

object SourceCollector {
    fun collectHandles(configuration: Configuration): List<Pair<ModuleReference, InputStream>> {
        val sourcePath = Paths.get(configuration.sourceDirectory)
        val excludeGlobMatchers = configuration.excludes.map { glob ->
            FileSystems.getDefault().getPathMatcher("glob:$glob")
        }
        return File(configuration.sourceDirectory).walk().mapNotNull { file ->
            if (file.isDirectory || file.extension != "sam") {
                return@mapNotNull null
            }
            val relativeFile = sourcePath.relativize(file.toPath()).toFile().normalize()
            if (excludeGlobMatchers.any { it.matches(relativeFile.toPath()) }) {
                return@mapNotNull null
            }
            val moduleReference = ModuleReference(
                parts = relativeFile.nameWithoutExtension.split(File.separator).toList()
            )
            moduleReference to file.inputStream()
        }.toList()
    }
}
