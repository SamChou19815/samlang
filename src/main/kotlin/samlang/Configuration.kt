package samlang

import com.google.gson.JsonElement
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.file.Paths

/**
 * Data class to store the configuration for a single run of the samlang language service.
 *
 * @param sourceDirectory source directory to process, default to the current working directory.
 * @param outputDirectory output directory of compilation result, default to `out`.
 * @param excludes path patterns (glob syntax) to exclude from source directory.
 * @param targets compilation targets, default to type checking only (empty list).
 */
data class Configuration(
    val sourceDirectory: String,
    val outputDirectory: String,
    val excludes: List<String>,
    val targets: Set<String>
) {
    class IllFormattedConfigurationException(val reason: String) : RuntimeException(reason)
    companion object {
        internal fun parse(): Configuration {
            val currentDirectory = Paths.get("").toAbsolutePath().toFile()
            var configurationDirectory: File? = currentDirectory
            while (configurationDirectory != null) {
                val configurationFile = Paths.get(configurationDirectory.toString(), "sconfig.json").toFile()
                if (configurationFile.exists()) {
                    if (configurationFile.isDirectory) {
                        throw IllFormattedConfigurationException(reason = "Configuration file cannot be a directory.")
                    }
                    return configurationFile.inputStream().use { parse(inputStream = it) }
                }
                configurationDirectory = configurationDirectory.parentFile
            }
            throw IllFormattedConfigurationException(reason = "Configuration file is not found.")
        }

        internal fun parse(string: String): Configuration =
            string.byteInputStream().use { parse(inputStream = it) }

        private fun parse(inputStream: InputStream): Configuration {
            try {
                val parsedJson = JsonParser.parseReader(InputStreamReader(inputStream))
                if (!parsedJson.isJsonObject) {
                    throw IllFormattedConfigurationException(reason = "Configuration file is not a json.")
                }
                val configurationJson = parsedJson.asJsonObject
                val sourceDirectory = configurationJson.get("sourceDirectory")?.let { parseStringStrict(it) } ?: "."
                val outputDirectory = configurationJson.get("outputDirectory")?.let { parseStringStrict(it) } ?: "out"
                val excludes = parseOptionalStringList(jsonElement = configurationJson.get("excludes"))
                val targets = parseOptionalStringList(jsonElement = configurationJson.get("targets"))
                val acceptableTargets = setOf("ts", "js", "java")
                for (target in targets) {
                    if (target !in acceptableTargets) {
                        throw IllFormattedConfigurationException(
                            reason = "$target is not an acceptable compilation target."
                        )
                    }
                }
                return Configuration(
                    sourceDirectory = sourceDirectory,
                    outputDirectory = outputDirectory,
                    excludes = excludes,
                    targets = targets.toSet()
                )
            } catch (jsonParseException: JsonParseException) {
                throw IllFormattedConfigurationException(
                    reason = "Cannot parse configuration: ${jsonParseException.message}"
                )
            } catch (_: ClassCastException) {
                throw IllFormattedConfigurationException(reason = "Bad configuration file.")
            } catch (_: IllegalStateException) {
                throw IllFormattedConfigurationException(reason = "Bad configuration file.")
            }
        }

        private fun parseOptionalStringList(jsonElement: JsonElement?): List<String> =
            jsonElement?.asJsonArray?.map(transform = ::parseStringStrict) ?: emptyList()

        private fun parseStringStrict(jsonElement: JsonElement): String {
            if (!jsonElement.isJsonPrimitive) {
                throw IllFormattedConfigurationException(reason = "Bad configuration file.")
            }
            val primitive = jsonElement.asJsonPrimitive
            if (!primitive.isString) {
                throw IllFormattedConfigurationException(reason = "Bad configuration file.")
            }
            return primitive.asString
        }
    }
}
