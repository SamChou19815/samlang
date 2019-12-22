package samlang.cli

import io.kotlintest.shouldBe
import io.kotlintest.shouldThrow
import io.kotlintest.specs.StringSpec

class ConfigurationParserTest : StringSpec() {
    init {
        "empty configuration can parse." {
            parseConfiguration(string = "{}") shouldBe samlang.Configuration(
                sourceDirectory = ".",
                outputDirectory = "out",
                excludes = emptyList(),
                targets = emptySet()
            )
        }
        "partial configuration can parse." {
            val json = """{ "sourceDirectory": "source", "targets": ["ts", "js", "java"] }"""
            parseConfiguration(string = json) shouldBe samlang.Configuration(
                sourceDirectory = "source",
                outputDirectory = "out",
                excludes = emptyList(),
                targets = setOf("ts", "js", "java")
            )
        }
        "full configuration can parse." {
            val json = """
            {
                "sourceDirectory": "source",
                "outputDirectory": "output",
                "excludes": ["foo", "bar"],
                "targets": ["ts", "js", "java"]
            }
            """.trimIndent()
            parseConfiguration(string = json) shouldBe samlang.Configuration(
                sourceDirectory = "source",
                outputDirectory = "output",
                excludes = listOf("foo", "bar"),
                targets = setOf("ts", "js", "java")
            )
        }
        "empty string does not parse." {
            shouldThrow<IllFormattedConfigurationException> { parseConfiguration(string = "") }
        }
        "bad json does not parse." {
            shouldThrow<IllFormattedConfigurationException> { parseConfiguration(string = "{") }
            shouldThrow<IllFormattedConfigurationException> { parseConfiguration(string = "}") }
        }
        "bad format does not parse." {
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "sourceDirectory": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "outputDirectory": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "excludes": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "targets": 3 }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "excludes": [3] }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "targets": [3] }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "excludes": ["3", 4] }""")
            }
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "targets": ["3", 4] }""")
            }
        }
        "bad target does not parse." {
            shouldThrow<IllFormattedConfigurationException> {
                parseConfiguration(string = """{ "targets": ["3"] }""")
            }
        }
    }
}
