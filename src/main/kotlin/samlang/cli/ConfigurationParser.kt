package samlang.cli

import com.google.gson.JsonElement
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader

internal class IllFormattedConfigurationException(val reason: String) : RuntimeException(reason)

internal fun parseConfiguration(file: File): samlang.Configuration =
    file.inputStream().use { parseConfiguration(inputStream = it) }

internal fun parseConfiguration(string: String): samlang.Configuration =
    string.byteInputStream().use { parseConfiguration(inputStream = it) }

private fun parseConfiguration(inputStream: InputStream): samlang.Configuration {
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
                throw IllFormattedConfigurationException(reason = "$target is not an acceptable compilation target.")
            }
        }
        return samlang.Configuration(
            sourceDirectory = sourceDirectory,
            outputDirectory = outputDirectory,
            excludes = excludes,
            targets = targets.toSet()
        )
    } catch (jsonParseException: JsonParseException) {
        throw IllFormattedConfigurationException(reason = "Cannot parse configuration: ${jsonParseException.message}")
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
