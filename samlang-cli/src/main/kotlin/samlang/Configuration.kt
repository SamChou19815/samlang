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
 */
data class Configuration(
    val sourceDirectory: String,
    val outputDirectory: String
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
                return Configuration(
                    sourceDirectory = sourceDirectory,
                    outputDirectory = outputDirectory
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
