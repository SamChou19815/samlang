package samlang

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
)
