package samlang.service

import java.io.File
import java.nio.file.FileSystems
import java.nio.file.Paths
import samlang.Configuration
import samlang.ast.common.ModuleReference

object SourceCollector {
    fun collectHandles(configuration: Configuration): List<Pair<ModuleReference, File>> {
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
            ModuleReference(parts = parts) to file
        }.toList()
    }
}
